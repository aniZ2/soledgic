-- Soledgic: Move Stripe Webhook Secrets to Vault
-- Security fix: Stripe webhook secrets should not be stored in plaintext JSON

-- ============================================================================
-- 1. ADD VAULT REFERENCE COLUMN TO LEDGERS
-- ============================================================================

ALTER TABLE ledgers 
  ADD COLUMN IF NOT EXISTS stripe_webhook_secret_vault_id UUID;

-- ============================================================================
-- 2. FUNCTION TO STORE STRIPE WEBHOOK SECRET IN VAULT
-- ============================================================================

CREATE OR REPLACE FUNCTION store_stripe_webhook_secret_in_vault(
  p_ledger_id UUID,
  p_webhook_secret TEXT
) RETURNS UUID AS $$
DECLARE
  v_vault_id UUID;
  v_secret_name TEXT;
  v_existing_vault_id UUID;
BEGIN
  v_secret_name := 'stripe_webhook_' || p_ledger_id::TEXT;
  
  -- Check if there's an existing vault entry
  SELECT stripe_webhook_secret_vault_id INTO v_existing_vault_id
  FROM ledgers
  WHERE id = p_ledger_id;
  
  -- If exists, update the vault entry
  IF v_existing_vault_id IS NOT NULL THEN
    UPDATE vault.secrets
    SET secret = p_webhook_secret,
        updated_at = NOW()
    WHERE id = v_existing_vault_id;
    RETURN v_existing_vault_id;
  END IF;
  
  -- Insert new vault entry
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (
    v_secret_name,
    p_webhook_secret,
    'Stripe webhook secret for ledger ' || p_ledger_id::TEXT
  )
  RETURNING id INTO v_vault_id;
  
  -- Update ledger with vault reference and remove from settings
  UPDATE ledgers
  SET stripe_webhook_secret_vault_id = v_vault_id,
      settings = settings - 'stripe_webhook_secret'  -- Remove from JSON
  WHERE id = p_ledger_id;
  
  RETURN v_vault_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. FUNCTION TO RETRIEVE STRIPE WEBHOOK SECRET FROM VAULT
-- ============================================================================

CREATE OR REPLACE FUNCTION get_stripe_webhook_secret_from_vault(p_ledger_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_vault_id UUID;
  v_secret TEXT;
  v_settings_secret TEXT;
BEGIN
  -- Get vault ID from ledger
  SELECT stripe_webhook_secret_vault_id, 
         settings->>'stripe_webhook_secret'
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
  -- (This will be null for new ledgers or after migration)
  RETURN v_settings_secret;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. MIGRATE EXISTING SECRETS TO VAULT
-- ============================================================================

DO $$
DECLARE
  ledger_record RECORD;
  v_webhook_secret TEXT;
BEGIN
  FOR ledger_record IN 
    SELECT id, settings
    FROM ledgers
    WHERE settings->>'stripe_webhook_secret' IS NOT NULL
      AND stripe_webhook_secret_vault_id IS NULL
  LOOP
    v_webhook_secret := ledger_record.settings->>'stripe_webhook_secret';
    
    IF v_webhook_secret IS NOT NULL AND v_webhook_secret != '' THEN
      PERFORM store_stripe_webhook_secret_in_vault(ledger_record.id, v_webhook_secret);
      RAISE NOTICE 'Migrated Stripe webhook secret for ledger %', ledger_record.id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION store_stripe_webhook_secret_in_vault IS 
  'Securely store Stripe webhook secret in Supabase Vault. Removes from settings JSON.';
  
COMMENT ON FUNCTION get_stripe_webhook_secret_from_vault IS 
  'Retrieve Stripe webhook secret from Vault. Falls back to settings JSON for unmigrated ledgers.';

COMMENT ON COLUMN ledgers.stripe_webhook_secret_vault_id IS 
  'Reference to Vault secret containing Stripe webhook secret';
