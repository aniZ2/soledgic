-- soledgic: Bank Reconciliation Engine
-- Match external bank transactions to internal ledger entries

-- ============================================================================
-- BANK CONNECTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Provider info
  provider TEXT NOT NULL CHECK (provider IN ('plaid', 'stripe', 'manual')),
  provider_account_id TEXT,           -- Plaid account_id or Stripe bank account
  provider_institution_id TEXT,       -- Bank institution ID
  
  -- Account details
  account_name TEXT NOT NULL,
  account_type TEXT CHECK (account_type IN ('checking', 'savings', 'credit_card', 'other')),
  account_mask TEXT,                  -- Last 4 digits
  institution_name TEXT,
  
  -- Link to internal account
  linked_account_id UUID REFERENCES accounts(id),
  
  -- Sync status
  last_sync_at TIMESTAMPTZ,
  sync_cursor TEXT,                   -- Plaid cursor for incremental sync
  sync_status TEXT DEFAULT 'active' CHECK (sync_status IN ('active', 'error', 'disconnected')),
  sync_error TEXT,
  
  -- Balance tracking
  current_balance NUMERIC(14,2),
  available_balance NUMERIC(14,2),
  balance_updated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_connections_ledger ON bank_connections(ledger_id);

-- ============================================================================
-- BANK TRANSACTIONS (External feed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  bank_connection_id UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  
  -- External reference
  provider_transaction_id TEXT NOT NULL,  -- Plaid/Stripe transaction ID
  
  -- Transaction details
  amount NUMERIC(14,2) NOT NULL,          -- Positive = credit, Negative = debit
  currency TEXT DEFAULT 'USD',
  transaction_date DATE NOT NULL,
  posted_date DATE,
  
  -- Description
  name TEXT,                              -- Merchant/counterparty name
  merchant_name TEXT,                     -- Cleaned merchant name
  category TEXT[],                        -- Plaid categories
  
  -- Reconciliation
  reconciliation_status TEXT DEFAULT 'unmatched' CHECK (
    reconciliation_status IN ('unmatched', 'matched', 'excluded', 'manual_match')
  ),
  matched_transaction_id UUID REFERENCES transactions(id),
  matched_at TIMESTAMPTZ,
  matched_by TEXT,                        -- 'auto', 'user', 'rule'
  match_confidence NUMERIC(3,2),          -- 0.00 to 1.00
  
  -- Exclusion
  excluded_reason TEXT,                   -- 'transfer', 'duplicate', 'personal', etc.
  
  -- Raw data
  raw_data JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(bank_connection_id, provider_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_ledger ON bank_transactions(ledger_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_status ON bank_transactions(ledger_id, reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(ledger_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_unmatched ON bank_transactions(ledger_id, reconciliation_status) 
  WHERE reconciliation_status = 'unmatched';

-- ============================================================================
-- RECONCILIATION PERIODS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  bank_connection_id UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  
  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Opening/Closing balances
  statement_opening_balance NUMERIC(14,2),
  statement_closing_balance NUMERIC(14,2),
  
  -- Calculated balances
  ledger_opening_balance NUMERIC(14,2),
  ledger_closing_balance NUMERIC(14,2),
  
  -- Reconciliation status
  status TEXT DEFAULT 'in_progress' CHECK (
    status IN ('in_progress', 'reconciled', 'discrepancy')
  ),
  
  -- Discrepancy tracking
  discrepancy_amount NUMERIC(14,2),
  discrepancy_notes TEXT,
  
  -- Completion
  reconciled_at TIMESTAMPTZ,
  reconciled_by UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(bank_connection_id, period_start, period_end)
);

-- ============================================================================
-- MATCHING RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Rule definition
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 100,           -- Lower = higher priority
  is_active BOOLEAN DEFAULT true,
  
  -- Match conditions (JSONB for flexibility)
  conditions JSONB NOT NULL,
  /* Example conditions:
  {
    "merchant_contains": "STRIPE",
    "amount_range": [0, 1000],
    "category_includes": "Payment"
  }
  */
  
  -- Action
  action TEXT NOT NULL CHECK (action IN ('match', 'exclude', 'categorize')),
  action_params JSONB DEFAULT '{}',
  /* Example action_params for 'match':
  { "match_type": "sale", "reference_pattern": "pi_.*" }
  
  For 'exclude':
  { "reason": "internal_transfer" }
  
  For 'categorize':
  { "expense_category": "processing_fees" }
  */
  
  -- Stats
  times_applied INTEGER DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_rules_ledger ON reconciliation_rules(ledger_id, is_active, priority);

-- ============================================================================
-- AUTO-MATCHING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_match_bank_transaction(
  p_bank_transaction_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_bank_tx RECORD;
  v_match RECORD;
  v_confidence NUMERIC(3,2);
  v_result JSONB;
BEGIN
  -- Get bank transaction
  SELECT * INTO v_bank_tx 
  FROM bank_transactions 
  WHERE id = p_bank_transaction_id;
  
  IF v_bank_tx IS NULL THEN
    RETURN jsonb_build_object('matched', false, 'reason', 'Bank transaction not found');
  END IF;
  
  IF v_bank_tx.reconciliation_status != 'unmatched' THEN
    RETURN jsonb_build_object('matched', false, 'reason', 'Already processed');
  END IF;
  
  -- Strategy 1: Exact reference_id match (highest confidence)
  SELECT t.* INTO v_match
  FROM transactions t
  WHERE t.ledger_id = v_bank_tx.ledger_id
    AND t.status = 'completed'
    AND ABS(t.amount - ABS(v_bank_tx.amount)) < 0.01
    AND t.reference_id IS NOT NULL
    AND (
      v_bank_tx.name ILIKE '%' || t.reference_id || '%'
      OR v_bank_tx.raw_data::text ILIKE '%' || t.reference_id || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM bank_transactions bt 
      WHERE bt.matched_transaction_id = t.id
    )
  LIMIT 1;
  
  IF v_match IS NOT NULL THEN
    v_confidence := 0.95;
    
    UPDATE bank_transactions
    SET reconciliation_status = 'matched',
        matched_transaction_id = v_match.id,
        matched_at = NOW(),
        matched_by = 'auto',
        match_confidence = v_confidence
    WHERE id = p_bank_transaction_id;
    
    RETURN jsonb_build_object(
      'matched', true,
      'transaction_id', v_match.id,
      'confidence', v_confidence,
      'strategy', 'reference_id'
    );
  END IF;
  
  -- Strategy 2: Amount + Date match (medium confidence)
  SELECT t.* INTO v_match
  FROM transactions t
  WHERE t.ledger_id = v_bank_tx.ledger_id
    AND t.status = 'completed'
    AND ABS(t.amount - ABS(v_bank_tx.amount)) < 0.01
    AND t.created_at::date BETWEEN (v_bank_tx.transaction_date - INTERVAL '3 days')::date 
                                AND (v_bank_tx.transaction_date + INTERVAL '3 days')::date
    AND NOT EXISTS (
      SELECT 1 FROM bank_transactions bt 
      WHERE bt.matched_transaction_id = t.id
    )
  ORDER BY ABS(t.created_at::date - v_bank_tx.transaction_date) ASC
  LIMIT 1;
  
  IF v_match IS NOT NULL THEN
    -- Calculate confidence based on date proximity
    v_confidence := 0.70 - (ABS(v_match.created_at::date - v_bank_tx.transaction_date) * 0.05);
    
    -- Only auto-match if confidence > 0.6
    IF v_confidence >= 0.60 THEN
      UPDATE bank_transactions
      SET reconciliation_status = 'matched',
          matched_transaction_id = v_match.id,
          matched_at = NOW(),
          matched_by = 'auto',
          match_confidence = v_confidence
      WHERE id = p_bank_transaction_id;
      
      RETURN jsonb_build_object(
        'matched', true,
        'transaction_id', v_match.id,
        'confidence', v_confidence,
        'strategy', 'amount_date'
      );
    ELSE
      RETURN jsonb_build_object(
        'matched', false,
        'reason', 'Low confidence match available',
        'suggested_transaction_id', v_match.id,
        'confidence', v_confidence
      );
    END IF;
  END IF;
  
  RETURN jsonb_build_object('matched', false, 'reason', 'No match found');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- BATCH AUTO-MATCH
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_match_all_unmatched(p_ledger_id UUID)
RETURNS TABLE (
  total_processed INTEGER,
  matched INTEGER,
  unmatched INTEGER
) AS $$
DECLARE
  v_total INTEGER := 0;
  v_matched INTEGER := 0;
  v_tx RECORD;
  v_result JSONB;
BEGIN
  FOR v_tx IN
    SELECT id FROM bank_transactions
    WHERE ledger_id = p_ledger_id
      AND reconciliation_status = 'unmatched'
    ORDER BY transaction_date DESC
  LOOP
    v_total := v_total + 1;
    v_result := auto_match_bank_transaction(v_tx.id);
    
    IF (v_result->>'matched')::boolean THEN
      v_matched := v_matched + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_total, v_matched, v_total - v_matched;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MANUAL MATCH/UNMATCH
-- ============================================================================

CREATE OR REPLACE FUNCTION manual_match_transaction(
  p_bank_transaction_id UUID,
  p_ledger_transaction_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify both exist and belong to same ledger
  IF NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    JOIN transactions t ON bt.ledger_id = t.ledger_id
    WHERE bt.id = p_bank_transaction_id
      AND t.id = p_ledger_transaction_id
  ) THEN
    RAISE EXCEPTION 'Invalid transaction IDs or ledger mismatch';
  END IF;
  
  UPDATE bank_transactions
  SET reconciliation_status = 'manual_match',
      matched_transaction_id = p_ledger_transaction_id,
      matched_at = NOW(),
      matched_by = 'user',
      match_confidence = 1.00
  WHERE id = p_bank_transaction_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION unmatch_transaction(p_bank_transaction_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE bank_transactions
  SET reconciliation_status = 'unmatched',
      matched_transaction_id = NULL,
      matched_at = NULL,
      matched_by = NULL,
      match_confidence = NULL
  WHERE id = p_bank_transaction_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RECONCILIATION SUMMARY VIEW
-- ============================================================================

CREATE OR REPLACE VIEW reconciliation_summary AS
SELECT 
  bt.ledger_id,
  bc.account_name,
  DATE_TRUNC('month', bt.transaction_date) as month,
  COUNT(*) as total_transactions,
  COUNT(*) FILTER (WHERE bt.reconciliation_status = 'matched') as matched,
  COUNT(*) FILTER (WHERE bt.reconciliation_status = 'manual_match') as manual_matched,
  COUNT(*) FILTER (WHERE bt.reconciliation_status = 'unmatched') as unmatched,
  COUNT(*) FILTER (WHERE bt.reconciliation_status = 'excluded') as excluded,
  SUM(bt.amount) FILTER (WHERE bt.amount > 0) as total_credits,
  SUM(ABS(bt.amount)) FILTER (WHERE bt.amount < 0) as total_debits,
  ROUND(
    (COUNT(*) FILTER (WHERE bt.reconciliation_status IN ('matched', 'manual_match', 'excluded'))::numeric 
    / NULLIF(COUNT(*), 0) * 100), 
    1
  ) as reconciliation_percent
FROM bank_transactions bt
JOIN bank_connections bc ON bt.bank_connection_id = bc.id
GROUP BY bt.ledger_id, bc.account_name, DATE_TRUNC('month', bt.transaction_date)
ORDER BY month DESC;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger isolation" ON bank_connections;
CREATE POLICY "Ledger isolation" ON bank_connections
  FOR ALL USING (ledger_id = current_setting('app.current_ledger_id', true)::uuid);

DROP POLICY IF EXISTS "Ledger isolation" ON bank_transactions;
CREATE POLICY "Ledger isolation" ON bank_transactions
  FOR ALL USING (ledger_id = current_setting('app.current_ledger_id', true)::uuid);

DROP POLICY IF EXISTS "Ledger isolation" ON reconciliation_periods;
CREATE POLICY "Ledger isolation" ON reconciliation_periods
  FOR ALL USING (ledger_id = current_setting('app.current_ledger_id', true)::uuid);

DROP POLICY IF EXISTS "Ledger isolation" ON reconciliation_rules;
CREATE POLICY "Ledger isolation" ON reconciliation_rules
  FOR ALL USING (ledger_id = current_setting('app.current_ledger_id', true)::uuid);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_bank_connections_updated ON bank_connections;
CREATE TRIGGER trigger_bank_connections_updated
  BEFORE UPDATE ON bank_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_reconciliation_periods_updated ON reconciliation_periods;
CREATE TRIGGER trigger_reconciliation_periods_updated
  BEFORE UPDATE ON reconciliation_periods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_reconciliation_rules_updated ON reconciliation_rules;
CREATE TRIGGER trigger_reconciliation_rules_updated
  BEFORE UPDATE ON reconciliation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
