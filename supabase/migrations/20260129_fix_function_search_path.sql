-- Soledgic: Fix Function Search Path Security Warnings
-- Adds SET search_path = '' to all functions to prevent search_path injection attacks
-- This is a security best practice recommended by Supabase

-- ============================================================================
-- 1. RECREATE FUNCTIONS WITH IMMUTABLE SEARCH PATH
-- ============================================================================

-- get_plaid_token_from_vault
CREATE OR REPLACE FUNCTION public.get_plaid_token_from_vault(p_connection_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'plaid_token_' || p_connection_id::text;
  
  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.get_plaid_token_from_vault IS 
  'Retrieves Plaid access token from vault. Search path hardened.';


-- cleanup_old_payout_files
CREATE OR REPLACE FUNCTION public.cleanup_old_payout_files()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  -- Delete payout files older than 90 days
  WITH deleted AS (
    DELETE FROM public.payout_files
    WHERE created_at < NOW() - INTERVAL '90 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;
  
  RAISE NOTICE 'Cleaned up % old payout files', v_deleted;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_payout_files IS 
  'Cleans up payout files older than 90 days. Search path hardened.';


-- store_stripe_webhook_secret_in_vault
CREATE OR REPLACE FUNCTION public.store_stripe_webhook_secret_in_vault(
  p_ledger_id UUID,
  p_webhook_secret TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id UUID;
  v_secret_name TEXT;
BEGIN
  v_secret_name := 'stripe_webhook_' || p_ledger_id::text;
  
  -- Insert into vault (or update if exists)
  INSERT INTO vault.secrets (name, secret)
  VALUES (v_secret_name, p_webhook_secret)
  ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret
  RETURNING id INTO v_secret_id;
  
  -- Update ledger to reference vault
  UPDATE public.ledgers
  SET stripe_webhook_secret_vault_id = v_secret_id
  WHERE id = p_ledger_id;
  
  -- Remove from settings JSON if present
  UPDATE public.ledgers
  SET settings = settings - 'stripe_webhook_secret'
  WHERE id = p_ledger_id
    AND settings ? 'stripe_webhook_secret';
  
  RETURN v_secret_id;
END;
$$;

COMMENT ON FUNCTION public.store_stripe_webhook_secret_in_vault IS 
  'Stores Stripe webhook secret in vault and updates ledger reference. Search path hardened.';


-- get_stripe_webhook_secret_from_vault
CREATE OR REPLACE FUNCTION public.get_stripe_webhook_secret_from_vault(p_ledger_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret TEXT;
  v_vault_id UUID;
BEGIN
  -- First try vault
  SELECT stripe_webhook_secret_vault_id INTO v_vault_id
  FROM public.ledgers
  WHERE id = p_ledger_id;
  
  IF v_vault_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE id = v_vault_id;
    
    IF v_secret IS NOT NULL THEN
      RETURN v_secret;
    END IF;
  END IF;
  
  -- Fallback to settings JSON (legacy)
  SELECT settings->>'stripe_webhook_secret' INTO v_secret
  FROM public.ledgers
  WHERE id = p_ledger_id;
  
  RETURN v_secret;
END;
$$;

COMMENT ON FUNCTION public.get_stripe_webhook_secret_from_vault IS 
  'Retrieves Stripe webhook secret from vault with legacy fallback. Search path hardened.';


-- create_audit_entry
CREATE OR REPLACE FUNCTION public.create_audit_entry(
  p_ledger_id UUID,
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'api',
  p_actor_id TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_risk_score INTEGER DEFAULT 0,
  p_duration_ms INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_log (
    ledger_id,
    action,
    entity_type,
    entity_id,
    actor_type,
    actor_id,
    ip_address,
    user_agent,
    request_id,
    request_body,
    risk_score,
    duration_ms,
    created_at
  ) VALUES (
    p_ledger_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_actor_type,
    p_actor_id,
    p_ip_address,
    LEFT(p_user_agent, 500),
    p_request_id,
    p_metadata,
    p_risk_score,
    p_duration_ms,
    NOW()
  )
  RETURNING id INTO v_log_id;
  
  -- Alert on high-risk events
  IF p_risk_score >= 70 THEN
    INSERT INTO public.security_alerts (
      severity,
      alert_type,
      title,
      description,
      metadata
    ) VALUES (
      CASE 
        WHEN p_risk_score >= 90 THEN 'critical'
        WHEN p_risk_score >= 70 THEN 'warning'
        ELSE 'info'
      END,
      'high_risk_action',
      'High-risk action detected: ' || p_action,
      'A high-risk action was performed. Request ID: ' || COALESCE(p_request_id, 'unknown'),
      jsonb_build_object(
        'ledger_id', p_ledger_id,
        'action', p_action,
        'risk_score', p_risk_score,
        'ip_address', p_ip_address::text,
        'request_id', p_request_id
      )
    );
  END IF;
  
  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION public.create_audit_entry IS 
  'SOC 2 CC7.2 compliant audit entry creation. Search path hardened.';


-- cleanup_expired_nacha_files
CREATE OR REPLACE FUNCTION public.cleanup_expired_nacha_files()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.nacha_files
    WHERE expires_at < NOW() - INTERVAL '24 hours'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;
  
  RAISE NOTICE 'Cleaned up % expired NACHA files', v_deleted;
  
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_nacha_files IS 
  'Cleans up NACHA file records older than expiry + 24h. Search path hardened.';
