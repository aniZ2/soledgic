-- Hold/Action Hierarchy: enforce authority levels across holds, capabilities,
-- risk signals, KYC, and account suspension.
--
-- Authority levels: soledgic_system > org_operator > platform_api

-- ============================================================
-- 1. Hold source tracking
-- ============================================================

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS hold_source text DEFAULT 'platform_api';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'held_funds') THEN
    ALTER TABLE public.held_funds ADD COLUMN IF NOT EXISTS hold_source text DEFAULT 'platform_api';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'escrow_releases') THEN
    ALTER TABLE public.escrow_releases ADD COLUMN IF NOT EXISTS hold_source text DEFAULT 'platform_api';
    ALTER TABLE public.escrow_releases ADD COLUMN IF NOT EXISTS released_by_authority text;
  END IF;
END $$;

-- ============================================================
-- 2. Capability locks (prevents lower authority from loosening)
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS capability_locks jsonb DEFAULT '{}'::jsonb;

-- Suspension columns
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS suspended_by uuid;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS suspension_authority text;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS suspension_reason text;

-- ============================================================
-- 3. KYC authority tracking
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS kyc_status_authority text DEFAULT 'platform_api';

ALTER TABLE public.connected_accounts
  ADD COLUMN IF NOT EXISTS kyc_status_authority text DEFAULT 'platform_api';

-- ============================================================
-- 4. Risk signal authority
-- ============================================================

ALTER TABLE public.risk_signals
  ADD COLUMN IF NOT EXISTS signal_authority text DEFAULT 'platform_api';
ALTER TABLE public.risk_signals
  ADD COLUMN IF NOT EXISTS requires_system_resolution boolean DEFAULT false;

-- ============================================================
-- 5. Creator payout delay authority
-- ============================================================

ALTER TABLE public.connected_accounts
  ADD COLUMN IF NOT EXISTS payout_delay_authority text DEFAULT 'platform_api';

-- ============================================================
-- 6. Update release_expired_holds to skip system holds
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_expired_holds()
RETURNS TABLE(released_count integer, skipped_system_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released integer := 0;
  v_skipped integer := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT e.id, e.hold_source
    FROM entries e
    JOIN transactions t ON t.id = e.transaction_id
    WHERE e.hold_status = 'held'
      AND e.release_eligible_at IS NOT NULL
      AND e.release_eligible_at <= now()
      AND t.status = 'completed'
  LOOP
    -- System holds never auto-release
    IF rec.hold_source = 'soledgic_system' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    UPDATE entries
    SET hold_status = 'released',
        released_at = now()
    WHERE id = rec.id
      AND hold_status = 'held';

    IF FOUND THEN
      v_released := v_released + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_released, v_skipped;
END;
$$;

-- ============================================================
-- 7. Capability set with authority check
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_capability_with_authority(
  p_org_id uuid,
  p_key text,
  p_value jsonb,
  p_authority text,
  p_actor_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locks jsonb;
  v_current_lock text;
  v_rank_caller integer;
  v_rank_lock integer;
  v_caps jsonb;
BEGIN
  SELECT capability_locks, capabilities
  INTO v_locks, v_caps
  FROM organizations
  WHERE id = p_org_id;

  v_locks := COALESCE(v_locks, '{}'::jsonb);
  v_caps := COALESCE(v_caps, '{}'::jsonb);

  -- Check if the key is locked at a higher authority
  v_current_lock := v_locks ->> p_key;
  IF v_current_lock IS NOT NULL THEN
    v_rank_caller := CASE p_authority
      WHEN 'soledgic_system' THEN 3
      WHEN 'org_operator' THEN 2
      WHEN 'platform_api' THEN 1
      ELSE 0
    END;
    v_rank_lock := CASE v_current_lock
      WHEN 'soledgic_system' THEN 3
      WHEN 'org_operator' THEN 2
      WHEN 'platform_api' THEN 1
      ELSE 0
    END;

    IF v_rank_caller < v_rank_lock THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Capability "%s" is locked by %s authority', p_key, v_current_lock)
      );
    END IF;
  END IF;

  -- Set the capability and update the lock
  v_caps := jsonb_set(v_caps, ARRAY[p_key], p_value);
  v_locks := jsonb_set(v_locks, ARRAY[p_key], to_jsonb(p_authority));

  UPDATE organizations
  SET capabilities = v_caps,
      capability_locks = v_locks,
      updated_at = now()
  WHERE id = p_org_id;

  RETURN jsonb_build_object('success', true, 'capabilities', v_caps, 'locks', v_locks);
END;
$$;

-- ============================================================
-- 8. Organization suspension / reactivation
-- ============================================================

CREATE OR REPLACE FUNCTION public.suspend_organization(
  p_org_id uuid,
  p_reason text,
  p_authority text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE organizations
  SET status = 'suspended',
      suspended_at = now(),
      suspended_by = p_actor_id,
      suspension_authority = p_authority,
      suspension_reason = p_reason,
      updated_at = now()
  WHERE id = p_org_id;

  -- Auto-lock payouts
  PERFORM set_capability_with_authority(p_org_id, 'can_payout', 'false'::jsonb, p_authority, p_actor_id::text);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_organization(
  p_org_id uuid,
  p_authority text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suspension_authority text;
  v_rank_caller integer;
  v_rank_suspension integer;
BEGIN
  SELECT suspension_authority INTO v_suspension_authority
  FROM organizations WHERE id = p_org_id;

  IF v_suspension_authority IS NOT NULL THEN
    v_rank_caller := CASE p_authority
      WHEN 'soledgic_system' THEN 3 WHEN 'org_operator' THEN 2 WHEN 'platform_api' THEN 1 ELSE 0 END;
    v_rank_suspension := CASE v_suspension_authority
      WHEN 'soledgic_system' THEN 3 WHEN 'org_operator' THEN 2 WHEN 'platform_api' THEN 1 ELSE 0 END;

    IF v_rank_caller < v_rank_suspension THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Organization was suspended by %s — requires %s authority to reactivate', v_suspension_authority, v_suspension_authority)
      );
    END IF;
  END IF;

  UPDATE organizations
  SET status = 'active',
      suspended_at = NULL,
      suspended_by = NULL,
      suspension_authority = NULL,
      suspension_reason = NULL,
      updated_at = now()
  WHERE id = p_org_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- 9. Backfill: existing data gets platform_api authority
-- ============================================================
-- All existing holds, signals, and capabilities are treated as platform-level
-- (lowest authority). This is safe because no system-level holds existed before
-- this migration.
