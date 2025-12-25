CREATE OR REPLACE FUNCTION diagnose_balance_sheet(p_ledger_id UUID)
RETURNS TABLE(
  category TEXT,
  account_type TEXT,
  account_name TEXT,
  debit_total NUMERIC,
  credit_total NUMERIC,
  net_balance NUMERIC,
  expected_normal TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN a.account_type IN ('cash', 'accounts_receivable', 'inventory', 'prepaid_expense', 'fixed_asset', 'property', 'equipment') THEN 'ASSET'
      WHEN a.account_type IN ('accounts_payable', 'creator_balance', 'payee_balance', 'accrued_expense', 'tax_payable', 'unearned_revenue', 'long_term_debt', 'notes_payable') THEN 'LIABILITY'
      WHEN a.account_type IN ('owner_equity', 'retained_earnings', 'common_stock', 'additional_paid_in_capital') THEN 'EQUITY'
      WHEN a.account_type IN ('revenue', 'platform_revenue') THEN 'REVENUE'
      WHEN a.account_type = 'expense' THEN 'EXPENSE'
      ELSE 'OTHER'
    END as category,
    a.account_type::TEXT,
    a.name::TEXT,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) as debit_total,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) as credit_total,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END), 0) as net_balance,
    CASE
      WHEN a.account_type IN ('cash', 'accounts_receivable', 'inventory', 'prepaid_expense', 'fixed_asset', 'property', 'equipment', 'expense') THEN 'DEBIT'
      ELSE 'CREDIT'
    END as expected_normal
  FROM accounts a
  LEFT JOIN entries e ON e.account_id = a.id
  LEFT JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
  GROUP BY a.account_type, a.name, a.id
  ORDER BY category, account_type, a.name;
END;
$$
