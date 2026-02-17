-- ============================================================================
-- Team-member overage billing + free-plan defaults
-- - Adds overage_team_member_price config
-- - Allows member overages (logs billing event instead of hard-blocking)
-- - Aligns plan-change defaults with current free model
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS overage_team_member_price INTEGER DEFAULT 2000;

UPDATE public.organizations
SET overage_team_member_price = 2000
WHERE overage_team_member_price IS NULL;

ALTER TABLE public.organizations
  ALTER COLUMN overage_team_member_price SET DEFAULT 2000;

ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS overage_team_member_price INTEGER DEFAULT 2000;

UPDATE public.pricing_plans
SET overage_team_member_price = 2000
WHERE overage_team_member_price IS NULL;

-- Keep free-plan limits/pricing aligned for existing orgs.
UPDATE public.organizations
SET
  max_ledgers = 1,
  max_team_members = 1,
  overage_ledger_price = COALESCE(overage_ledger_price, 2000),
  overage_team_member_price = COALESCE(overage_team_member_price, 2000)
WHERE plan IN ('pro', 'trial');

-- Member overages should be allowed and billed, not blocked.
CREATE OR REPLACE FUNCTION public.enforce_member_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_max_members INTEGER;
  v_current_count INTEGER;
  v_plan TEXT;
  v_status TEXT;
BEGIN
  v_org_id := NEW.organization_id;

  -- Only check when membership becomes active.
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  SELECT
    max_team_members,
    current_member_count,
    plan,
    status
  INTO
    v_max_members,
    v_current_count,
    v_plan,
    v_status
  FROM public.organizations
  WHERE id = v_org_id;

  IF v_max_members IS NULL THEN
    RAISE EXCEPTION 'Organization not found: %', v_org_id;
  END IF;

  IF v_status IN ('suspended', 'canceled') THEN
    RAISE EXCEPTION 'Cannot add members to % organization', v_status;
  END IF;

  -- Unlimited plans have no overage.
  IF v_max_members = -1 THEN
    RETURN NEW;
  END IF;

  IF v_current_count >= v_max_members THEN
    INSERT INTO public.billing_events (
      organization_id,
      processor_event_type,
      description,
      processor_data
    ) VALUES (
      v_org_id,
      'team_member_overage',
      'Team member added beyond included limit',
      jsonb_build_object(
        'plan', v_plan,
        'max_team_members', v_max_members,
        'current_count', v_current_count + 1,
        'overage_count', (v_current_count + 1) - v_max_members,
        'member_user_id', NEW.user_id,
        'member_role', NEW.role
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_member_limit ON public.organization_members;
CREATE TRIGGER trigger_enforce_member_limit
  BEFORE INSERT OR UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_member_limit();

-- Align plan-change defaults with current free model.
CREATE OR REPLACE FUNCTION public.handle_plan_change()
RETURNS TRIGGER AS $$
BEGIN
  CASE NEW.plan
    WHEN 'trial' THEN
      NEW.max_ledgers := 1;
      NEW.max_team_members := 1;
    WHEN 'pro' THEN
      NEW.max_ledgers := 1;
      NEW.max_team_members := 1;
    WHEN 'business' THEN
      NEW.max_ledgers := 10;
      NEW.max_team_members := 10;
    WHEN 'scale' THEN
      NEW.max_ledgers := -1;
      NEW.max_team_members := -1;
    ELSE
      NEW.max_ledgers := 1;
      NEW.max_team_members := 1;
  END CASE;

  NEW.overage_ledger_price := COALESCE(NEW.overage_ledger_price, 2000);
  NEW.overage_team_member_price := COALESCE(NEW.overage_team_member_price, 2000);

  IF OLD.plan IS DISTINCT FROM NEW.plan THEN
    INSERT INTO public.billing_events (
      organization_id,
      processor_event_type,
      description,
      processor_data
    ) VALUES (
      NEW.id,
      'plan_changed',
      'Plan changed from ' || COALESCE(OLD.plan, 'none') || ' to ' || NEW.plan,
      jsonb_build_object(
        'old_plan', OLD.plan,
        'new_plan', NEW.plan,
        'old_limits', jsonb_build_object('ledgers', OLD.max_ledgers, 'members', OLD.max_team_members),
        'new_limits', jsonb_build_object('ledgers', NEW.max_ledgers, 'members', NEW.max_team_members)
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_handle_plan_change ON public.organizations;
CREATE TRIGGER trigger_handle_plan_change
  BEFORE UPDATE OF plan ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_plan_change();
