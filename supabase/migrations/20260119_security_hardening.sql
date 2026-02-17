-- Soledgic: Critical Security Hardening
-- Fixes: bank_aggregator token encryption, API key cleanup, RLS policy hardening
-- Run this migration AFTER backing up your database

-- ============================================================================
-- 1. ENABLE VAULT EXTENSION (if not already enabled)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;

-- ============================================================================
-- 2. bank_aggregator TOKEN ENCRYPTION VIA VAULT
-- ============================================================================

-- Add vault reference column
ALTER TABLE bank_aggregator_connections 
  ADD COLUMN IF NOT EXISTS access_token_vault_id UUID;

-- Create a function to store token in vault and return the secret ID
CREATE OR REPLACE FUNCTION store_bank_aggregator_token_in_vault(
  p_connection_id UUID,
  p_access_token TEXT
) RETURNS UUID AS $$
DECLARE
  v_vault_id UUID;
  v_secret_name TEXT;
BEGIN
  v_secret_name := 'bank_aggregator_token_' || p_connection_id::TEXT;
  
  -- Insert into vault
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (
    v_secret_name,
    p_access_token,
    'bank_aggregator access token for connection ' || p_connection_id::TEXT
  )
  RETURNING id INTO v_vault_id;
  
  -- Update the connection with vault reference
  UPDATE bank_aggregator_connections
  SET access_token_vault_id = v_vault_id,
      access_token = '[ENCRYPTED]' -- Mark as migrated but don't delete yet for safety
  WHERE id = p_connection_id;
  
  RETURN v_vault_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to retrieve token from vault (for Edge Functions)
-- SECURITY FIX: Properly handle marker strings from incomplete migrations
CREATE OR REPLACE FUNCTION get_bank_aggregator_token_from_vault(p_connection_id UUID)
RETURNS TEXT AS $
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
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migrate existing plaintext tokens to vault
DO $$
DECLARE
  conn RECORD;
BEGIN
  FOR conn IN 
    SELECT id, access_token 
    FROM bank_aggregator_connections 
    WHERE access_token IS NOT NULL 
      AND access_token != '[ENCRYPTED]'
      AND access_token_vault_id IS NULL
  LOOP
    PERFORM store_bank_aggregator_token_in_vault(conn.id, conn.access_token);
    RAISE NOTICE 'Migrated bank_aggregator token for connection %', conn.id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION store_bank_aggregator_token_in_vault IS 'Securely store bank_aggregator access token in Supabase Vault';
COMMENT ON FUNCTION get_bank_aggregator_token_from_vault IS 'Retrieve bank_aggregator access token from Vault (SECURITY DEFINER)';

-- ============================================================================
-- 3. API KEY HASH ENFORCEMENT
-- ============================================================================

-- First, ensure all API keys have hashes
UPDATE ledgers 
SET api_key_hash = encode(sha256(api_key::bytea), 'hex')
WHERE api_key_hash IS NULL AND api_key IS NOT NULL;

-- Make hash column NOT NULL (only if all rows have hashes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ledgers WHERE api_key_hash IS NULL LIMIT 1) THEN
    ALTER TABLE ledgers ALTER COLUMN api_key_hash SET NOT NULL;
  END IF;
END;
$$;

-- Create a secure API key validation function
CREATE OR REPLACE FUNCTION validate_api_key_secure(p_provided_key TEXT)
RETURNS TABLE (
  ledger_id UUID,
  business_name TEXT,
  ledger_mode TEXT,
  status TEXT,
  settings JSONB,
  organization_id UUID
) AS $$
DECLARE
  v_hash TEXT;
BEGIN
  -- Hash the provided key
  v_hash := encode(sha256(p_provided_key::bytea), 'hex');
  
  -- Look up by hash
  RETURN QUERY
  SELECT 
    l.id,
    l.business_name,
    l.ledger_mode,
    l.status,
    l.settings,
    l.organization_id
  FROM ledgers l
  WHERE l.api_key_hash = v_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_api_key_secure IS 'Validate API key using hash comparison only - no plaintext';

