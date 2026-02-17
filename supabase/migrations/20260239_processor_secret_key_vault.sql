-- Soledgic: processor Secret Key Vault Storage
-- Security: Store processor API keys in Supabase Vault, not in settings JSON

-- ============================================================================
-- 1. ADD VAULT REFERENCE COLUMN TO LEDGERS
-- ============================================================================

ALTER TABLE ledgers 
  ADD COLUMN IF NOT EXISTS processor_secret_key_vault_id UUID;

COMMENT ON COLUMN ledgers.processor_secret_key_vault_id IS 
  'Reference to Vault secret containing processor secret key';

-- ============================================================================
-- 2. FUNCTION TO STORE processor SECRET KEY IN VAULT
-- ============================================================================

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
      settings = settings - 'processor_secret_key'  -- Remove from JSON
  WHERE id = p_ledger_id;
  
  RETURN v_vault_id;
END;
$$;

-- ============================================================================
-- 3. FUNCTION TO RETRIEVE processor SECRET KEY FROM VAULT
-- ============================================================================

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

-- ============================================================================
-- 4. MIGRATE EXISTING SECRETS TO VAULT
-- ============================================================================

DO $$
DECLARE
  ledger_record RECORD;
  v_secret_key TEXT;
BEGIN
  FOR ledger_record IN 
    SELECT id, settings
    FROM ledgers
    WHERE settings->>'processor_secret_key' IS NOT NULL
      AND processor_secret_key_vault_id IS NULL
  LOOP
    v_secret_key := ledger_record.settings->>'processor_secret_key';
    
    IF v_secret_key IS NOT NULL AND v_secret_key != '' THEN
      PERFORM store_processor_secret_key_in_vault(ledger_record.id, v_secret_key);
      RAISE NOTICE 'Migrated processor secret key for ledger %', ledger_record.id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 5. GRANT PERMISSIONS
-- ============================================================================

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION store_processor_secret_key_in_vault(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION store_processor_secret_key_in_vault(UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION get_processor_secret_key_from_vault(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_processor_secret_key_from_vault(UUID) TO service_role;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION store_processor_secret_key_in_vault IS 
  'Securely store processor secret key in Supabase Vault. Removes from settings JSON.';
  
COMMENT ON FUNCTION get_processor_secret_key_from_vault IS 
  'Retrieve processor secret key from Vault. Falls back to settings JSON for unmigrated ledgers.';
