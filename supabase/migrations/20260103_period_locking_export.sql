-- soledgic: Period Locking & Compliance Export
-- Lock accounting periods and generate audit-ready exports

-- ============================================================================
-- ACCOUNTING PERIODS
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Period definition
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_name TEXT,                       -- 'January 2025', 'Q1 2025', 'FY 2024'
  period_type TEXT DEFAULT 'month' CHECK (period_type IN ('month', 'quarter', 'year', 'custom')),
  
  -- Lock status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'soft_locked', 'locked')),
  -- open: Normal operations
  -- soft_locked: Warning on changes, but allowed
  -- locked: No changes allowed
  
  -- Lock details
  locked_at TIMESTAMPTZ,
  locked_by UUID,
  locked_by_name TEXT,
  lock_reason TEXT,
  
  -- Unlock (for corrections)
  unlock_requested_at TIMESTAMPTZ,
  unlock_requested_by UUID,
  unlock_reason TEXT,
  unlocked_at TIMESTAMPTZ,
  
  -- Period metrics (cached for performance)
  transaction_count INTEGER DEFAULT 0,
  total_revenue NUMERIC(14,2) DEFAULT 0,
  total_expenses NUMERIC(14,2) DEFAULT 0,
  net_income NUMERIC(14,2) DEFAULT 0,
  
  -- Closing balances snapshot
  closing_balances JSONB,                 -- Snapshot of all account balances at period end
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, period_start, period_end),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_ledger ON accounting_periods(ledger_id);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_dates ON accounting_periods(ledger_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_status ON accounting_periods(ledger_id, status);

-- ============================================================================
-- PREVENT CHANGES TO LOCKED PERIODS
-- ============================================================================

CREATE OR REPLACE FUNCTION check_period_lock()
RETURNS TRIGGER AS $$
DECLARE
  v_period RECORD;
  v_tx_date DATE;
BEGIN
  -- Get transaction date
  IF TG_TABLE_NAME = 'transactions' THEN
    v_tx_date := COALESCE(NEW.created_at::date, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'entries' THEN
    SELECT t.created_at::date INTO v_tx_date
    FROM transactions t
    WHERE t.id = NEW.transaction_id;
  END IF;
  
  -- Check if date falls in a locked period
  SELECT * INTO v_period
  FROM accounting_periods
  WHERE ledger_id = NEW.ledger_id
    AND v_tx_date BETWEEN period_start AND period_end
    AND status = 'locked';
  
  IF v_period IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot modify transactions in locked period: % to %', 
      v_period.period_start, v_period.period_end;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_transaction_period_lock ON transactions;
CREATE TRIGGER trigger_check_transaction_period_lock
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION check_period_lock();

-- ============================================================================
-- LOCK PERIOD FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION lock_accounting_period(
  p_ledger_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_locked_by_name TEXT DEFAULT 'System',
  p_lock_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_period_id UUID;
  v_tx_count INTEGER;
  v_revenue NUMERIC(14,2);
  v_expenses NUMERIC(14,2);
  v_balances JSONB;
BEGIN
  -- Calculate period metrics
  SELECT 
    COUNT(*),
    COALESCE(SUM(amount) FILTER (WHERE transaction_type IN ('sale', 'income')), 0),
    COALESCE(SUM(amount) FILTER (WHERE transaction_type IN ('expense', 'payout', 'fee')), 0)
  INTO v_tx_count, v_revenue, v_expenses
  FROM transactions
  WHERE ledger_id = p_ledger_id
    AND created_at::date BETWEEN p_period_start AND p_period_end
    AND status = 'completed';
  
  -- Snapshot account balances
  SELECT jsonb_object_agg(
    a.id::text,
    jsonb_build_object(
      'name', a.name,
      'account_type', a.account_type,
      'balance', COALESCE(
        (SELECT SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END)
         FROM entries e
         JOIN transactions t ON e.transaction_id = t.id
         WHERE e.account_id = a.id
           AND t.created_at::date <= p_period_end),
        0
      )
    )
  ) INTO v_balances
  FROM accounts a
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true;
  
  -- Create or update period record
  INSERT INTO accounting_periods (
    ledger_id,
    period_start,
    period_end,
    period_name,
    status,
    locked_at,
    locked_by_name,
    lock_reason,
    transaction_count,
    total_revenue,
    total_expenses,
    net_income,
    closing_balances
  ) VALUES (
    p_ledger_id,
    p_period_start,
    p_period_end,
    TO_CHAR(p_period_start, 'Month YYYY'),
    'locked',
    NOW(),
    p_locked_by_name,
    p_lock_reason,
    v_tx_count,
    v_revenue,
    v_expenses,
    v_revenue - v_expenses,
    v_balances
  )
  ON CONFLICT (ledger_id, period_start, period_end) DO UPDATE
  SET status = 'locked',
      locked_at = NOW(),
      locked_by_name = p_locked_by_name,
      lock_reason = p_lock_reason,
      transaction_count = v_tx_count,
      total_revenue = v_revenue,
      total_expenses = v_expenses,
      net_income = v_revenue - v_expenses,
      closing_balances = v_balances,
      updated_at = NOW()
  RETURNING id INTO v_period_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'period_id', v_period_id,
    'period', p_period_start || ' to ' || p_period_end,
    'transaction_count', v_tx_count,
    'revenue', v_revenue,
    'expenses', v_expenses,
    'net_income', v_revenue - v_expenses
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UNLOCK PERIOD (with audit trail)
-- ============================================================================

CREATE OR REPLACE FUNCTION unlock_accounting_period(
  p_ledger_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_unlock_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_period RECORD;
BEGIN
  SELECT * INTO v_period
  FROM accounting_periods
  WHERE ledger_id = p_ledger_id
    AND period_start = p_period_start
    AND period_end = p_period_end;
  
  IF v_period IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Period not found');
  END IF;
  
  IF v_period.status != 'locked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Period is not locked');
  END IF;
  
  UPDATE accounting_periods
  SET status = 'open',
      unlocked_at = NOW(),
      unlock_reason = p_unlock_reason,
      updated_at = NOW()
  WHERE id = v_period.id;
  
  -- Log to audit
  INSERT INTO audit_log (
    ledger_id,
    action,
    entity_type,
    entity_id,
    actor_type,
    details
  ) VALUES (
    p_ledger_id,
    'period_unlock',
    'accounting_period',
    v_period.id,
    'user',
    jsonb_build_object(
      'period', p_period_start || ' to ' || p_period_end,
      'reason', p_unlock_reason,
      'previously_locked_at', v_period.locked_at
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'period_id', v_period.id,
    'message', 'Period unlocked. All changes will be logged.'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CPA EXPORT: TRIAL BALANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION export_trial_balance(
  p_ledger_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  account_name TEXT,
  account_type TEXT,
  debit_balance NUMERIC(14,2),
  credit_balance NUMERIC(14,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.name as account_name,
    a.account_type,
    CASE 
      WHEN SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) > 
           SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)
      THEN SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) - 
           SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)
      ELSE 0
    END as debit_balance,
    CASE 
      WHEN SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) > 
           SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END)
      THEN SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) - 
           SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END)
      ELSE 0
    END as credit_balance
  FROM accounts a
  LEFT JOIN entries e ON a.id = e.account_id
  LEFT JOIN transactions t ON e.transaction_id = t.id AND t.created_at::date <= p_as_of_date
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true
  GROUP BY a.id, a.name, a.account_type
  HAVING SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) > 0
      OR SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) > 0
  ORDER BY 
    CASE a.account_type
      WHEN 'cash' THEN 1
      WHEN 'accounts_receivable' THEN 2
      WHEN 'inventory' THEN 3
      WHEN 'fixed_asset' THEN 4
      WHEN 'accounts_payable' THEN 5
      WHEN 'creator_balance' THEN 6
      WHEN 'reserve' THEN 7
      WHEN 'equity' THEN 8
      WHEN 'revenue' THEN 9
      WHEN 'platform_revenue' THEN 10
      WHEN 'expense' THEN 11
      WHEN 'processing_fees' THEN 12
      ELSE 99
    END,
    a.name;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CPA EXPORT: GENERAL LEDGER
