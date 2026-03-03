-- ============================================================================
-- FIX: Add tenant-isolation auth guards to all vulnerable RPCs
--
-- Problem: Multiple RPC functions accept a UUID parameter (ledger_id, endpoint_id,
-- org_id) but never verify that the calling user actually belongs to the owning
-- organization.  Any authenticated user can read/write any tenant's data by UUID.
--
-- Solution: Add an auth guard block at the top of each function.  service_role
-- callers bypass the check (Edge Functions use service_role).  For authenticated
-- callers we verify active owner/admin membership through the relevant join path.
-- ============================================================================

-- ============================================================================
-- 1. LEDGER-SCOPED FUNCTIONS (guard via ledger → org membership)
-- ============================================================================

-- 1a. store_processor_secret_key_in_vault
CREATE OR REPLACE FUNCTION store_processor_secret_key_in_vault(
  p_ledger_id UUID,
  p_secret_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vault_id UUID;
  v_secret_name TEXT;
  v_existing_vault_id UUID;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  v_secret_name := 'processor_sk_' || p_ledger_id::TEXT;

  -- Check if there's an existing vault entry
  SELECT processor_secret_key_vault_id INTO v_existing_vault_id
  FROM ledgers
  WHERE id = p_ledger_id;

  -- If exists, update the vault entry
  IF v_existing_vault_id IS NOT NULL THEN
    UPDATE vault.secrets
    SET secret = p_secret_key,
        updated_at = NOW()
    WHERE id = v_existing_vault_id;
    RETURN v_existing_vault_id;
  END IF;

  -- Insert new vault entry
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (
    v_secret_name,
    p_secret_key,
    'processor secret key for ledger ' || p_ledger_id::TEXT
  )
  RETURNING id INTO v_vault_id;

  -- Update ledger with vault reference and remove from settings
  UPDATE ledgers
  SET processor_secret_key_vault_id = v_vault_id,
      settings = settings - 'processor_secret_key'
  WHERE id = p_ledger_id;

  RETURN v_vault_id;
END;
$$;

-- 1b. get_processor_secret_key_from_vault
CREATE OR REPLACE FUNCTION get_processor_secret_key_from_vault(p_ledger_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vault_id UUID;
  v_secret TEXT;
  v_settings_secret TEXT;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Get vault ID from ledger
  SELECT processor_secret_key_vault_id,
         settings->>'processor_secret_key'
  INTO v_vault_id, v_settings_secret
  FROM ledgers
  WHERE id = p_ledger_id;

  -- If we have a vault ID, use it
  IF v_vault_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE id = v_vault_id;
    RETURN v_secret;
  END IF;

  -- Fallback to settings JSON for unmigrated ledgers
  RETURN v_settings_secret;
END;
$$;

-- 1c. calculate_trial_balance
CREATE OR REPLACE FUNCTION public.calculate_trial_balance(
  p_ledger_id UUID,
  p_as_of_date DATE DEFAULT NULL
)
RETURNS TABLE (
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  debit_balance NUMERIC,
  credit_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  RETURN QUERY
  WITH entry_totals AS (
    SELECT
      e.account_id,
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) as total_debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) as total_credits
    FROM public.entries e
    JOIN public.transactions t ON e.transaction_id = t.id
    WHERE t.ledger_id = p_ledger_id
      AND t.status NOT IN ('voided', 'reversed', 'draft')
      AND (p_as_of_date IS NULL OR DATE(t.created_at) <= p_as_of_date)
    GROUP BY e.account_id
  )
  SELECT
    a.id as account_id,
    a.account_type as account_code,
    a.name as account_name,
    a.account_type,
    CASE
      WHEN a.account_type IN ('asset', 'expense', 'contra_liability', 'contra_equity')
      THEN GREATEST(0, COALESCE(et.total_debits, 0) - COALESCE(et.total_credits, 0))
      ELSE 0::NUMERIC
    END as debit_balance,
    CASE
      WHEN a.account_type IN ('liability', 'equity', 'revenue', 'contra_asset')
      THEN GREATEST(0, COALESCE(et.total_credits, 0) - COALESCE(et.total_debits, 0))
      WHEN a.account_type IN ('asset', 'expense') AND COALESCE(et.total_credits, 0) > COALESCE(et.total_debits, 0)
      THEN COALESCE(et.total_credits, 0) - COALESCE(et.total_debits, 0)
      ELSE 0::NUMERIC
    END as credit_balance
  FROM public.accounts a
  LEFT JOIN entry_totals et ON a.id = et.account_id
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true
    AND (et.total_debits > 0 OR et.total_credits > 0)
  ORDER BY a.account_type, a.name;
END;
$$;

-- 1d. get_account_balances_raw
CREATE OR REPLACE FUNCTION public.get_account_balances_raw(p_ledger_id UUID)
RETURNS TABLE (
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  total_debits NUMERIC,
  total_credits NUMERIC,
  net_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  RETURN QUERY
  SELECT
    a.id as account_id,
    a.account_type as account_code,
    a.name as account_name,
    a.account_type,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)::NUMERIC as total_debits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)::NUMERIC as total_credits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END), 0)::NUMERIC as net_balance
  FROM public.accounts a
  LEFT JOIN public.entries e ON a.id = e.account_id
  LEFT JOIN public.transactions t ON e.transaction_id = t.id AND t.status NOT IN ('voided', 'reversed', 'draft')
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true
  GROUP BY a.id, a.account_type, a.name
  HAVING COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) > 0
      OR COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) > 0
  ORDER BY a.account_type, a.name;
