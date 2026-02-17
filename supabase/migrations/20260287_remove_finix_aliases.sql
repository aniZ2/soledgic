-- ============================================================================
-- Remove legacy rail aliases and normalize stored rail/provider values to `card`
-- - Payout rails: ledgers.payout_rails[].rail legacy -> 'card'
-- - Creator payout methods: accounts.metadata.payout_method.rail legacy -> 'card'
-- ============================================================================

-- Normalize ledgers.payout_rails rails
UPDATE public.ledgers
SET payout_rails = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN elem ? 'rail' AND (elem->>'rail') NOT IN ('card', 'wise', 'manual', 'crypto')
        THEN jsonb_set(elem, '{rail}', to_jsonb('card'::text), true)
      ELSE elem
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(payout_rails::jsonb, '[]'::jsonb)) AS elem
)
WHERE payout_rails IS NOT NULL;

-- Normalize accounts.metadata payout method rails (creator metadata)
UPDATE public.accounts
SET metadata = jsonb_set(
  metadata::jsonb,
  '{payout_method,rail}',
  to_jsonb('card'::text),
  true
)
WHERE (metadata::jsonb #>> '{payout_method,rail}') IS NOT NULL
  AND (metadata::jsonb #>> '{payout_method,rail}') NOT IN ('card', 'wise', 'manual', 'crypto');
