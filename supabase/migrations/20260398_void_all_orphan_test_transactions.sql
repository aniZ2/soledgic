-- Void ALL transactions in test-mode ledgers linked to any inactive account
-- (not just creator_balance — also user_wallet, etc.)

UPDATE public.transactions t
SET status = 'voided',
    metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object('voided_reason', 'orphaned_account_cleanup', 'voided_at', now()::text)
WHERE t.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.entries e
    JOIN public.accounts a ON a.id = e.account_id
    WHERE e.transaction_id = t.id
      AND a.is_active = false
  )
  AND EXISTS (
    SELECT 1 FROM public.ledgers l
    WHERE l.id = t.ledger_id
      AND l.livemode = false
  );