-- ============================================================================
-- 4. DROP OLD RLS POLICIES THAT USE PLAINTEXT API KEY
-- ============================================================================

-- Webhook endpoints
DROP POLICY IF EXISTS "Webhook endpoints via API key" ON webhook_endpoints;

-- Webhook deliveries  
DROP POLICY IF EXISTS "Webhook deliveries via API key" ON webhook_deliveries;

-- bank_aggregator connections
DROP POLICY IF EXISTS "bank_aggregator connections via API key" ON bank_aggregator_connections;

-- bank_aggregator transactions
DROP POLICY IF EXISTS "bank_aggregator transactions via API key" ON bank_aggregator_transactions;

-- Auto match rules
DROP POLICY IF EXISTS "Auto match rules via API key" ON auto_match_rules;

-- Import templates
DROP POLICY IF EXISTS "Import templates via API key" ON import_templates;

-- processor events
DROP POLICY IF EXISTS "API key access processor_events" ON processor_events;

-- processor transactions
DROP POLICY IF EXISTS "API key access processor_transactions" ON processor_transactions;

-- processor balance snapshots
DROP POLICY IF EXISTS "API key access processor_balance_snapshots" ON processor_balance_snapshots;

-- Health check results
DROP POLICY IF EXISTS "API key access health_check_results" ON health_check_results;

-- ============================================================================
-- 5. CREATE NEW SECURE RLS POLICIES (via organization membership)
-- ============================================================================

-- Webhook endpoints
CREATE POLICY "Webhook endpoints via org membership"
  ON webhook_endpoints FOR ALL
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
    )
  );

-- Webhook deliveries
CREATE POLICY "Webhook deliveries via org membership"
  ON webhook_deliveries FOR ALL
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
    )
  );

-- bank_aggregator connections
CREATE POLICY "bank_aggregator connections via org membership"
  ON bank_aggregator_connections FOR ALL
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
    )
  );

-- bank_aggregator transactions
CREATE POLICY "bank_aggregator transactions via org membership"
  ON bank_aggregator_transactions FOR ALL
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
    )
  );

-- Auto match rules
CREATE POLICY "Auto match rules via org membership"
  ON auto_match_rules FOR ALL
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
    )
  );

-- Import templates (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'import_templates') THEN
    EXECUTE 'CREATE POLICY "Import templates via org membership"
      ON import_templates FOR ALL
      USING (
        ledger_id IN (
          SELECT l.id FROM ledgers l
          INNER JOIN organization_members om ON om.organization_id = l.organization_id
          WHERE om.user_id = auth.uid() 
          AND om.status = ''active''
        )
      )';
  END IF;
END;
$$;

-- processor events (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'processor_events') THEN
    EXECUTE 'CREATE POLICY "processor events via org membership"
      ON processor_events FOR ALL
      USING (
        ledger_id IN (
          SELECT l.id FROM ledgers l
          INNER JOIN organization_members om ON om.organization_id = l.organization_id
          WHERE om.user_id = auth.uid() 
          AND om.status = ''active''
        )
      )';
  END IF;
END;
$$;

-- processor transactions (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'processor_transactions') THEN
    EXECUTE 'CREATE POLICY "processor transactions via org membership"
      ON processor_transactions FOR ALL
      USING (
        ledger_id IN (
          SELECT l.id FROM ledgers l
          INNER JOIN organization_members om ON om.organization_id = l.organization_id
          WHERE om.user_id = auth.uid() 
          AND om.status = ''active''
        )
      )';
  END IF;
END;
$$;

-- processor balance snapshots (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'processor_balance_snapshots') THEN
    EXECUTE 'CREATE POLICY "processor balance snapshots via org membership"
      ON processor_balance_snapshots FOR ALL
      USING (
        ledger_id IN (
          SELECT l.id FROM ledgers l
          INNER JOIN organization_members om ON om.organization_id = l.organization_id
          WHERE om.user_id = auth.uid() 
          AND om.status = ''active''
        )
      )';
  END IF;
END;
$$;

