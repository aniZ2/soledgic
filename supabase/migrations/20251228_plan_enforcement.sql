-- soledgic: Plan Limit Enforcement
-- Database-level enforcement of subscription limits

-- ============================================================================
-- 1. LEDGER LIMIT ENFORCEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_ledger_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_max_ledgers INTEGER;
  v_current_count INTEGER;
  v_plan TEXT;
  v_trial_ends_at TIMESTAMPTZ;
  v_status TEXT;
BEGIN
  v_org_id := NEW.organization_id;
  
  -- Get organization limits
  SELECT 
    max_ledgers, 
    current_ledger_count, 
    plan,
    trial_ends_at,
    status
  INTO 
    v_max_ledgers, 
    v_current_count, 
    v_plan,
    v_trial_ends_at,
    v_status
  FROM organizations
  WHERE id = v_org_id;
  
  -- Check if organization exists
  IF v_max_ledgers IS NULL THEN
    RAISE EXCEPTION 'Organization not found: %', v_org_id;
  END IF;
  
  -- Check organization status
  IF v_status = 'suspended' THEN
    RAISE EXCEPTION 'Organization is suspended. Please contact support.';
  END IF;
  
  IF v_status = 'canceled' THEN
    RAISE EXCEPTION 'Organization subscription is canceled. Please reactivate.';
  END IF;
  
  -- Check trial expiration
  IF v_plan = 'trial' AND v_trial_ends_at < NOW() THEN
    RAISE EXCEPTION 'Trial has expired. Please upgrade to continue creating ledgers.';
  END IF;
  
  -- Scale plan (-1) has unlimited ledgers
  IF v_max_ledgers = -1 THEN
    RETURN NEW;
  END IF;
  
  -- Check ledger limit (allow overage but track it)
  -- The billing system will charge for overages
  IF v_current_count >= v_max_ledgers THEN
    -- Log overage event for billing
    INSERT INTO billing_events (
      organization_id,
      processor_event_type,
      description,
      processor_data
    ) VALUES (
      v_org_id,
      'ledger_overage',
      'Ledger created beyond plan limit',
      jsonb_build_object(
        'plan', v_plan,
        'max_ledgers', v_max_ledgers,
        'current_count', v_current_count + 1,
        'overage_count', (v_current_count + 1) - v_max_ledgers,
        'ledger_id', NEW.id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_ledger_limit ON ledgers;
CREATE TRIGGER trigger_enforce_ledger_limit
  BEFORE INSERT ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION enforce_ledger_limit();

-- ============================================================================
-- 2. TEAM MEMBER LIMIT ENFORCEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_member_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_max_members INTEGER;
  v_current_count INTEGER;
  v_plan TEXT;
  v_status TEXT;
BEGIN
  v_org_id := NEW.organization_id;
  
  -- Only check on status change to 'active'
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;
  
  -- Get organization limits
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
  FROM organizations
  WHERE id = v_org_id;
  
  -- Check organization exists
  IF v_max_members IS NULL THEN
    RAISE EXCEPTION 'Organization not found: %', v_org_id;
  END IF;
  
  -- Check organization status
  IF v_status IN ('suspended', 'canceled') THEN
    RAISE EXCEPTION 'Cannot add members to % organization', v_status;
  END IF;
  
  -- Scale plan (-1) has unlimited members
  IF v_max_members = -1 THEN
    RETURN NEW;
  END IF;
  
  -- Enforce hard limit on members (no overage)
  IF v_current_count >= v_max_members THEN
    RAISE EXCEPTION 'Team member limit reached (% of %). Please upgrade your plan.', 
      v_current_count, v_max_members;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_member_limit ON organization_members;
CREATE TRIGGER trigger_enforce_member_limit
  BEFORE INSERT OR UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_member_limit();

-- ============================================================================
-- 3. HELPER FUNCTION: Check if org can perform action
-- ============================================================================

CREATE OR REPLACE FUNCTION can_org_create_ledger(p_org_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_max INTEGER;
  v_current INTEGER;
  v_plan TEXT;
  v_trial_ends TIMESTAMPTZ;
  v_status TEXT;
BEGIN
  SELECT 
    max_ledgers,
    current_ledger_count,
    plan,
    trial_ends_at,
    status
  INTO v_max, v_current, v_plan, v_trial_ends, v_status
  FROM organizations
  WHERE id = p_org_id;
  
  IF v_max IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Organization not found');
  END IF;
  
  IF v_status = 'suspended' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Organization suspended');
  END IF;
  
  IF v_status = 'canceled' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Subscription canceled');
  END IF;
  
  IF v_plan = 'trial' AND v_trial_ends < NOW() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Trial expired', 'action', 'upgrade');
  END IF;
  
  -- Unlimited
  IF v_max = -1 THEN
    RETURN jsonb_build_object('allowed', true, 'within_limit', true);
  END IF;
  
  -- Within limit
  IF v_current < v_max THEN
    RETURN jsonb_build_object(
      'allowed', true, 
      'within_limit', true,
      'remaining', v_max - v_current
    );
  END IF;
  
  -- Over limit (will incur overage charges)
  RETURN jsonb_build_object(
    'allowed', true,
    'within_limit', false,
    'overage', true,
    'overage_price', 2000, -- $20 in cents
    'message', 'Additional ledgers cost $20/month each'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. PLAN UPGRADE/DOWNGRADE HANDLING
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_plan_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update limits based on new plan
  CASE NEW.plan
    WHEN 'trial' THEN
      NEW.max_ledgers := 3;
      NEW.max_team_members := 1;
    WHEN 'pro' THEN
      NEW.max_ledgers := 3;
      NEW.max_team_members := 1;
    WHEN 'business' THEN
      NEW.max_ledgers := 10;
      NEW.max_team_members := 10;
    WHEN 'scale' THEN
      NEW.max_ledgers := -1; -- Unlimited
      NEW.max_team_members := -1;
    ELSE
      -- Default to trial limits
      NEW.max_ledgers := 3;
      NEW.max_team_members := 1;
  END CASE;
  
  -- Record plan change event
  IF OLD.plan IS DISTINCT FROM NEW.plan THEN
    INSERT INTO billing_events (
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

DROP TRIGGER IF EXISTS trigger_handle_plan_change ON organizations;
CREATE TRIGGER trigger_handle_plan_change
  BEFORE UPDATE OF plan ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION handle_plan_change();

-- ============================================================================
-- 5. GRACE PERIOD FOR DOWNGRADES
-- ============================================================================

-- When downgrading, don't delete resources - just prevent new ones
-- This is handled by the overage logic above

-- Add a view for easy plan status checking
CREATE OR REPLACE VIEW organization_plan_status AS
SELECT 
  o.id,
  o.name,
  o.slug,
  o.plan,
  o.status,
  o.max_ledgers,
  o.current_ledger_count,
  o.max_team_members,
  o.current_member_count,
  o.trial_ends_at,
  CASE 
    WHEN o.plan = 'trial' AND o.trial_ends_at < NOW() THEN true
    ELSE false
  END as trial_expired,
  CASE
    WHEN o.max_ledgers = -1 THEN 0
    WHEN o.current_ledger_count > o.max_ledgers THEN o.current_ledger_count - o.max_ledgers
    ELSE 0
  END as ledger_overage_count,
  CASE
    WHEN o.max_ledgers = -1 THEN null
    ELSE GREATEST(0, o.max_ledgers - o.current_ledger_count)
  END as ledgers_remaining
FROM organizations o;
