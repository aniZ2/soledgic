-- Fix: continue RPC grant tightening after 20260381 partial apply.
-- The release_expired_holds function has multiple overloads.

-- Handle ambiguous function names with specific signatures
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.release_expired_holds() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.release_expired_holds() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
          WHEN ambiguous_function THEN NULL; END $$;

-- Authority/suspension RPCs (may have been skipped)
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.set_capability_with_authority FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.set_capability_with_authority TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.suspend_organization FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.suspend_organization TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.reactivate_organization FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.reactivate_organization TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Cleanup RPC
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.cleanup_ledger_data FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.cleanup_ledger_data TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Re-tighten credit RPCs (recreated in same migration)
REVOKE ALL ON FUNCTION public.issue_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_credits TO service_role;
REVOKE ALL ON FUNCTION public.convert_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_credits TO service_role;
REVOKE ALL ON FUNCTION public.redeem_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_credits TO service_role;

-- Dashboard policy for risk_signals
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'risk_signals_dashboard_select') THEN
    CREATE POLICY risk_signals_dashboard_select ON public.risk_signals
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid() AND om.status = 'active'
      ));
  END IF;
END $$;