-- ============================================================================

CREATE OR REPLACE FUNCTION export_general_ledger(
  p_ledger_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  transaction_date TIMESTAMPTZ,
  transaction_id UUID,
  transaction_type TEXT,
  description TEXT,
  reference_id TEXT,
  account_name TEXT,
  debit NUMERIC(14,2),
  credit NUMERIC(14,2),
  running_balance NUMERIC(14,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.created_at as transaction_date,
    t.id as transaction_id,
    t.transaction_type,
    t.description,
    t.reference_id,
    a.name as account_name,
    CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE NULL END as debit,
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE NULL END as credit,
    SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END) 
      OVER (PARTITION BY a.id ORDER BY t.created_at, t.id) as running_balance
  FROM transactions t
  JOIN entries e ON t.id = e.transaction_id
  JOIN accounts a ON e.account_id = a.id
  WHERE t.ledger_id = p_ledger_id
    AND t.created_at::date BETWEEN p_start_date AND p_end_date
    AND t.status = 'completed'
  ORDER BY t.created_at, t.id, a.name;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CPA EXPORT: PROFIT & LOSS
-- ============================================================================

CREATE OR REPLACE FUNCTION export_profit_loss(
  p_ledger_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  category TEXT,
  account_name TEXT,
  amount NUMERIC(14,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH account_totals AS (
    SELECT 
      a.account_type,
      a.name,
      SUM(CASE 
        WHEN e.entry_type = 'credit' AND a.account_type IN ('revenue', 'platform_revenue', 'other_income') THEN e.amount
        WHEN e.entry_type = 'debit' AND a.account_type IN ('expense', 'processing_fees', 'cost_of_goods') THEN e.amount
        ELSE 0
      END) as total
    FROM accounts a
    LEFT JOIN entries e ON a.id = e.account_id
    LEFT JOIN transactions t ON e.transaction_id = t.id
    WHERE a.ledger_id = p_ledger_id
      AND t.created_at::date BETWEEN p_start_date AND p_end_date
      AND t.status = 'completed'
      AND a.account_type IN ('revenue', 'platform_revenue', 'other_income', 'expense', 'processing_fees', 'cost_of_goods')
    GROUP BY a.account_type, a.name
    HAVING SUM(CASE 
      WHEN e.entry_type = 'credit' AND a.account_type IN ('revenue', 'platform_revenue', 'other_income') THEN e.amount
      WHEN e.entry_type = 'debit' AND a.account_type IN ('expense', 'processing_fees', 'cost_of_goods') THEN e.amount
      ELSE 0
    END) > 0
  )
  SELECT 
    CASE 
      WHEN account_type IN ('revenue', 'platform_revenue', 'other_income') THEN 'REVENUE'
      ELSE 'EXPENSES'
    END as category,
    name as account_name,
    total as amount
  FROM account_totals
  ORDER BY 
    CASE WHEN account_type IN ('revenue', 'platform_revenue', 'other_income') THEN 1 ELSE 2 END,
    total DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CPA EXPORT: 1099 SUMMARY
-- ============================================================================

CREATE OR REPLACE FUNCTION export_1099_summary(
  p_ledger_id UUID,
  p_tax_year INTEGER
)
RETURNS TABLE (
  entity_id TEXT,
  entity_name TEXT,
  total_paid NUMERIC(14,2),
  requires_1099 BOOLEAN,
  w9_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.entity_id,
    a.name as entity_name,
    COALESCE(SUM(e.amount) FILTER (WHERE e.entry_type = 'debit'), 0) as total_paid,
    COALESCE(SUM(e.amount) FILTER (WHERE e.entry_type = 'debit'), 0) >= 600 as requires_1099,
    COALESCE(a.metadata->>'w9_status', 'unknown') as w9_status
  FROM accounts a
  LEFT JOIN entries e ON a.id = e.account_id
  LEFT JOIN transactions t ON e.transaction_id = t.id
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'creator_balance'
    AND a.entity_type IN ('creator', 'contractor')
    AND EXTRACT(YEAR FROM t.created_at) = p_tax_year
    AND t.transaction_type = 'payout'
    AND t.status = 'completed'
  GROUP BY a.entity_id, a.name, a.metadata->>'w9_status'
  HAVING COALESCE(SUM(e.amount) FILTER (WHERE e.entry_type = 'debit'), 0) > 0
  ORDER BY total_paid DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FULL CPA EXPORT PACKAGE
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_cpa_export(
  p_ledger_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_trial_balance JSONB;
  v_pnl JSONB;
  v_summary JSONB;
BEGIN
  -- Trial Balance
  SELECT jsonb_agg(row_to_json(tb))
  INTO v_trial_balance
  FROM export_trial_balance(p_ledger_id, p_end_date) tb;
  
  -- P&L
  SELECT jsonb_agg(row_to_json(pl))
  INTO v_pnl
  FROM export_profit_loss(p_ledger_id, p_start_date, p_end_date) pl;
  
  -- Summary stats
  SELECT jsonb_build_object(
    'transaction_count', COUNT(*),
    'total_volume', SUM(amount),
    'unique_accounts', COUNT(DISTINCT e.account_id)
  )
  INTO v_summary
  FROM transactions t
  JOIN entries e ON t.id = e.transaction_id
  WHERE t.ledger_id = p_ledger_id
    AND t.created_at::date BETWEEN p_start_date AND p_end_date
    AND t.status = 'completed';
  
  RETURN jsonb_build_object(
    'generated_at', NOW(),
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'summary', v_summary,
    'trial_balance', COALESCE(v_trial_balance, '[]'::jsonb),
    'profit_loss', COALESCE(v_pnl, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger isolation" ON accounting_periods;
CREATE POLICY "Ledger isolation" ON accounting_periods
  FOR ALL USING (ledger_id = current_setting('app.current_ledger_id', true)::uuid);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_accounting_periods_updated ON accounting_periods;
CREATE TRIGGER trigger_accounting_periods_updated
  BEFORE UPDATE ON accounting_periods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
