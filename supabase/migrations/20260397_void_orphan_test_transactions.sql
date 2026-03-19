-- Void transactions whose creator accounts have been soft-deleted.
-- Only affects test-mode ledgers. These are orphaned by the old
-- delete path that didn't void transactions.

UPDATE public.transactions t
SET status = 'voided',
    metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object('voided_reason', 'orphaned_by_creator_delete', 'voided_at', now()::text)
WHERE t.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.entries e
    JOIN public.accounts a ON a.id = e.account_id
    WHERE e.transaction_id = t.id
      AND a.is_active = false
      AND a.account_type = 'creator_balance'
  )
  AND EXISTS (
    SELECT 1 FROM public.ledgers l
    WHERE l.id = t.ledger_id
      AND l.livemode = false
  );
