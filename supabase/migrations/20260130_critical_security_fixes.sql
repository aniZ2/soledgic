-- Soledgic: Critical Security Fixes from Audit
-- Date: December 22, 2025
-- Fixes: C4, M2, M4 from security audit

-- ============================================================================
-- C4: AUDIT LOG IMMUTABILITY
-- ============================================================================
-- Prevent any modification or deletion of audit records
-- Even service_role cannot bypass triggers (only superuser can drop them)

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- Prevent updates
DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- Prevent deletes
DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

COMMENT ON TRIGGER audit_log_no_update ON audit_log IS 
  'SOC 2 CC7.2 - Audit logs are immutable';
COMMENT ON TRIGGER audit_log_no_delete ON audit_log IS 
  'SOC 2 CC7.2 - Audit logs cannot be deleted';

-- ============================================================================
-- M4: VAULT ACCESS LOGGING
-- ============================================================================
-- Track who accesses sensitive credentials from vault

CREATE TABLE IF NOT EXISTS vault_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_type TEXT NOT NULL,  -- 'plaid_token', 'stripe_webhook', etc.
  secret_id TEXT NOT NULL,    -- Connection ID or ledger ID
  accessed_by TEXT NOT NULL,  -- DB role/user
  access_granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Immutable - same treatment as audit_log
ALTER TABLE vault_access_log ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS vault_access_log_no_update ON vault_access_log;
CREATE TRIGGER vault_access_log_no_update
BEFORE UPDATE ON vault_access_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

DROP TRIGGER IF EXISTS vault_access_log_no_delete ON vault_access_log;
CREATE TRIGGER vault_access_log_no_delete
BEFORE DELETE ON vault_access_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE INDEX IF NOT EXISTS idx_vault_access_log_secret 
ON vault_access_log(secret_type, secret_id, created_at DESC);

-- Update vault functions to log access
CREATE OR REPLACE FUNCTION public.get_plaid_token_from_vault(p_connection_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Log access attempt
  INSERT INTO public.vault_access_log (secret_type, secret_id, accessed_by, access_granted)
  VALUES ('plaid_token', p_connection_id::text, current_user, true);
  
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'plaid_token_' || p_connection_id::text;
  
  RETURN v_token;
END;
$$;

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
  -- Log access attempt
  INSERT INTO public.vault_access_log (secret_type, secret_id, accessed_by, access_granted)
  VALUES ('stripe_webhook', p_ledger_id::text, current_user, true);

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

-- ============================================================================
-- H3: ATOMIC BALANCE CALCULATION
-- ============================================================================
-- Database function for consistent balance reads

CREATE OR REPLACE FUNCTION get_account_balance(p_account_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END),
    0
  )
  FROM public.entries
  WHERE account_id = p_account_id;
$$;

COMMENT ON FUNCTION get_account_balance IS 
  'Atomic balance calculation - use instead of application-side summing';

-- ============================================================================
-- M1: PRECISE SPLIT CALCULATION
-- ============================================================================
-- Avoid rounding errors by working in cents and using remainder allocation

CREATE OR REPLACE FUNCTION calculate_split(
  p_gross_cents BIGINT,
  p_creator_percent NUMERIC
)
RETURNS TABLE (
  creator_cents BIGINT,
  platform_cents BIGINT
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_creator_cents BIGINT;
  v_platform_cents BIGINT;
BEGIN
  -- Calculate creator share (round down)
  v_creator_cents := FLOOR(p_gross_cents * p_creator_percent / 100);
  
  -- Platform gets remainder (ensures total = gross)
  v_platform_cents := p_gross_cents - v_creator_cents;
  
  RETURN QUERY SELECT v_creator_cents, v_platform_cents;
END;
$$;

COMMENT ON FUNCTION calculate_split IS 
  'Precise split calculation in cents. Platform gets remainder to avoid rounding loss.';

-- ============================================================================
-- SENSITIVE FIELDS TO EXCLUDE FROM AUDIT LOGS
-- ============================================================================
-- Reference list for application-side sanitization

CREATE TABLE IF NOT EXISTS audit_sensitive_fields (
  field_path TEXT PRIMARY KEY,
  reason TEXT NOT NULL
);

INSERT INTO audit_sensitive_fields (field_path, reason) VALUES
  ('account_number', 'Bank account number - PCI'),
  ('routing_number', 'Bank routing number - PCI'),
  ('ssn', 'Social Security Number - PII'),
  ('tax_id', 'Tax identification - PII'),
  ('bank_account', 'Bank account object - PCI'),
  ('payout_method.bank_account', 'Nested bank account - PCI'),
  ('metadata.bank_account', 'Nested bank account - PCI'),
  ('access_token', 'Plaid access token - credential'),
  ('api_key', 'API key - credential'),
  ('webhook_secret', 'Webhook secret - credential')
ON CONFLICT (field_path) DO NOTHING;

COMMENT ON TABLE audit_sensitive_fields IS 
  'Reference list of fields that must be sanitized before audit logging';
