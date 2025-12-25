CREATE OR REPLACE FUNCTION find_imbalanced_transactions(p_ledger_id UUID)
RETURNS TABLE(
  transaction_id UUID,
  transaction_type TEXT,
  description TEXT,
  created_at TIMESTAMPTZ,
  total_debits NUMERIC,
  total_credits NUMERIC,
  imbalance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as transaction_id,
    t.transaction_type::TEXT,
    t.description::TEXT,
    t.created_at,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) as total_debits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) as total_credits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END), 0) as imbalance
  FROM transactions t
  LEFT JOIN entries e ON e.transaction_id = t.id
  WHERE t.ledger_id = p_ledger_id
    AND t.status = 'completed'
  GROUP BY t.id, t.transaction_type, t.description, t.created_at
  HAVING ABS(COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) -
             COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)) > 0.001
  ORDER BY t.created_at DESC;
END;
$$
