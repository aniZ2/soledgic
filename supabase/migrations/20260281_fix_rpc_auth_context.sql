-- ============================================================================
-- FIX: Pass user_id as parameter since auth.uid() returns NULL in elevated context
-- ============================================================================

CREATE OR REPLACE FUNCTION create_organization_with_ledger(
  p_user_id UUID,
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
  v_org_id UUID;
  v_ledger_group_id UUID;
  v_test_api_key TEXT;
  v_live_api_key TEXT;
  v_test_ledger_id UUID;
  v_live_ledger_id UUID;
  v_result JSON;
BEGIN
  -- Validate user_id is provided
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
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
    p_user_id,
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
    p_user_id,
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
    livemode,
    api_key_hash,
    settings
  ) VALUES (
    v_test_ledger_id,
    v_org_id,
    p_ledger_name,
    p_ledger_mode,
    'active',
    v_ledger_group_id,
    false,
    encode(sha256(v_test_api_key::bytea), 'hex'),
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
    livemode,
    api_key_hash,
    settings
  ) VALUES (
    v_live_ledger_id,
    v_org_id,
    p_ledger_name,
    p_ledger_mode,
    'active',
    v_ledger_group_id,
    true,
    encode(sha256(v_live_api_key::bytea), 'hex'),
    '{"currency": "USD", "fiscal_year_start": 1}'::jsonb
  );

  -- Create API key for test ledger
  INSERT INTO api_keys (
    ledger_id,
    name,
    key_hash,
    key_prefix,
    scopes,
    created_by
  ) VALUES (
    v_test_ledger_id,
    'Default Test Key',
    encode(sha256(v_test_api_key::bytea), 'hex'),
    substring(v_test_api_key from 1 for 12),
    ARRAY['read', 'write', 'admin'],
    p_user_id
  );

  -- Create API key for live ledger
  INSERT INTO api_keys (
    ledger_id,
    name,
    key_hash,
    key_prefix,
    scopes,
    created_by
  ) VALUES (
    v_live_ledger_id,
    'Default Live Key',
    encode(sha256(v_live_api_key::bytea), 'hex'),
    substring(v_live_api_key from 1 for 12),
    ARRAY['read', 'write', 'admin'],
    p_user_id
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_organization_with_ledger(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, INT, INT, TEXT, TEXT) TO authenticated;
