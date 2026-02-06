-- Fix search_path on existing functions (correct signatures)
-- The previous migration created new function overloads instead of fixing existing ones

-- ============================================================================
-- 1. process_stripe_refund - has 8 parameters
-- ============================================================================
ALTER FUNCTION public.process_stripe_refund(
  UUID,      -- p_ledger_id
  UUID,      -- p_original_tx_id
  TEXT,      -- p_charge_id
  TEXT,      -- p_reference_id
  TEXT,      -- p_description
  NUMERIC,   -- p_amount
  TEXT,      -- p_currency
  JSONB      -- p_metadata
)
SET search_path = public;

-- ============================================================================
-- 2. process_automatic_releases - has 1 optional parameter
-- ============================================================================
ALTER FUNCTION public.process_automatic_releases(UUID)
SET search_path = public;

-- ============================================================================
-- 3. Drop the incorrectly created function overloads from previous migration
-- ============================================================================
-- Drop the no-parameter version we accidentally created
DROP FUNCTION IF EXISTS public.process_automatic_releases();

-- Drop the 5-parameter version we accidentally created
DROP FUNCTION IF EXISTS public.process_stripe_refund(UUID, TEXT, TEXT, INTEGER, TEXT);

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check that both functions have search_path set
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN ('process_stripe_refund', 'process_automatic_releases')
    AND p.proconfig IS NOT NULL
    AND 'search_path=public' = ANY(p.proconfig);

  IF v_count >= 2 THEN
    RAISE NOTICE 'SUCCESS: % functions have search_path set', v_count;
  ELSE
    RAISE WARNING 'Only %/2 functions have search_path set', v_count;
  END IF;
END $$;
