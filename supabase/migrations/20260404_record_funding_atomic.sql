-- Backfill stripe_clearing on existing marketplace ledgers
INSERT INTO public.accounts (ledger_id, account_type, entity_type, name)
SELECT l.id, 'stripe_clearing', 'clearing', 'Stripe Clearing'
FROM public.ledgers l
WHERE l.ledger_mode = 'marketplace'
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.ledger_id = l.id AND a.account_type = 'stripe_clearing'
  );
