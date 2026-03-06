-- Fix store_bank_aggregator_token_in_vault: restore connection_id parameter
-- The function was incorrectly changed to take p_ledger_id in 20260228/20260310,
-- but get_bank_aggregator_token_from_vault still looks up by connection_id.
-- A ledger can have multiple connections, so naming by connection_id is correct.

DROP FUNCTION IF EXISTS public.store_bank_aggregator_token_in_vault(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.store_bank_aggregator_token_in_vault(
  p_connection_id UUID,
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
      JOIN public.bank_aggregator_connections bac ON bac.ledger_id = l.id
      WHERE bac.id = p_connection_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Delete any existing secret for this connection (rotation support)
  DELETE FROM vault.secrets
  WHERE name = 'bank_aggregator_token_' || p_connection_id::TEXT;

  -- Store in vault
  BEGIN
    INSERT INTO vault.secrets (secret, name, description)
    VALUES (
      p_access_token,
      'bank_aggregator_token_' || p_connection_id::TEXT,
      'Bank aggregator access token for connection ' || p_connection_id::TEXT
    )
    RETURNING id INTO v_secret_id;

    -- Atomically update connection record
    UPDATE public.bank_aggregator_connections
    SET access_token_vault_id = v_secret_id,
        access_token = '[ENCRYPTED]'
    WHERE id = p_connection_id;

    RETURN v_secret_id;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Vault access not available - token not stored securely';
    RETURN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_bank_aggregator_token_in_vault(UUID, TEXT) TO service_role;
