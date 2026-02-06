-- Fix RLS on risk_evaluations and risk_policies
-- These tables are still accessible to anon/authenticated roles

-- ============================================================================
-- 1. risk_evaluations - ensure RLS is enabled and properly configured
-- ============================================================================
ALTER TABLE public.risk_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_evaluations FORCE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "service_role_full_access_risk_evaluations" ON public.risk_evaluations;
DROP POLICY IF EXISTS "Ledger API can manage evaluations" ON public.risk_evaluations;

-- Revoke direct access from anon and authenticated
REVOKE ALL ON public.risk_evaluations FROM anon, authenticated;

-- Grant only to service_role
GRANT ALL ON public.risk_evaluations TO service_role;

-- Create service_role policy
CREATE POLICY "service_role_full_access_risk_evaluations"
  ON public.risk_evaluations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. risk_policies - ensure RLS is enabled and properly configured
-- ============================================================================
ALTER TABLE public.risk_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_policies FORCE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "service_role_full_access_risk_policies" ON public.risk_policies;
DROP POLICY IF EXISTS "Ledger API can manage policies" ON public.risk_policies;

-- Revoke direct access from anon and authenticated
REVOKE ALL ON public.risk_policies FROM anon, authenticated;

-- Grant only to service_role
GRANT ALL ON public.risk_policies TO service_role;

-- Create service_role policy
CREATE POLICY "service_role_full_access_risk_policies"
  ON public.risk_policies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  v_rls_enabled BOOLEAN;
  v_grants INTEGER;
BEGIN
  -- Check risk_evaluations
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE relname = 'risk_evaluations' AND relnamespace = 'public'::regnamespace;

  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'RLS not enabled on risk_evaluations';
  END IF;

  -- Check risk_policies
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE relname = 'risk_policies' AND relnamespace = 'public'::regnamespace;

  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'RLS not enabled on risk_policies';
  END IF;

  -- Check no grants to anon/authenticated
  SELECT COUNT(*) INTO v_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('risk_evaluations', 'risk_policies')
    AND grantee IN ('anon', 'authenticated');

  IF v_grants > 0 THEN
    RAISE WARNING 'Still have % grants to anon/authenticated', v_grants;
  ELSE
    RAISE NOTICE 'SUCCESS: risk_evaluations and risk_policies properly secured';
  END IF;
END $$;
