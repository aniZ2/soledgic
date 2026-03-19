-- Clean slate: void ALL completed transactions in test-mode ledgers
-- where the ledger has zero active creator_balance accounts.
-- This handles the case where wallet transactions survive creator deletion.

UPDATE public.transactions t
SET status = 'voided',
    metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object('voided_reason', 'test_ledger_cleanup', 'voided_at', now()::text)
WHERE t.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.ledgers l
    WHERE l.id = t.ledger_id
      AND l.livemode = false
      AND NOT EXISTS (
        SELECT 1 FROM public.accounts a
        WHERE a.ledger_id = l.id
          AND a.account_type = 'creator_balance'
          AND a.is_active = true
      )
  );
