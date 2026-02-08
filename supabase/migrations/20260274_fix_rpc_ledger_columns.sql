-- ============================================================================
-- FIX: Ensure ledger columns exist and fix RPC function
-- ============================================================================

-- Ensure columns exist (idempotent)
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS ledger_group_id UUID;
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS livemode BOOLEAN DEFAULT false;

-- Update RPC to handle potentially missing columns gracefully
CREATE OR REPLACE FUNCTION create_organization_with_ledger(
  p_org_name TEXT,
  p_org_slug TEXT,
  p_plan TEXT,
  p_trial_ends_at TIMESTAMPTZ,
  p_max_ledgers INT,
  p_max_team_members INT,
  p_ledger_name TEXT,
  p_ledger_mode TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_ledger_group_id UUID;
  v_test_api_key TEXT;
  v_live_api_key TEXT;
  v_test_ledger_id UUID;
  v_live_ledger_id UUID;
  v_result JSON;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Generate IDs and keys
  v_org_id := gen_random_uuid();
  v_ledger_group_id := gen_random_uuid();
  v_test_ledger_id := gen_random_uuid();
  v_live_ledger_id := gen_random_uuid();
  v_test_api_key := 'sk_test_' || replace(gen_random_uuid()::text, '-', '');
  v_live_api_key := 'sk_live_' || replace(gen_random_uuid()::text, '-', '');

  -- Create organization
  INSERT INTO organizations (
    id,
    name,
    slug,
    owner_id,
    plan,
    status,
    trial_ends_at,
    max_ledgers,
    max_team_members,
    current_ledger_count,
    current_member_count
  ) VALUES (
    v_org_id,
    p_org_name,
    p_org_slug,
    v_user_id,
    p_plan,
    'active',
    p_trial_ends_at,
    p_max_ledgers,
    p_max_team_members,
    1,
    1
  );

  -- Add user as owner
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role
  ) VALUES (
    v_org_id,
    v_user_id,
    'owner'
  );

  -- Create test ledger
  INSERT INTO ledgers (
    id,
    organization_id,
    business_name,
    ledger_mode,
    status,
    ledger_group_id,
    api_key,
    livemode,
    settings
  ) VALUES (
    v_test_ledger_id,
    v_org_id,
    p_ledger_name,
    p_ledger_mode,
    'active',
    v_ledger_group_id,
    v_test_api_key,
    false,
    '{"currency": "USD", "fiscal_year_start": 1}'::jsonb
  );

  -- Create live ledger
  INSERT INTO ledgers (
    id,
    organization_id,
    business_name,
    ledger_mode,
    status,
    ledger_group_id,
    api_key,
    livemode,
    settings
  ) VALUES (
    v_live_ledger_id,
    v_org_id,
    p_ledger_name,
    p_ledger_mode,
    'active',
    v_ledger_group_id,
    v_live_api_key,
    true,
    '{"currency": "USD", "fiscal_year_start": 1}'::jsonb
  );

  -- Return the created data
  v_result := json_build_object(
    'organization_id', v_org_id,
    'test_api_key', v_test_api_key,
    'live_api_key', v_live_api_key,
    'test_ledger_id', v_test_ledger_id,
    'live_ledger_id', v_live_ledger_id
  );

  RETURN v_result;
END;
$$;