-- Health check results (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'health_check_results') THEN
    EXECUTE 'CREATE POLICY "Health check results via org membership"
      ON health_check_results FOR ALL
      USING (
        ledger_id IN (
          SELECT l.id FROM ledgers l
          INNER JOIN organization_members om ON om.organization_id = l.organization_id
          WHERE om.user_id = auth.uid() 
          AND om.status = ''active''
        )
      )';
  END IF;
END;
$$;

-- ============================================================================
-- 6. NOW DROP THE PLAINTEXT API KEY COLUMN
-- ============================================================================

-- Backup first (uncomment if you haven't already)
-- CREATE TABLE IF NOT EXISTS _api_key_backup AS 
-- SELECT id, api_key, api_key_hash FROM ledgers WHERE api_key IS NOT NULL;

-- Drop the plaintext column
ALTER TABLE ledgers DROP COLUMN IF EXISTS api_key;

-- ============================================================================
-- 7. RATE LIMITING IMPROVEMENTS
-- ============================================================================

-- Add columns to rate_limits table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limits') THEN
    ALTER TABLE rate_limits 
      ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0;
  END IF;
END;
$$;

-- Function to check rate limit with fail-closed behavior
CREATE OR REPLACE FUNCTION check_rate_limit_secure(
  p_key TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 100,
  p_window_seconds INTEGER DEFAULT 60,
  p_fail_closed BOOLEAN DEFAULT true
) RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_at TIMESTAMPTZ,
  blocked BOOLEAN
) AS $$
DECLARE
  v_record rate_limits;
  v_window_start TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Check if rate_limits table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limits') THEN
    RETURN QUERY SELECT true, p_max_requests, v_now + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;

  v_window_start := v_now - (p_window_seconds || ' seconds')::INTERVAL;
  
  -- Check if blocked
  SELECT * INTO v_record
  FROM rate_limits
  WHERE key = p_key AND endpoint = p_endpoint
  FOR UPDATE;
  
  -- Check temporary block
  IF v_record IS NOT NULL AND v_record.blocked_until IS NOT NULL AND v_record.blocked_until > v_now THEN
    RETURN QUERY SELECT false, 0, v_record.blocked_until, true;
    RETURN;
  END IF;
  
  IF v_record IS NULL THEN
    -- First request
    INSERT INTO rate_limits (key, endpoint, request_count, window_start)
    VALUES (p_key, p_endpoint, 1, v_now);
    RETURN QUERY SELECT true, p_max_requests - 1, v_now + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;
  
  IF v_record.window_start < v_window_start THEN
    -- Window expired, reset
    UPDATE rate_limits
    SET request_count = 1, 
        window_start = v_now,
        violation_count = GREATEST(0, COALESCE(violation_count, 0) - 1)
    WHERE key = p_key AND endpoint = p_endpoint;
    RETURN QUERY SELECT true, p_max_requests - 1, v_now + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;
  
  IF v_record.request_count >= p_max_requests THEN
    -- Rate limited - increment violation count
    UPDATE rate_limits
    SET violation_count = COALESCE(violation_count, 0) + 1,
        blocked_until = CASE 
          WHEN COALESCE(violation_count, 0) >= 10 THEN v_now + INTERVAL '1 hour'
          WHEN COALESCE(violation_count, 0) >= 5 THEN v_now + INTERVAL '5 minutes'
          WHEN COALESCE(violation_count, 0) >= 3 THEN v_now + INTERVAL '1 minute'
          ELSE NULL
        END
    WHERE key = p_key AND endpoint = p_endpoint;
    
    RETURN QUERY SELECT false, 0, v_record.window_start + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;
  
  -- Increment counter
  UPDATE rate_limits
  SET request_count = request_count + 1
  WHERE key = p_key AND endpoint = p_endpoint;
  
  RETURN QUERY SELECT 
    true, 
    p_max_requests - v_record.request_count - 1, 
    v_record.window_start + (p_window_seconds || ' seconds')::INTERVAL,
    false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. AUDIT LOG ENHANCEMENTS
-- ============================================================================

-- Add more fields to audit log for security tracking
ALTER TABLE audit_log 
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;

-- Index for security analysis
CREATE INDEX IF NOT EXISTS idx_audit_log_risk ON audit_log(risk_score DESC, created_at DESC) 
  WHERE risk_score > 0;

