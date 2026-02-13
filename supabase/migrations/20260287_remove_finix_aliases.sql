-- ============================================================================
-- Remove legacy Finix aliases and normalize stored rail/provider values to `card`
-- - Payout rails: ledgers.payout_rails[].rail = 'finix' -> 'card'
-- - Creator payout methods: accounts.metadata.payout_method.rail = 'finix' -> 'card'
-- - Organizations settings: organizations.settings.finix remains the storage key
--   for processor config (do not rename without a coordinated app+DB migration).
-- ============================================================================

-- Normalize ledgers.payout_rails rails
UPDATE public.ledgers
SET payout_rails = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'rail' AND elem->>'rail' = 'finix'
        THEN jsonb_set(elem, '{rail}', to_jsonb('card'::text), true)
      ELSE elem
    END
  )
  FROM jsonb_array_elements(COALESCE(payout_rails::jsonb, '[]'::jsonb)) AS elem
)
WHERE payout_rails::text LIKE '%"finix"%';

-- Normalize accounts.metadata payout method rails (creator metadata)
UPDATE public.accounts
SET metadata = jsonb_set(
  metadata::jsonb,
  '{payout_method,rail}',
  to_jsonb('card'::text),
  true
)
WHERE metadata::jsonb #>> '{payout_method,rail}' = 'finix';

