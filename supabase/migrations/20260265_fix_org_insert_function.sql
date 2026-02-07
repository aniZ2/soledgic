-- ============================================================================
-- FIX: Organizations INSERT via privileged function
-- The RLS policy approach keeps failing. Use a function instead that bypasses RLS.
-- ============================================================================

-- Step 1: Create function to create organization (bypasses RLS)
CREATE OR REPLACE FUNCTION create_organization_for_user(
  p_name TEXT,
  p_slug TEXT,
  p_plan TEXT DEFAULT 'pro',
  p_trial_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_max_ledgers INT DEFAULT 3,
  p_max_team_members INT DEFAULT 1
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  plan TEXT,
  status TEXT,
  trial_ends_at TIMESTAMPTZ,
  max_ledgers INT,
  max_team_members INT,
  current_ledger_count INT,
  current_member_count INT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_trial_ends TIMESTAMPTZ;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has an organization
  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  -- Set trial end date
  v_trial_ends := COALESCE(p_trial_ends_at, NOW() + INTERVAL '14 days');

  -- Create the organization
  INSERT INTO organizations (
    name,
    slug,
    plan,
    status,
    trial_ends_at,
    max_ledgers,
    max_team_members,
    current_ledger_count,
    current_member_count
  ) VALUES (
    p_name,
    p_slug,
    p_plan,
    'trialing',
    v_trial_ends,
    p_max_ledgers,
    p_max_team_members,
    0,
    1
  )
  RETURNING organizations.id INTO v_org_id;

  -- Add user as owner
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role,
    status
  ) VALUES (
    v_org_id,
    v_user_id,
    'owner',
    'active'
  );

  -- Return the created organization
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    o.plan,
    o.status,
    o.trial_ends_at,
    o.max_ledgers,
    o.max_team_members,
    o.current_ledger_count,
    o.current_member_count,
    o.created_at
  FROM organizations o
  WHERE o.id = v_org_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_organization_for_user(TEXT, TEXT, TEXT, TIMESTAMPTZ, INT, INT) TO authenticated;

-- Step 2: Create function to create ledger for organization
CREATE OR REPLACE FUNCTION create_ledger_for_organization(
  p_org_id UUID,
  p_business_name TEXT,
  p_ledger_mode TEXT DEFAULT 'marketplace',
  p_livemode BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  business_name TEXT,
  ledger_mode TEXT,
  status TEXT,
  livemode BOOLEAN,
  api_key TEXT,
  ledger_group_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_ledger_id UUID;
  v_api_key TEXT;
  v_ledger_group_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify user is member of this organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
    AND user_id = v_user_id
    AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User is not a member of this organization';
  END IF;

  -- Generate API key and ledger group ID
  v_api_key := 'sk_' || CASE WHEN p_livemode THEN 'live_' ELSE 'test_' END || encode(gen_random_bytes(24), 'hex');
  v_ledger_group_id := gen_random_uuid();

  -- Create the ledger
  INSERT INTO ledgers (
    organization_id,
    business_name,
    ledger_mode,
    status,
    livemode,
    api_key,
    ledger_group_id
  ) VALUES (
    p_org_id,
    p_business_name,
    p_ledger_mode,
    'active',
    p_livemode,
    v_api_key,
    v_ledger_group_id
  )
  RETURNING ledgers.id INTO v_ledger_id;

  -- Update organization ledger count
  UPDATE organizations
  SET current_ledger_count = current_ledger_count + 1
  WHERE organizations.id = p_org_id;

  -- Return the created ledger
  RETURN QUERY
  SELECT
    l.id,
    l.organization_id,
    l.business_name,
    l.ledger_mode,
    l.status,
    l.livemode,
    l.api_key,
    l.ledger_group_id,
    l.created_at
  FROM ledgers l
  WHERE l.id = v_ledger_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_ledger_for_organization(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
