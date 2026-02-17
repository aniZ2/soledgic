-- Soledgic: bank_aggregator Bank Feed Integration
-- Auto-sync bank transactions via bank_aggregator

-- ============================================================================
-- bank_aggregator CONNECTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_aggregator_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- bank_aggregator identifiers
  item_id TEXT NOT NULL,
  access_token TEXT NOT NULL, -- Encrypted in production
  institution_id TEXT,
  institution_name TEXT,
  
  -- Connection status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'error', 'disconnected')),
  error_code TEXT,
  error_message TEXT,
  
  -- Sync tracking
  last_sync_at TIMESTAMPTZ,
  cursor TEXT, -- bank_aggregator sync cursor for incremental updates
  
  -- Linked accounts
  accounts JSONB DEFAULT '[]'::jsonb, -- Array of bank_aggregator account objects
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, item_id)
);

CREATE INDEX idx_bank_aggregator_connections_ledger ON bank_aggregator_connections(ledger_id);
CREATE INDEX idx_bank_aggregator_connections_status ON bank_aggregator_connections(status) WHERE status = 'active';

-- ============================================================================
-- bank_aggregator TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_aggregator_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES bank_aggregator_connections(id) ON DELETE CASCADE,
  
  -- bank_aggregator transaction data
  bank_aggregator_transaction_id TEXT NOT NULL,
  bank_aggregator_account_id TEXT NOT NULL,
  
  -- Transaction details
  amount NUMERIC(15,2) NOT NULL, -- Positive = outflow, Negative = inflow (bank_aggregator convention)
  date DATE NOT NULL,
  name TEXT NOT NULL,
  merchant_name TEXT,
  category TEXT[],
  pending BOOLEAN DEFAULT false,
  
  -- Matching
  matched_transaction_id UUID REFERENCES transactions(id),
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'excluded', 'auto_matched')),
  match_confidence NUMERIC(3,2), -- 0.00 to 1.00
  
  -- Metadata
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, bank_aggregator_transaction_id)
);

CREATE INDEX idx_bank_aggregator_txns_ledger ON bank_aggregator_transactions(ledger_id);
CREATE INDEX idx_bank_aggregator_txns_unmatched ON bank_aggregator_transactions(ledger_id, match_status) WHERE match_status = 'unmatched';
CREATE INDEX idx_bank_aggregator_txns_date ON bank_aggregator_transactions(ledger_id, date);

-- ============================================================================
-- AUTO-MATCH RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS auto_match_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Matching criteria (all conditions must match)
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {
  --   "merchant_contains": "processor",
  --   "amount_min": 0,
  --   "amount_max": 10000,
  --   "category_includes": ["Transfer", "Payment"]
  -- }
  
  -- Action
  action TEXT NOT NULL CHECK (action IN ('match_by_amount', 'match_by_reference', 'categorize', 'exclude')),
  action_config JSONB DEFAULT '{}'::jsonb,
  -- Example for categorize: { "account_type": "processing_fees" }
  
  priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_match_rules_ledger ON auto_match_rules(ledger_id) WHERE is_active = true;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Auto-match a single bank_aggregator transaction
CREATE OR REPLACE FUNCTION auto_match_bank_aggregator_transaction(p_bank_aggregator_txn_id UUID)
RETURNS TABLE (matched BOOLEAN, match_type TEXT, matched_transaction_id UUID) AS $$
DECLARE
  v_bank_aggregator_txn bank_aggregator_transactions;
  v_rule auto_match_rules;
  v_match_id UUID;
