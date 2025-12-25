-- soledgic: Opening Balances & Reconciliation
-- Migration: Complete the accounting loop

-- ============================================================================
-- OPENING BALANCES
-- ============================================================================

-- Track opening balance entries (special transaction type)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check CHECK (
  transaction_type IN (
    -- Revenue
    'sale', 'payout', 'refund', 'reversal', 'fee', 'adjustment', 'transfer',
    -- Expenses
    'expense', 'owner_contribution', 'owner_draw', 'bill_payment',
    -- New
    'opening_balance'
  )
);

-- Opening balance records (one per account per ledger initialization)
CREATE TABLE opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  
  -- When these balances are as of
  as_of_date DATE NOT NULL,
  
  -- Source of opening balances
  source TEXT NOT NULL CHECK (
    source IN ('manual', 'imported', 'migrated', 'year_start')
  ),
  source_description TEXT,  -- "Migrated from QuickBooks 2024"
  
  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  
  -- Totals for quick reference
  total_assets NUMERIC(14,2),
  total_liabilities NUMERIC(14,2),
  total_equity NUMERIC(14,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opening_balances_ledger ON opening_balances(ledger_id);

ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON opening_balances
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- BANK RECONCILIATION
-- ============================================================================

-- Bank statement line items (imported from CSV or API)
CREATE TABLE bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  bank_statement_id UUID REFERENCES bank_statements(id),
  
  -- Statement data
  transaction_date DATE NOT NULL,
  post_date DATE,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,  -- Positive = deposit, negative = withdrawal
  
  -- For matching
  reference_number TEXT,
  check_number TEXT,
  merchant_name TEXT,
  category_hint TEXT,  -- From bank's categorization
  
  -- Matching status
  match_status TEXT DEFAULT 'unmatched' CHECK (
    match_status IN ('unmatched', 'matched', 'excluded', 'split')
  ),
  matched_transaction_id UUID REFERENCES transactions(id),
  matched_at TIMESTAMPTZ,
  matched_by TEXT,
  
  -- For split transactions
  split_parent_id UUID REFERENCES bank_statement_lines(id),
  
  -- Exclusion (for transfers, personal expenses)
  exclusion_reason TEXT,
  
  -- Import metadata
  import_batch_id TEXT,
  raw_data JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bank_lines_ledger ON bank_statement_lines(ledger_id);
CREATE INDEX idx_bank_lines_account ON bank_statement_lines(bank_account_id);
CREATE INDEX idx_bank_lines_date ON bank_statement_lines(ledger_id, transaction_date);
CREATE INDEX idx_bank_lines_status ON bank_statement_lines(ledger_id, match_status);
CREATE INDEX idx_bank_lines_unmatched ON bank_statement_lines(ledger_id, match_status) 
  WHERE match_status = 'unmatched';

ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON bank_statement_lines
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- Reconciliation sessions
CREATE TABLE reconciliation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  
  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Statement balances
  statement_opening_balance NUMERIC(14,2),
  statement_closing_balance NUMERIC(14,2),
  
  -- Ledger balances (at time of reconciliation)
  ledger_opening_balance NUMERIC(14,2),
  ledger_closing_balance NUMERIC(14,2),
  
  -- Reconciliation result
  difference NUMERIC(14,2),
  is_reconciled BOOLEAN DEFAULT false,
  
  -- Items
  total_statement_items INTEGER DEFAULT 0,
  matched_items INTEGER DEFAULT 0,
  unmatched_items INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'in_progress' CHECK (
    status IN ('in_progress', 'completed', 'discrepancy')
  ),
  
  -- Who and when
  started_by TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_by TEXT,
  completed_at TIMESTAMPTZ,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recon_sessions_ledger ON reconciliation_sessions(ledger_id);
CREATE INDEX idx_recon_sessions_account ON reconciliation_sessions(bank_account_id);

ALTER TABLE reconciliation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON reconciliation_sessions
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- API KEY ROLES (Lightweight Permissions)
-- ============================================================================

-- API key scopes
CREATE TABLE api_key_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- The key
  api_key TEXT UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  api_key_hash TEXT,
  
  -- Role
  role TEXT NOT NULL CHECK (
    role IN ('owner', 'accountant', 'operator', 'readonly')
  ),
  
  -- Metadata
  name TEXT NOT NULL,  -- "CPA Access", "Bookkeeper", etc.
  description TEXT,
  
  -- Permissions (explicit)
  can_write_transactions BOOLEAN DEFAULT false,
  can_close_periods BOOLEAN DEFAULT false,
  can_create_adjustments BOOLEAN DEFAULT false,
  can_export BOOLEAN DEFAULT true,
  can_view_all BOOLEAN DEFAULT true,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  
  -- Audit
  created_by TEXT,
  last_used_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_scopes_ledger ON api_key_scopes(ledger_id);
CREATE INDEX idx_api_scopes_key ON api_key_scopes(api_key) WHERE is_active = true;

ALTER TABLE api_key_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON api_key_scopes
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- Default permissions per role
CREATE OR REPLACE FUNCTION get_role_permissions(p_role TEXT)
RETURNS TABLE (
  can_write_transactions BOOLEAN,
  can_close_periods BOOLEAN,
  can_create_adjustments BOOLEAN,
  can_export BOOLEAN,
  can_view_all BOOLEAN
) AS $$
BEGIN
  RETURN QUERY SELECT
    CASE p_role
      WHEN 'owner' THEN true
      WHEN 'accountant' THEN true
      WHEN 'operator' THEN true
      WHEN 'readonly' THEN false
    END,
    CASE p_role
      WHEN 'owner' THEN true
      WHEN 'accountant' THEN true
      WHEN 'operator' THEN false
      WHEN 'readonly' THEN false
    END,
    CASE p_role
      WHEN 'owner' THEN true
      WHEN 'accountant' THEN true
      WHEN 'operator' THEN false
      WHEN 'readonly' THEN false
    END,
    CASE p_role
      WHEN 'owner' THEN true
      WHEN 'accountant' THEN true
      WHEN 'operator' THEN true
      WHEN 'readonly' THEN true
    END,
    true;  -- Everyone can view
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MATCHING FUNCTIONS
-- ============================================================================

-- Auto-match bank lines to transactions
CREATE OR REPLACE FUNCTION auto_match_bank_lines(p_ledger_id UUID, p_bank_account_id UUID)
RETURNS TABLE (
  matched_count INTEGER,
  unmatched_count INTEGER
) AS $$
DECLARE
  v_matched INTEGER := 0;
  v_line RECORD;
  v_tx_id UUID;
BEGIN
  -- Loop through unmatched bank lines
  FOR v_line IN 
    SELECT id, transaction_date, amount, description, merchant_name
    FROM bank_statement_lines
    WHERE ledger_id = p_ledger_id
      AND bank_account_id = p_bank_account_id
      AND match_status = 'unmatched'
  LOOP
    -- Try to match by amount and date (±2 days)
    SELECT t.id INTO v_tx_id
    FROM transactions t
    WHERE t.ledger_id = p_ledger_id
      AND ABS(t.amount) = ABS(v_line.amount)
      AND t.created_at::date BETWEEN v_line.transaction_date - 2 AND v_line.transaction_date + 2
      AND t.id NOT IN (
        SELECT matched_transaction_id FROM bank_statement_lines 
        WHERE matched_transaction_id IS NOT NULL
      )
    LIMIT 1;
    
    IF v_tx_id IS NOT NULL THEN
      UPDATE bank_statement_lines
      SET match_status = 'matched',
          matched_transaction_id = v_tx_id,
          matched_at = NOW(),
          matched_by = 'auto'
      WHERE id = v_line.id;
      
      v_matched := v_matched + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    v_matched,
    (SELECT COUNT(*)::integer FROM bank_statement_lines 
     WHERE ledger_id = p_ledger_id 
       AND bank_account_id = p_bank_account_id 
       AND match_status = 'unmatched');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER trigger_recon_sessions_updated
  BEFORE UPDATE ON reconciliation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_api_scopes_updated
  BEFORE UPDATE ON api_key_scopes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
