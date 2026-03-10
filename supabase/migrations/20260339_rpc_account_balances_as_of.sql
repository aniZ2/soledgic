-- Compute per-account balances as of a given date, entirely in SQL.
-- Replaces client-side entry aggregation that hit PostgREST's 1000-row limit.
CREATE OR REPLACE FUNCTION public.account_balances_as_of(
  p_ledger_id UUID,
  p_as_of_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  account_type TEXT,
  entity_type TEXT,
  balance NUMERIC(14,2)
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    a.id AS account_id,
    a.name AS account_name,
    a.account_type,
    a.entity_type,
    COALESCE(SUM(
      CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
    ), 0)::NUMERIC(14,2) AS balance
  FROM public.accounts a
  LEFT JOIN public.entries e ON e.account_id = a.id
  LEFT JOIN public.transactions t ON t.id = e.transaction_id
    AND t.ledger_id = p_ledger_id
    AND t.status = 'completed'
    AND t.created_at <= p_as_of_date
  WHERE a.ledger_id = p_ledger_id
  GROUP BY a.id, a.name, a.account_type, a.entity_type
$$