END;
$$;

-- 1e. run_ledger_health_check
CREATE OR REPLACE FUNCTION public.run_ledger_health_check(p_ledger_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB := '[]'::JSONB;
  v_check JSONB;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Check 1: Ledger balance (debits = credits)
  SELECT jsonb_build_object(
    'name', 'ledger_balance',
    'description', 'Total debits equal total credits',
    'status', CASE
      WHEN ABS(COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) -
               COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)) < 0.01
      THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object(
      'total_debits', COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0),
      'total_credits', COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0),
      'difference', ABS(COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) -
                        COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0))
    )
  ) INTO v_check
  FROM public.entries e
  JOIN public.transactions t ON e.transaction_id = t.id
  WHERE t.ledger_id = p_ledger_id
    AND t.status NOT IN ('voided', 'reversed');

  v_result := v_result || v_check;

  RETURN v_result;
END;
$$;

-- 1f. generate_cpa_export
CREATE OR REPLACE FUNCTION public.generate_cpa_export(
  p_ledger_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_summary JSONB;
  v_transactions JSONB;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Get summary
  SELECT jsonb_build_object(
    'transaction_count', COUNT(*),
    'total_volume', SUM(t.amount),
    'unique_accounts', COUNT(DISTINCT e.account_id)
  ) INTO v_summary
  FROM public.transactions t
  JOIN public.entries e ON t.id = e.transaction_id
  WHERE t.ledger_id = p_ledger_id
    AND t.created_at::date BETWEEN p_start_date AND p_end_date
    AND t.status = 'completed';

  -- Get transactions
  SELECT COALESCE(jsonb_agg(row_to_json(t.*)), '[]'::JSONB) INTO v_transactions
  FROM public.transactions t
  WHERE t.ledger_id = p_ledger_id
    AND t.created_at::date BETWEEN p_start_date AND p_end_date
    AND t.status = 'completed';

  RETURN jsonb_build_object(
    'summary', v_summary,
    'transactions', v_transactions
  );
END;
$$;

-- 1g. store_bank_aggregator_token_in_vault (defense-in-depth, already service_role only)
CREATE OR REPLACE FUNCTION public.store_bank_aggregator_token_in_vault(
  p_ledger_id UUID,
  p_access_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Auth guard (defense-in-depth: already restricted to service_role via GRANT)
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Try to store in vault, return NULL if permissions not available
  BEGIN
    INSERT INTO vault.secrets (secret, name, description)
    VALUES (
      p_access_token,
      'bank_aggregator_token_' || p_ledger_id::TEXT,
      'bank_aggregator access token for ledger ' || p_ledger_id::TEXT
    )
    RETURNING id INTO v_secret_id;

    RETURN v_secret_id;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Vault access not available - token not stored securely';
    RETURN NULL;
  END;
END;
$$;

-- ============================================================================
-- 2. ENDPOINT-SCOPED FUNCTIONS (guard via endpoint → webhook_endpoints.ledger_id → org)
-- ============================================================================

-- 2a. rotate_webhook_secret
CREATE OR REPLACE FUNCTION public.rotate_webhook_secret(p_endpoint_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_new_secret TEXT;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.webhook_endpoints we ON we.ledger_id = l.id
      WHERE we.id = p_endpoint_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  v_new_secret := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.webhook_endpoints
  SET previous_secret = secret,
      secret = v_new_secret,
      rotated_at = NOW()
  WHERE id = p_endpoint_id;

  RETURN v_new_secret;
END;
$$;

-- 2b. validate_webhook_signature
CREATE OR REPLACE FUNCTION public.validate_webhook_signature(
  p_endpoint_id UUID,
  p_signature TEXT,
  p_payload TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_endpoint RECORD;
  v_expected_current TEXT;
  v_expected_previous TEXT;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.webhook_endpoints we ON we.ledger_id = l.id
      WHERE we.id = p_endpoint_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  SELECT * INTO v_endpoint
  FROM public.webhook_endpoints
  WHERE id = p_endpoint_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check current secret
  v_expected_current := 'sha256=' || encode(
    extensions.hmac(p_payload::bytea, v_endpoint.secret::bytea, 'sha256'),
    'hex'
  );

  IF p_signature = v_expected_current THEN
    RETURN TRUE;
  END IF;

  -- Check previous secret if rotation happened recently
  IF v_endpoint.previous_secret IS NOT NULL THEN
    v_expected_previous := 'sha256=' || encode(
      extensions.hmac(p_payload::bytea, v_endpoint.previous_secret::bytea, 'sha256'),
      'hex'
    );

    IF p_signature = v_expected_previous THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- 2c. store_processor_webhook_secret_in_vault (defense-in-depth, already service_role only)
CREATE OR REPLACE FUNCTION public.store_processor_webhook_secret_in_vault(
  p_endpoint_id UUID,
  p_secret TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Auth guard (defense-in-depth: already restricted to service_role via GRANT)
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.webhook_endpoints we ON we.ledger_id = l.id
      WHERE we.id = p_endpoint_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Try to store in vault, return NULL if permissions not available
  BEGIN
    INSERT INTO vault.secrets (secret, name, description)
    VALUES (
      p_secret,
      'processor_webhook_' || p_endpoint_id::TEXT,
      'processor webhook secret for endpoint ' || p_endpoint_id::TEXT
    )
    RETURNING id INTO v_secret_id;

    RETURN v_secret_id;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Vault access not available - secret not stored securely';
    RETURN NULL;
  END;
END;
$$;

-- ============================================================================
-- 3. ORG-SCOPED FUNCTIONS (guard via org_id directly)
-- ============================================================================

-- 3a. can_add_ledger
CREATE OR REPLACE FUNCTION public.can_add_ledger(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit INTEGER;
  v_current_count INTEGER;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  SELECT ledger_limit INTO v_limit
  FROM public.organizations
  WHERE id = p_org_id;

  SELECT COUNT(*) INTO v_current_count
  FROM public.ledgers
  WHERE organization_id = p_org_id;

  RETURN v_current_count < COALESCE(v_limit, 999999);
END;
$$;

-- 3b. can_org_create_ledger (delegates to can_add_ledger which now has its own guard)
CREATE OR REPLACE FUNCTION public.can_org_create_ledger(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  RETURN public.can_add_ledger(p_org_id);
END;
$$;

-- ============================================================================
-- 4. BANK-TRANSACTION-SCOPED FUNCTION (guard via bank_transaction → ledger → org)
-- ============================================================================

-- 4a. auto_match_bank_transaction (placeholder, defensive guard)
CREATE OR REPLACE FUNCTION public.auto_match_bank_transaction(
  p_bank_transaction_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_match_found BOOLEAN := FALSE;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.bank_transactions bt ON bt.ledger_id = l.id
      WHERE bt.id = p_bank_transaction_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Auto-matching logic placeholder
  RETURN jsonb_build_object(
    'matched', v_match_found,
    'bank_transaction_id', p_bank_transaction_id
  );
END;
$$;

-- ============================================================================
-- 5. REVOKE authenticated FROM reprocess_processor_event (stub, service_role only)
-- ============================================================================
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.reprocess_processor_event(TEXT) FROM authenticated;
EXCEPTION WHEN undefined_function THEN
  -- Function may not exist on this database; skip gracefully
  NULL;
END;
$$;

-- ============================================================================
-- 6. VERIFY: Re-grant permissions (no changes to existing grants, just ensure
--    the functions we replaced still have proper grants)
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.store_processor_secret_key_in_vault(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_processor_secret_key_from_vault(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_trial_balance(UUID, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_account_balances_raw(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_ledger_health_check(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_cpa_export(UUID, DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.store_bank_aggregator_token_in_vault(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_webhook_secret(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_webhook_signature(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.store_processor_webhook_secret_in_vault(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_add_ledger(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_org_create_ledger(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_transaction(UUID) TO authenticated, service_role;
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.reprocess_processor_event(TEXT) TO service_role;
EXCEPTION WHEN undefined_function THEN
  NULL;
END;
$$;

SELECT 'RPC tenant isolation guards applied successfully' AS status;
