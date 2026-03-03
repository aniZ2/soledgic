-- ============================================================================
-- FIX: Auth guards for remaining vulnerable RPCs + scalar settings support
-- ============================================================================

-- ============================================================================
-- 1. get_user_organization_ids — add auth.uid() check
--    Prevents any authenticated user from enumerating another user's orgs.
--    RLS policies always call this with auth.uid(), which passes the guard.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_organization_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auth guard: only allow querying your own memberships
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF p_user_id <> auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  RETURN QUERY
  SELECT organization_id
  FROM organization_members
  WHERE user_id = p_user_id;
END;
$$;

-- ============================================================================
-- 2. initialize_ledger_accounts — add tenant-isolation guard
--    Called from an AFTER INSERT trigger on ledgers, so the creating user
--    will be an active owner/admin of the owning org.
-- ============================================================================

CREATE OR REPLACE FUNCTION initialize_ledger_accounts(p_ledger_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
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

  -- Get ledger mode
  SELECT ledger_mode INTO v_mode FROM ledgers WHERE id = p_ledger_id;

  IF v_mode = 'marketplace' THEN
    -- Create marketplace accounts
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES
      (p_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue', NULL),
      (p_ledger_id, 'creator_pool', 'reserve', 'Creator Pool', NULL),
      (p_ledger_id, 'processing_fees', 'reserve', 'Processing Fees', NULL),
      (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve', NULL),
      (p_ledger_id, 'refund_reserve', 'reserve', 'Refund Reserve', NULL),
      (p_ledger_id, 'cash', 'business', 'Operating Cash', NULL)
    ON CONFLICT DO NOTHING;
  ELSE
    -- Create standard mode accounts
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES
      (p_ledger_id, 'revenue', 'business', 'Revenue', NULL),
      (p_ledger_id, 'expense', 'business', 'Expenses', NULL),
      (p_ledger_id, 'cash', 'business', 'Cash', NULL),
      (p_ledger_id, 'accounts_receivable', 'business', 'Accounts Receivable', NULL),
      (p_ledger_id, 'accounts_payable', 'business', 'Accounts Payable', NULL),
      (p_ledger_id, 'owner_equity', 'business', 'Owner Equity', NULL),
      (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve', NULL)
    ON CONFLICT DO NOTHING;
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- Log but don't fail
  RAISE NOTICE 'Could not initialize accounts for ledger %: %', p_ledger_id, SQLERRM;
END;
$$;

-- ============================================================================
-- 3. Revoke authenticated from no-op functions (defense-in-depth)
-- ============================================================================

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION initialize_expense_categories(UUID) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END;
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION initialize_expense_accounts(UUID) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END;
$$;

-- ============================================================================
-- 4. Update merge_organization_settings_key to handle scalar JSONB values
--    Previously only worked with object patches (jsonb || jsonb merge).
--    Now: if the patch is not an object, replace the key entirely.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_organization_settings_key(
  p_organization_id UUID,
  p_settings_key TEXT,
  p_patch JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated JSONB;
BEGIN
  -- Allow service role without membership checks.
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Only owners/admins may patch org-level settings through this helper.
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = p_organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  UPDATE public.organizations o
  SET settings = jsonb_set(
    COALESCE(o.settings, '{}'::jsonb),
    ARRAY[p_settings_key],
    CASE
      -- Deep-merge when both the existing value and the patch are objects
      WHEN jsonb_typeof(p_patch) = 'object'
        AND jsonb_typeof(COALESCE(o.settings -> p_settings_key, '{}'::jsonb)) = 'object'
      THEN COALESCE(o.settings -> p_settings_key, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb)
      -- Replace entirely for scalar patches or when the existing value is a scalar
      ELSE p_patch
    END,
    true
  )
  WHERE o.id = p_organization_id
  RETURNING o.settings -> p_settings_key INTO v_updated;

  RETURN COALESCE(v_updated, '{}'::jsonb);
END;
$$;

-- ============================================================================
-- 5. Re-grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_user_organization_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_ledger_accounts(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.merge_organization_settings_key(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_organization_settings_key(UUID, TEXT, JSONB) TO authenticated, service_role;

SELECT 'RPC tenant isolation guards (batch 2) applied successfully' AS status;
