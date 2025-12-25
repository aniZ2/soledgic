CREATE OR REPLACE FUNCTION find_orphaned_entries(p_ledger_id UUID)
RETURNS TABLE(
  entry_id UUID,
  transaction_id UUID,
  account_id UUID,
  amount NUMERIC,
  entry_type TEXT,
  issue TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id as entry_id,
    e.transaction_id,
    e.account_id,
    e.amount,
    e.entry_type::TEXT,
    CASE
      WHEN t.id IS NULL THEN 'Missing transaction'
      WHEN t.ledger_id != p_ledger_id THEN 'Wrong ledger'
      WHEN t.status != 'completed' THEN 'Transaction not completed: ' || t.status
      ELSE 'Unknown issue'
    END as issue
  FROM entries e
  LEFT JOIN transactions t ON e.transaction_id = t.id
  LEFT JOIN accounts a ON e.account_id = a.id
  WHERE a.ledger_id = p_ledger_id
    AND (t.id IS NULL OR t.ledger_id != p_ledger_id OR t.status != 'completed');
END;
$$
