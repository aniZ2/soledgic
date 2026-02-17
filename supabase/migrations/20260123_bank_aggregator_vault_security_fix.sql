-- Soledgic: bank_aggregator Vault Security Fix
-- Fixes: get_bank_aggregator_token_from_vault to properly reject marker strings
-- Date: December 23, 2024

-- Drop and recreate the function with the security fix
CREATE OR REPLACE FUNCTION get_bank_aggregator_token_from_vault(p_connection_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_vault_id UUID;
  v_token TEXT;
BEGIN
  -- Get vault ID from connection
  SELECT access_token_vault_id INTO v_vault_id
  FROM bank_aggregator_connections
  WHERE id = p_connection_id;
  
  IF v_vault_id IS NULL THEN
    -- Fallback to plaintext for unmigrated connections
    SELECT access_token INTO v_token
    FROM bank_aggregator_connections
    WHERE id = p_connection_id;
    
    -- SECURITY FIX: Reject marker strings from incomplete migrations
    -- These indicate the token should be in vault but isn't accessible
    IF v_token IS NULL OR v_token = '[ENCRYPTED]' OR v_token = '[PENDING_VAULT]' THEN
      RETURN NULL;
    END IF;
    
    RETURN v_token;
  END IF;
  
  -- Get from vault
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE id = v_vault_id;
  
  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_bank_aggregator_token_from_vault IS 
  'Retrieve bank_aggregator access token from Vault. Returns NULL for marker strings like [ENCRYPTED] (SECURITY DEFINER)';
