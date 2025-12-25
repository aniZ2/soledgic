-- Soledgic: Security Audit Improvements
-- Addresses findings from security audit report
-- 1. Rate limit cleanup function
-- 2. Audit log retention policy
-- 3. Request ID tracking
-- 4. API key generation function
-- 5. Security dashboard and alerts
--
-- NOTE: pg_cron scheduling requires the extension to be enabled.
-- Enable it in Supabase Dashboard > Database > Extensions > pg_cron
-- Then run the cron.schedule commands manually (see comments below)

-- ============================================================================
-- 1. RATE LIMIT CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '1 hour';
  
  RAISE NOTICE 'Rate limits cleanup completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- To schedule (after enabling pg_cron extension):
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 'SELECT cleanup_rate_limits()');

-- ============================================================================
-- 2. AUDIT LOG RETENTION (90 days)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_audit_log(p_retention_days INTEGER DEFAULT 90) RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM audit_log
    WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL
      AND NOT (risk_score >= 70 AND created_at > NOW() - INTERVAL '180 days')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;
  
  RAISE NOTICE 'Audit log cleanup: deleted % records older than % days', v_deleted, p_retention_days;
  
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- To schedule (after enabling pg_cron extension):
-- SELECT cron.schedule('cleanup-audit-log', '0 3 * * *', 'SELECT cleanup_audit_log(90)');

-- ============================================================================
-- 3. REQUEST ID TRACKING
-- ============================================================================

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_request_id 
  ON audit_log(request_id) 
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_security_analysis
  ON audit_log(created_at DESC, risk_score DESC, action)
  WHERE risk_score > 0;

-- ============================================================================
-- 4. API KEY GENERATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_api_key(p_is_production BOOLEAN DEFAULT false)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_random_bytes BYTEA;
  v_key TEXT;
BEGIN
  v_prefix := CASE WHEN p_is_production THEN 'sk_live_' ELSE 'sk_test_' END;
  v_random_bytes := gen_random_bytes(16);
  v_key := v_prefix || encode(v_random_bytes, 'hex');
  RETURN v_key;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_ledger_with_api_key(
  p_organization_id UUID,
  p_business_name TEXT,
  p_ledger_mode TEXT DEFAULT 'standard',
  p_is_production BOOLEAN DEFAULT false
) RETURNS TABLE (
  ledger_id UUID,
  api_key TEXT,
  api_key_prefix TEXT
) AS $$
DECLARE
  v_api_key TEXT;
  v_api_key_hash TEXT;
  v_ledger_id UUID;
BEGIN
  v_api_key := generate_api_key(p_is_production);
  v_api_key_hash := encode(sha256(v_api_key::bytea), 'hex');
  
  INSERT INTO ledgers (
    organization_id,
    business_name,
    ledger_mode,
    api_key_hash,
    status
  ) VALUES (
    p_organization_id,
    p_business_name,
    p_ledger_mode,
    v_api_key_hash,
    'active'
  )
  RETURNING id INTO v_ledger_id;
  
  RETURN QUERY SELECT 
    v_ledger_id,
    v_api_key,
    LEFT(v_api_key, 12) || '...' || RIGHT(v_api_key, 4);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_ledger_with_api_key IS 
  'Creates a ledger with a cryptographically secure API key. The full API key is returned only once!';

-- ============================================================================
-- 5. WEBHOOK SECRET DISPLAY (Last 4 chars only)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_webhook_endpoint_safe(p_endpoint_id UUID)
RETURNS TABLE (
  id UUID,
  url TEXT,
  description TEXT,
  events TEXT[],
  is_active BOOLEAN,
  secret_hint TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    we.id,
    we.url,
    we.description,
    we.events,
    we.is_active,
    '...' || RIGHT(we.secret, 4) as secret_hint,
    we.created_at
  FROM webhook_endpoints we
  WHERE we.id = p_endpoint_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. SECURITY DASHBOARD VIEW
-- ============================================================================

CREATE OR REPLACE VIEW security_dashboard AS
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  action,
  COUNT(*) as event_count,
  COUNT(DISTINCT ip_address) as unique_ips,
  AVG(risk_score)::INTEGER as avg_risk_score,
  MAX(risk_score) as max_risk_score,
  COUNT(*) FILTER (WHERE risk_score >= 70) as high_risk_count
FROM audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), action
ORDER BY hour DESC, event_count DESC;

COMMENT ON VIEW security_dashboard IS 'Hourly security metrics for the last 24 hours';

-- ============================================================================
-- 7. RATE LIMIT VIOLATION TRACKING
-- ============================================================================

ALTER TABLE rate_limits 
  ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION get_rate_limit_offenders(p_min_violations INTEGER DEFAULT 5)
RETURNS TABLE (
  api_key_prefix TEXT,
  endpoint TEXT,
  violation_count INTEGER,
  last_violation TIMESTAMPTZ,
  is_blocked BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    LEFT(rl.key, 12) || '...' as api_key_prefix,
    rl.endpoint,
    rl.violation_count,
    rl.last_violation_at as last_violation,
    (rl.blocked_until IS NOT NULL AND rl.blocked_until > NOW()) as is_blocked
  FROM rate_limits rl
  WHERE rl.violation_count >= p_min_violations
  ORDER BY rl.violation_count DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. SECURITY ALERTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_unacked 
  ON security_alerts(severity, created_at DESC) 
  WHERE acknowledged_at IS NULL;

ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists, then create
DROP POLICY IF EXISTS "Only admins can view security alerts" ON security_alerts;

CREATE POLICY "Only admins can view security alerts"
  ON security_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
      AND om.role = 'owner'
      AND om.status = 'active'
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION cleanup_rate_limits IS 'Cleanup expired rate limit records (run hourly via cron)';
COMMENT ON FUNCTION cleanup_audit_log IS 'Cleanup old audit logs with retention policy (run daily via cron)';
COMMENT ON FUNCTION generate_api_key IS 'Generate cryptographically secure API key with proper prefix';
COMMENT ON FUNCTION get_rate_limit_offenders IS 'Get API keys with high rate limit violations';
COMMENT ON TABLE security_alerts IS 'Security alerts for monitoring and incident response';

-- ============================================================================
-- POST-MIGRATION: Enable pg_cron and schedule jobs
-- ============================================================================
-- 
-- After this migration, enable pg_cron in Supabase Dashboard:
-- 1. Go to Database > Extensions
-- 2. Search for "pg_cron" and enable it
-- 3. Run these commands in SQL Editor:
--
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 'SELECT cleanup_rate_limits()');
-- SELECT cron.schedule('cleanup-audit-log', '0 3 * * *', 'SELECT cleanup_audit_log(90)');
--
-- To verify cron jobs are scheduled:
-- SELECT * FROM cron.job;
