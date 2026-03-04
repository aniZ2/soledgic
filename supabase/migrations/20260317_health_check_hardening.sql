-- ============================================================================
-- Health Check Hardening
--
-- 1. Drop stale zero-arg run_all_health_checks() overload (20260116:414).
--    The zero-arg version lacks the auth guard and p_check_type parameter
--    introduced in 20260314. Both overloads coexist; the zero-arg is callable
--    by any role with EXECUTE.
--
-- 2. Restrict the 2-arg run_ledger_health_check(UUID, TEXT) to service_role.
--    The caller-controlled p_check_type lets authenticated tenants write rows
--    labeled 'daily' or 'alert', weakening time-series categorization.
--    The 1-arg wrapper (UUID) stays granted to authenticated — it hardcodes
--    'manual'.
-- ============================================================================

-- Fix 1: Drop the zero-arg overload
DROP FUNCTION IF EXISTS public.run_all_health_checks();

-- Fix 2: Revoke authenticated from 2-arg, re-grant service_role only
REVOKE EXECUTE ON FUNCTION public.run_ledger_health_check(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_ledger_health_check(UUID, TEXT) TO service_role;
