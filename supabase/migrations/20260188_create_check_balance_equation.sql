CREATE OR REPLACE FUNCTION check_balance_equation(p_ledger_id UUID)
RETURNS TABLE(
  total_assets NUMERIC,
  total_liabilities NUMERIC,
  total_equity NUMERIC,
  total_revenue NUMERIC,
  total_expenses NUMERIC,
  net_income NUMERIC,
  liabilities_plus_equity NUMERIC,
  is_balanced BOOLEAN,
  difference NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_assets NUMERIC := 0;
  v_total_liabilities NUMERIC := 0;
  v_total_equity NUMERIC := 0;
  v_total_revenue NUMERIC := 0;
  v_total_expenses NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_assets
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('cash', 'accounts_receivable', 'inventory', 'prepaid_expense',
                           'fixed_asset', 'property', 'equipment');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_liabilities
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('accounts_payable', 'creator_balance', 'payee_balance',
                           'accrued_expense', 'tax_payable', 'unearned_revenue',
                           'long_term_debt', 'notes_payable', 'deferred_tax');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_equity
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('owner_equity', 'retained_earnings', 'common_stock',
                           'additional_paid_in_capital');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_revenue
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('revenue', 'platform_revenue');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_expenses
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'expense';

  RETURN QUERY SELECT
    v_total_assets,
    v_total_liabilities,
    v_total_equity,
    v_total_revenue,
    v_total_expenses,
    (v_total_revenue - v_total_expenses) as net_income,
    (v_total_liabilities + v_total_equity + v_total_revenue - v_total_expenses) as liabilities_plus_equity,
    (ABS(v_total_assets - (v_total_liabilities + v_total_equity + v_total_revenue - v_total_expenses)) < 0.01) as is_balanced,
    (v_total_assets - (v_total_liabilities + v_total_equity + v_total_revenue - v_total_expenses)) as difference;
END;
$$
