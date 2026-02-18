-- ============================================================================
-- Atomic JSONB merge helpers for organizations.settings
-- Prevents read-then-write races when multiple requests patch nested settings.
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
    COALESCE(o.settings -> p_settings_key, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb),
    true
  )
  WHERE o.id = p_organization_id
  RETURNING o.settings -> p_settings_key INTO v_updated;

  RETURN COALESCE(v_updated, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_organization_settings_key(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_organization_settings_key(UUID, TEXT, JSONB) TO authenticated, service_role;

