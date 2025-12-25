-- Fix security linter warnings

-- 1. Make orphaned_transactions view use SECURITY INVOKER (not DEFINER)
DROP VIEW IF EXISTS public.orphaned_transactions;

CREATE VIEW public.orphaned_transactions 
WITH (security_invoker = true)
AS
SELECT 
  t.id,
  t.ledger_id,
  t.reference_id,
  t.amount,
  t.created_at,
  COALESCE(e.entry_count, 0) as entry_count,
  COALESCE(e.total_debits, 0) as total_debits,
  COALESCE(e.total_credits, 0) as total_credits,
  CASE 
    WHEN e.entry_count IS NULL OR e.entry_count = 0 THEN 'NO_ENTRIES'
    WHEN e.total_debits != e.total_credits THEN 'UNBALANCED'
    ELSE 'OK'
  END as status
FROM public.transactions t
LEFT JOIN (
  SELECT 
    transaction_id,
    COUNT(*) as entry_count,
    SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as total_debits,
    SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as total_credits
  FROM public.entries
  GROUP BY transaction_id
) e ON e.transaction_id = t.id
WHERE e.entry_count IS NULL 
   OR e.entry_count = 0 
   OR ABS(e.total_debits - e.total_credits) > 0.01;
