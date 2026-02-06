-- Fix security linter warnings (Feb 2026)
-- 1. Function search_path mutable
-- 2. Materialized views exposed to API
-- 3. RLS policies with unrestricted USING(true)

-- ============================================================================
-- 1. Fix function search_path for process_stripe_refund
-- ============================================================================
-- First get the current function definition and recreate with search_path set

-- Drop and recreate process_stripe_refund with search_path
CREATE OR REPLACE FUNCTION public.process_stripe_refund(
  p_ledger_id UUID,
  p_stripe_refund_id TEXT,
  p_original_charge_id TEXT,
  p_amount_cents INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_original_sale transactions%ROWTYPE;
  v_creator_id UUID;
BEGIN
  -- Find the original sale by stripe charge ID
  SELECT * INTO v_original_sale
  FROM transactions
  WHERE ledger_id = p_ledger_id
    AND external_reference = p_original_charge_id
    AND type = 'sale'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original sale not found for charge %', p_original_charge_id;
  END IF;

  v_creator_id := v_original_sale.creator_id;

  -- Record the refund transaction
  INSERT INTO transactions (
    ledger_id,
    creator_id,
    type,
    gross_amount,
    net_amount,
    platform_fee,
    external_reference,
    metadata,
    description
  ) VALUES (
    p_ledger_id,
    v_creator_id,
    'refund',
    -p_amount_cents,
    -p_amount_cents,
    0,
    p_stripe_refund_id,
    jsonb_build_object(
      'original_charge_id', p_original_charge_id,
      'original_transaction_id', v_original_sale.id,
      'reason', COALESCE(p_reason, 'requested_by_customer')
    ),
    'Stripe refund: ' || COALESCE(p_reason, 'Customer refund')
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

-- ============================================================================
-- 2. Fix function search_path for process_automatic_releases
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_automatic_releases()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released_count INTEGER := 0;
  v_escrow_record RECORD;
BEGIN
  -- Find all escrow holds past their release date
  FOR v_escrow_record IN
    SELECT eh.id, eh.ledger_id, eh.transaction_id, eh.amount, eh.creator_id
    FROM escrow_holds eh
    WHERE eh.status = 'held'
      AND eh.auto_release_at <= NOW()
      AND eh.auto_release_at IS NOT NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Release the escrow
    UPDATE escrow_holds
    SET status = 'released',
        released_at = NOW(),
        updated_at = NOW()
    WHERE id = v_escrow_record.id;

    -- Record the release
    INSERT INTO escrow_releases (
      escrow_hold_id,
      ledger_id,
      amount,
      release_type,
      released_at
    ) VALUES (
      v_escrow_record.id,
      v_escrow_record.ledger_id,
      v_escrow_record.amount,
      'automatic',
      NOW()
    );

    v_released_count := v_released_count + 1;
  END LOOP;

  RETURN v_released_count;
END;
$$;

-- ============================================================================
-- 3. Revoke API access from materialized views
-- ============================================================================
REVOKE SELECT ON public.dispute_lifecycle FROM anon, authenticated;
REVOKE SELECT ON public.payout_lifecycle FROM anon, authenticated;

-- Grant only to service_role for backend use
GRANT SELECT ON public.dispute_lifecycle TO service_role;
GRANT SELECT ON public.payout_lifecycle TO service_role;

-- ============================================================================
-- 4. Fix overly permissive RLS policies
-- These policies show "-" for roles, meaning TO clause wasn't applied.
-- Drop and recreate with explicit TO service_role
-- ============================================================================

-- 4a. drift_alerts
DROP POLICY IF EXISTS "service_role_full_access_drift_alerts" ON public.drift_alerts;
CREATE POLICY "service_role_full_access_drift_alerts"
  ON public.drift_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4b. reconciliation_runs
DROP POLICY IF EXISTS "service_role_full_access_recon_runs" ON public.reconciliation_runs;
CREATE POLICY "service_role_full_access_recon_runs"
  ON public.reconciliation_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4c. risk_evaluations
DROP POLICY IF EXISTS "Ledger API can manage evaluations" ON public.risk_evaluations;
CREATE POLICY "service_role_full_access_risk_evaluations"
  ON public.risk_evaluations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4d. risk_policies
DROP POLICY IF EXISTS "Ledger API can manage policies" ON public.risk_policies;
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
  v_count INTEGER;
BEGIN
  -- Verify functions have search_path set
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN ('process_stripe_refund', 'process_automatic_releases')
    AND p.proconfig IS NOT NULL
    AND 'search_path=public' = ANY(p.proconfig);

  IF v_count < 2 THEN
    RAISE WARNING 'Not all functions have search_path set: %/2', v_count;
  ELSE
    RAISE NOTICE 'All 2 functions have search_path set correctly';
  END IF;

  -- Verify materialized views are not accessible to anon/authenticated
  SELECT COUNT(*) INTO v_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('dispute_lifecycle', 'payout_lifecycle')
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type = 'SELECT';

  IF v_count > 0 THEN
    RAISE WARNING 'Materialized views still accessible: % grants found', v_count;
  ELSE
    RAISE NOTICE 'Materialized views properly restricted from API';
  END IF;

  RAISE NOTICE 'Security linter fixes applied successfully';
END $$;
