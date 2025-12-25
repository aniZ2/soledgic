-- Fix critical issues found in stress testing
-- 1. Add 'voided' to transactions status check constraint
-- 2. Fix trial balance calculation
-- 3. Add missing indexes for performance

-- ============================================================================
-- FIX TRANSACTION STATUS CONSTRAINT
-- ============================================================================

-- Drop and recreate the constraint to include 'voided'
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check 
  CHECK (status IN ('draft', 'pending', 'completed', 'reconciled', 'reversed', 'voided', 'locked'));

-- ============================================================================
-- FIX TRIAL BALANCE CALCULATION
-- ============================================================================

-- Drop existing functions first to allow signature change
DROP FUNCTION IF EXISTS calculate_trial_balance(UUID, DATE);
DROP FUNCTION IF EXISTS calculate_trial_balance(UUID);
DROP FUNCTION IF EXISTS get_account_balances_raw(UUID);
DROP FUNCTION IF EXISTS verify_ledger_balanced(UUID);

-- Recreate with correct logic
CREATE OR REPLACE FUNCTION calculate_trial_balance(p_ledger_id UUID, p_as_of_date DATE DEFAULT NULL)
RETURNS TABLE (
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  debit_balance NUMERIC,
  credit_balance NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH entry_totals AS (
    SELECT 
      e.account_id,
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) as total_debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) as total_credits
    FROM entries e
    JOIN transactions t ON e.transaction_id = t.id
    WHERE t.ledger_id = p_ledger_id
      AND t.status NOT IN ('voided', 'reversed', 'draft')
      AND (p_as_of_date IS NULL OR DATE(t.created_at) <= p_as_of_date)
    GROUP BY e.account_id
  )
  SELECT 
    a.id as account_id,
    a.code as account_code,
    a.name as account_name,
    a.account_type,
    CASE 
      WHEN a.account_type IN ('asset', 'expense', 'contra_liability', 'contra_equity') 
      THEN GREATEST(0, COALESCE(et.total_debits, 0) - COALESCE(et.total_credits, 0))
      ELSE 0::NUMERIC
    END as debit_balance,
    CASE 
      WHEN a.account_type IN ('liability', 'equity', 'revenue', 'contra_asset') 
      THEN GREATEST(0, COALESCE(et.total_credits, 0) - COALESCE(et.total_debits, 0))
      WHEN a.account_type IN ('asset', 'expense') AND COALESCE(et.total_credits, 0) > COALESCE(et.total_debits, 0)
      THEN COALESCE(et.total_credits, 0) - COALESCE(et.total_debits, 0)
      ELSE 0::NUMERIC
    END as credit_balance
  FROM accounts a
  LEFT JOIN entry_totals et ON a.id = et.account_id
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true
    AND (et.total_debits > 0 OR et.total_credits > 0)
  ORDER BY a.code;
END;
$$ LANGUAGE plpgsql;

-- Raw debit/credit totals per account
CREATE OR REPLACE FUNCTION get_account_balances_raw(p_ledger_id UUID)
RETURNS TABLE (
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  total_debits NUMERIC,
  total_credits NUMERIC,
  net_balance NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as account_id,
    a.code as account_code,
    a.name as account_name,
    a.account_type,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)::NUMERIC as total_debits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)::NUMERIC as total_credits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END), 0)::NUMERIC as net_balance
  FROM accounts a
  LEFT JOIN entries e ON a.id = e.account_id
  LEFT JOIN transactions t ON e.transaction_id = t.id AND t.status NOT IN ('voided', 'reversed', 'draft')
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name, a.account_type
  HAVING COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) > 0
      OR COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) > 0
  ORDER BY a.code;
END;
$$ LANGUAGE plpgsql;

-- Quick check if ledger is balanced
CREATE OR REPLACE FUNCTION verify_ledger_balanced(p_ledger_id UUID)
RETURNS TABLE (
  total_debits NUMERIC,
  total_credits NUMERIC,
  is_balanced BOOLEAN,
  difference NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)::NUMERIC as total_debits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)::NUMERIC as total_credits,
    (COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) = 
     COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0))::BOOLEAN as is_balanced,
    ABS(COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0))::NUMERIC as difference
  FROM entries e
  JOIN transactions t ON e.transaction_id = t.id
  WHERE t.ledger_id = p_ledger_id
    AND t.status NOT IN ('voided', 'reversed', 'draft');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status) WHERE status NOT IN ('voided', 'reversed');
CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_status ON transactions(ledger_id, status);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION calculate_trial_balance IS 'Generate trial balance report with proper debit/credit placement by account type';
COMMENT ON FUNCTION get_account_balances_raw IS 'Get raw debit/credit totals per account without normalization';
COMMENT ON FUNCTION verify_ledger_balanced IS 'Quick check if total debits equal total credits for a ledger';