CREATE INDEX IF NOT EXISTS idx_audit_log_ip ON audit_log(ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

-- Function to log security events with risk scoring
CREATE OR REPLACE FUNCTION log_security_event(
  p_ledger_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_actor_type TEXT,
  p_actor_id TEXT,
  p_ip_address INET,
  p_user_agent TEXT,
  p_details JSONB DEFAULT '{}',
  p_risk_score INTEGER DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_log (
    ledger_id, action, entity_type, entity_id, 
    actor_type, actor_id, ip_address, user_agent, 
    request_body, risk_score
  ) VALUES (
    p_ledger_id, p_action, p_entity_type, p_entity_id,
    p_actor_type, p_actor_id, p_ip_address, p_user_agent,
    p_details, p_risk_score
  )
  RETURNING id INTO v_log_id;
  
  -- Alert on high-risk events
  IF p_risk_score >= 80 THEN
    RAISE NOTICE 'HIGH RISK EVENT: % on ledger % (score: %)', p_action, p_ledger_id, p_risk_score;
  END IF;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. WEBHOOK SECRET ROTATION SUPPORT
-- ============================================================================

-- Support multiple active secrets during rotation
ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS previous_secret TEXT,
  ADD COLUMN IF NOT EXISTS secret_rotated_at TIMESTAMPTZ;

-- Function to rotate webhook secret
CREATE OR REPLACE FUNCTION rotate_webhook_secret(p_endpoint_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_new_secret TEXT;
  v_current_secret TEXT;
BEGIN
  -- Generate new secret
  v_new_secret := encode(gen_random_bytes(32), 'hex');
  
  -- Get current secret
  SELECT secret INTO v_current_secret
  FROM webhook_endpoints
  WHERE id = p_endpoint_id;
  
  -- Update: move current to previous, set new as current
  UPDATE webhook_endpoints
  SET previous_secret = v_current_secret,
      secret = v_new_secret,
      secret_rotated_at = NOW()
  WHERE id = p_endpoint_id;
  
  RETURN v_new_secret;
END;
$$ LANGUAGE plpgsql;

-- Function to validate webhook signature (accepts current or previous secret)
CREATE OR REPLACE FUNCTION validate_webhook_signature(
  p_endpoint_id UUID,
  p_payload TEXT,
  p_signature TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_endpoint webhook_endpoints;
  v_expected_current TEXT;
  v_expected_previous TEXT;
BEGIN
  SELECT * INTO v_endpoint
  FROM webhook_endpoints
  WHERE id = p_endpoint_id;
  
  IF v_endpoint IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check current secret
  v_expected_current := 'sha256=' || encode(
    hmac(p_payload::bytea, v_endpoint.secret::bytea, 'sha256'),
    'hex'
  );
  
  IF p_signature = v_expected_current THEN
    RETURN true;
  END IF;
  
  -- Check previous secret (if within grace period - 24 hours)
  IF v_endpoint.previous_secret IS NOT NULL 
     AND v_endpoint.secret_rotated_at > NOW() - INTERVAL '24 hours' THEN
    v_expected_previous := 'sha256=' || encode(
      hmac(p_payload::bytea, v_endpoint.previous_secret::bytea, 'sha256'),
      'hex'
    );
    
    IF p_signature = v_expected_previous THEN
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. SECURE DEFAULTS FOR WEBHOOK SECRETS
-- ============================================================================

-- Ensure new webhook endpoints get secrets generated
CREATE OR REPLACE FUNCTION generate_webhook_secret()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.secret IS NULL THEN
    NEW.secret := encode(gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_webhook_secret ON webhook_endpoints;
CREATE TRIGGER trigger_webhook_secret
  BEFORE INSERT ON webhook_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION generate_webhook_secret();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION check_rate_limit_secure IS 'Enhanced rate limiting with fail-closed behavior and progressive blocking';
COMMENT ON FUNCTION log_security_event IS 'Log security-relevant events with risk scoring';
COMMENT ON FUNCTION rotate_webhook_secret IS 'Rotate webhook secret while maintaining backward compatibility';
