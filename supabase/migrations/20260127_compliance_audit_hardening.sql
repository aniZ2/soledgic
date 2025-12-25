-- Soledgic: Compliance & Audit Hardening Migration
-- SOC 2 CC7.2 Compliant - Monitoring, Logging, and Secure Storage
-- 
-- This migration:
-- 1. Creates encrypted private storage for NACHA/batch payout files
-- 2. Adds RLS policies for secure signed URL generation
-- 3. Enhances audit logging with required compliance fields
-- 4. Creates NACHA file tracking table
-- 5. Creates risk_score_definitions table
--
-- NOTE: Views and functions are created in later migrations with security fixes:
-- - 20260128: Views with SECURITY INVOKER, RLS on risk_score_definitions
-- - 20260129: Functions with SET search_path = ''

-- ============================================================================
-- 1. PRIVATE STORAGE BUCKET FOR NACHA FILES
-- ============================================================================

-- Create the batch-payouts bucket (private, encrypted)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'batch-payouts', 
  'batch-payouts', 
  false,  -- Private bucket
  10485760,  -- 10MB limit
  ARRAY['text/plain', 'application/octet-stream', 'text/x-nacha']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760;

-- ============================================================================
-- 2. RLS POLICIES FOR BATCH PAYOUTS BUCKET
-- ============================================================================

-- Only service role can upload (Edge Functions)
DROP POLICY IF EXISTS "Service role upload batch payouts" ON storage.objects;
CREATE POLICY "Service role upload batch payouts"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'batch-payouts');

-- Only admins/owners can download via signed URLs
DROP POLICY IF EXISTS "Admin download batch payouts" ON storage.objects;
CREATE POLICY "Admin download batch payouts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'batch-payouts'
  AND EXISTS (
    SELECT 1 FROM organization_members om
    INNER JOIN ledgers l ON l.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
    AND om.status = 'active'
    AND l.id::text = split_part(name, '/', 1)
  )
);

-- Service role can delete (for cleanup)
DROP POLICY IF EXISTS "Service role delete batch payouts" ON storage.objects;
CREATE POLICY "Service role delete batch payouts"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'batch-payouts');

-- ============================================================================
-- 3. ENHANCED AUDIT LOG SCHEMA
-- ============================================================================

ALTER TABLE audit_log 
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS geo_country TEXT,
  ADD COLUMN IF NOT EXISTS geo_region TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_compliance 
ON audit_log(created_at DESC, action, risk_score)
WHERE risk_score > 0 OR action IN (
  'payout_initiated', 'payout_completed', 'payout_failed',
  'nacha_generated', 'batch_payout_executed',
  'api_key_created', 'api_key_rotated',
  'ledger_created', 'ledger_deleted',
  'user_login', 'user_logout', 'auth_failed'
);

CREATE INDEX IF NOT EXISTS idx_audit_log_request_trace
ON audit_log(request_id)
WHERE request_id IS NOT NULL;

-- ============================================================================
-- 4. NACHA FILE TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS nacha_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  
  batch_count INTEGER NOT NULL,
  entry_count INTEGER NOT NULL,
  total_debit_amount NUMERIC(14,2) NOT NULL,
  total_credit_amount NUMERIC(14,2) NOT NULL,
  effective_date DATE NOT NULL,
  
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  downloaded_at TIMESTAMPTZ,
  downloaded_by UUID REFERENCES auth.users(id),
  
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE nacha_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "NACHA files via org membership" ON nacha_files;
CREATE POLICY "NACHA files via org membership"
ON nacha_files FOR ALL
USING (
  ledger_id IN (
    SELECT l.id FROM ledgers l
    INNER JOIN organization_members om ON om.organization_id = l.organization_id
    WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
    AND om.status = 'active'
  )
);

CREATE INDEX IF NOT EXISTS idx_nacha_files_ledger ON nacha_files(ledger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nacha_files_request ON nacha_files(request_id) WHERE request_id IS NOT NULL;

-- ============================================================================
-- 5. RISK SCORING REFERENCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS risk_score_definitions (
  action TEXT PRIMARY KEY,
  base_score INTEGER NOT NULL,
  description TEXT,
  soc2_control TEXT
);

INSERT INTO risk_score_definitions (action, base_score, description, soc2_control) VALUES
  ('auth_failed', 30, 'Failed authentication attempt', 'CC6.1'),
  ('rate_limited', 50, 'Rate limit exceeded', 'CC6.1'),
  ('webhook_invalid_signature', 80, 'Invalid webhook signature', 'CC6.1'),
  ('webhook_replay_attempt', 70, 'Webhook replay attack detected', 'CC6.1'),
  ('blocked_ip', 90, 'Blocked IP attempted access', 'CC6.1'),
  ('ssrf_attempt', 95, 'SSRF attack attempt', 'CC6.1'),
  ('payout_initiated', 40, 'Payout initiated (financial)', 'CC6.2'),
  ('batch_payout_executed', 60, 'Batch payout executed (high value)', 'CC6.2'),
  ('nacha_generated', 50, 'NACHA file generated (contains bank data)', 'CC6.2'),
  ('api_key_created', 40, 'New API key created', 'CC6.3'),
  ('api_key_rotated', 20, 'API key rotated (good practice)', 'CC6.3'),
  ('ledger_deleted', 60, 'Ledger deleted (destructive)', 'CC6.6'),
  ('webhook_secret_rotated', 20, 'Webhook secret rotated', 'CC6.3')
ON CONFLICT (action) DO UPDATE SET
  base_score = EXCLUDED.base_score,
  description = EXCLUDED.description,
  soc2_control = EXCLUDED.soc2_control;

COMMENT ON TABLE nacha_files IS 'Tracks generated NACHA files with full audit trail.';
COMMENT ON TABLE risk_score_definitions IS 'Reference table for risk scoring. Maps to SOC 2 controls.';