BEGIN
  -- Get the bank_aggregator transaction
  SELECT * INTO v_bank_aggregator_txn FROM bank_aggregator_transactions WHERE id = p_bank_aggregator_txn_id;
  
  IF v_bank_aggregator_txn IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Try each rule in priority order
  FOR v_rule IN 
    SELECT * FROM auto_match_rules 
    WHERE ledger_id = v_bank_aggregator_txn.ledger_id 
      AND is_active = true 
    ORDER BY priority
  LOOP
    -- Check if conditions match
    IF check_auto_match_conditions(v_bank_aggregator_txn, v_rule.conditions) THEN
      
      CASE v_rule.action
        WHEN 'match_by_amount' THEN
          -- Find transaction with same amount on same day
          SELECT t.id INTO v_match_id
          FROM transactions t
          WHERE t.ledger_id = v_bank_aggregator_txn.ledger_id
            AND ABS(t.amount - ABS(v_bank_aggregator_txn.amount)) < 0.01
            AND DATE(t.created_at) BETWEEN v_bank_aggregator_txn.date - INTERVAL '3 days' AND v_bank_aggregator_txn.date + INTERVAL '3 days'
            AND t.status NOT IN ('voided', 'reversed')
            AND NOT EXISTS (
              SELECT 1 FROM bank_aggregator_transactions pt 
              WHERE pt.matched_transaction_id = t.id AND pt.id != p_bank_aggregator_txn_id
            )
          LIMIT 1;
          
          IF v_match_id IS NOT NULL THEN
            UPDATE bank_aggregator_transactions 
            SET matched_transaction_id = v_match_id, 
                match_status = 'auto_matched',
                match_confidence = 0.85
            WHERE id = p_bank_aggregator_txn_id;
            
            RETURN QUERY SELECT true, 'amount_match'::TEXT, v_match_id;
            RETURN;
          END IF;
          
        WHEN 'exclude' THEN
          UPDATE bank_aggregator_transactions 
          SET match_status = 'excluded'
          WHERE id = p_bank_aggregator_txn_id;
          
          RETURN QUERY SELECT true, 'excluded'::TEXT, NULL::UUID;
          RETURN;
          
        ELSE
          -- Other actions not implemented yet
          NULL;
      END CASE;
      
    END IF;
  END LOOP;
  
  -- No match found
  RETURN QUERY SELECT false, 'no_match'::TEXT, NULL::UUID;
END;
$$ LANGUAGE plpgsql;

-- Helper: Check if conditions match
CREATE OR REPLACE FUNCTION check_auto_match_conditions(p_txn bank_aggregator_transactions, p_conditions JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Merchant contains
  IF p_conditions ? 'merchant_contains' THEN
    IF p_txn.merchant_name IS NULL OR 
       UPPER(p_txn.merchant_name) NOT LIKE '%' || UPPER(p_conditions->>'merchant_contains') || '%' THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Amount range
  IF p_conditions ? 'amount_min' THEN
    IF ABS(p_txn.amount) < (p_conditions->>'amount_min')::NUMERIC THEN
      RETURN false;
    END IF;
  END IF;
  
  IF p_conditions ? 'amount_max' THEN
    IF ABS(p_txn.amount) > (p_conditions->>'amount_max')::NUMERIC THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Name contains
  IF p_conditions ? 'name_contains' THEN
    IF UPPER(p_txn.name) NOT LIKE '%' || UPPER(p_conditions->>'name_contains') || '%' THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE bank_aggregator_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_aggregator_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_match_rules ENABLE ROW LEVEL SECURITY;

-- Via API key
CREATE POLICY "bank_aggregator connections via API key"
  ON bank_aggregator_connections FOR ALL
  USING (ledger_id IN (SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'));

CREATE POLICY "bank_aggregator transactions via API key"
  ON bank_aggregator_transactions FOR ALL
  USING (ledger_id IN (SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'));

CREATE POLICY "Auto match rules via API key"
  ON auto_match_rules FOR ALL
  USING (ledger_id IN (SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE bank_aggregator_connections IS 'bank_aggregator Link connections for bank account syncing';
COMMENT ON TABLE bank_aggregator_transactions IS 'Bank transactions imported from bank_aggregator';
COMMENT ON TABLE auto_match_rules IS 'Rules for automatically matching bank transactions';
COMMENT ON FUNCTION auto_match_bank_aggregator_transaction IS 'Attempt to auto-match a bank_aggregator transaction using rules';
