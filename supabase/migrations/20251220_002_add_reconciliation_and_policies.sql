-- Reconciliation Snapshots: Frozen reconciliation state per period
-- These snapshots are immutable once created and contain integrity hashes

CREATE TABLE IF NOT EXISTS reconciliation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  period_id UUID REFERENCES accounting_periods(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  snapshot_data JSONB NOT NULL,
  integrity_hash TEXT NOT NULL,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  matched_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  unmatched_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'api',
  
  CONSTRAINT unique_period_snapshot UNIQUE (ledger_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_snapshots_ledger 
  ON reconciliation_snapshots(ledger_id, period_end DESC);

-- Bank Matches: Links ledger transactions to bank records
CREATE TABLE IF NOT EXISTS bank_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  bank_transaction_id TEXT NOT NULL,
  bank_account_id TEXT,
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  matched_by TEXT DEFAULT 'api',
  status TEXT NOT NULL DEFAULT 'matched' CHECK (status IN ('matched', 'unmatched', 'disputed')),
  confidence_score NUMERIC(3,2),
  match_method TEXT DEFAULT 'manual',
  metadata JSONB DEFAULT '{}',
  
  CONSTRAINT unique_transaction_match UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_matches_ledger ON bank_matches(ledger_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_matches_bank_tx ON bank_matches(bank_transaction_id);

-- Backdated Entry Policy: Controls posting to prior periods
CREATE TABLE IF NOT EXISTS backdated_entry_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL DEFAULT 'soft' CHECK (policy_type IN ('none', 'soft', 'hard')),
  grace_period_days INTEGER DEFAULT 7,
  require_approval BOOLEAN DEFAULT false,
  approved_roles TEXT[] DEFAULT ARRAY['admin'],
  max_backdate_days INTEGER DEFAULT 30,
  allow_current_month BOOLEAN DEFAULT true,
  allow_prior_month BOOLEAN DEFAULT true,
  block_prior_quarter BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_ledger_policy UNIQUE (ledger_id)
);

-- Function to check if a backdated entry is allowed
CREATE OR REPLACE FUNCTION check_backdate_policy(
  p_ledger_id UUID,
  p_entry_date DATE
) RETURNS JSONB AS $$
DECLARE
  v_policy RECORD;
  v_days_back INTEGER;
  v_is_current_month BOOLEAN;
  v_is_prior_month BOOLEAN;
  v_is_prior_quarter BOOLEAN;
  v_result JSONB;
BEGIN
  -- Get policy
  SELECT * INTO v_policy
  FROM backdated_entry_policies
  WHERE ledger_id = p_ledger_id;
  
  -- No policy = allow everything
  IF v_policy IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_policy');
  END IF;
  
  -- Policy type 'none' = no restrictions
  IF v_policy.policy_type = 'none' THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_restrictions');
  END IF;
  
  -- Calculate days back
  v_days_back := CURRENT_DATE - p_entry_date;
  
  -- Check period restrictions
  v_is_current_month := DATE_TRUNC('month', p_entry_date) = DATE_TRUNC('month', CURRENT_DATE);
  v_is_prior_month := DATE_TRUNC('month', p_entry_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
  v_is_prior_quarter := DATE_TRUNC('quarter', p_entry_date) < DATE_TRUNC('quarter', CURRENT_DATE);
  
  -- Check if within grace period
  IF v_days_back <= v_policy.grace_period_days THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'within_grace_period', 'days_back', v_days_back);
  END IF;
  
  -- Check max backdate
  IF v_days_back > v_policy.max_backdate_days THEN
    RETURN jsonb_build_object(
      'allowed', false, 
      'reason', 'exceeds_max_backdate',
      'max_days', v_policy.max_backdate_days,
      'days_back', v_days_back
    );
  END IF;
  
  -- Check period rules
  IF v_is_current_month AND v_policy.allow_current_month THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'current_month_allowed');
  END IF;
  
  IF v_is_prior_month AND NOT v_policy.allow_prior_month THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'prior_month_blocked');
  END IF;
  
  IF v_is_prior_quarter AND v_policy.block_prior_quarter THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'prior_quarter_blocked');
  END IF;
  
  -- Check if locked period
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE ledger_id = p_ledger_id
      AND status IN ('closed', 'locked')
      AND p_entry_date BETWEEN period_start AND period_end
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'period_locked');
  END IF;
  
  -- Soft policy = warn but allow
  IF v_policy.policy_type = 'soft' THEN
    RETURN jsonb_build_object(
      'allowed', true, 
      'reason', 'soft_policy_warning',
      'warning', 'Entry is backdated beyond grace period',
      'requires_approval', v_policy.require_approval,
      'days_back', v_days_back
    );
  END IF;
  
  -- Hard policy = block without approval
  IF v_policy.policy_type = 'hard' AND v_policy.require_approval THEN
    RETURN jsonb_build_object(
      'allowed', false, 
      'reason', 'requires_approval',
      'days_back', v_days_back
    );
  END IF;
  
  RETURN jsonb_build_object('allowed', true, 'reason', 'policy_passed');
END;
$$ LANGUAGE plpgsql;

-- Frozen Statements: Read-only financial statements for locked periods
CREATE TABLE IF NOT EXISTS frozen_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES accounting_periods(id),
  statement_type TEXT NOT NULL CHECK (statement_type IN ('profit_loss', 'balance_sheet', 'trial_balance', 'cash_flow')),
  statement_data JSONB NOT NULL,
  integrity_hash TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by TEXT DEFAULT 'system',
  
  CONSTRAINT unique_period_statement UNIQUE (ledger_id, period_id, statement_type)
);

CREATE INDEX IF NOT EXISTS idx_frozen_statements_lookup 
  ON frozen_statements(ledger_id, period_id, statement_type);

-- Trigger to auto-generate frozen statements when period is locked
CREATE OR REPLACE FUNCTION auto_freeze_statements()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when status changes to 'closed' or 'locked'
  IF NEW.status IN ('closed', 'locked') AND OLD.status = 'open' THEN
    -- Insert placeholder - actual statement generation happens via Edge Function
    INSERT INTO frozen_statements (ledger_id, period_id, statement_type, statement_data, integrity_hash)
    VALUES 
      (NEW.ledger_id, NEW.id, 'trial_balance', NEW.closing_trial_balance, NEW.closing_hash),
      (NEW.ledger_id, NEW.id, 'profit_loss', '{"pending": true}'::jsonb, 'pending'),
      (NEW.ledger_id, NEW.id, 'balance_sheet', '{"pending": true}'::jsonb, 'pending')
    ON CONFLICT (ledger_id, period_id, statement_type) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_freeze_statements ON accounting_periods;
CREATE TRIGGER trigger_freeze_statements
  AFTER UPDATE ON accounting_periods
  FOR EACH ROW
  EXECUTE FUNCTION auto_freeze_statements();

-- Comments for documentation
COMMENT ON TABLE reconciliation_snapshots IS 'Immutable snapshots of bank reconciliation state per period';
COMMENT ON TABLE bank_matches IS 'Links between ledger transactions and bank statement entries';
COMMENT ON TABLE backdated_entry_policies IS 'Controls for posting entries to prior periods';
COMMENT ON TABLE frozen_statements IS 'Read-only financial statements for locked periods';
COMMENT ON FUNCTION check_backdate_policy IS 'Validates if a backdated entry is allowed per ledger policy';
