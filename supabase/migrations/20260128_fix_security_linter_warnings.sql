-- Soledgic: Security Linter Fixes - Views & RLS
-- Fixes:
-- 1. Creates compliance views with SECURITY INVOKER
-- 2. Enables RLS on risk_score_definitions table

-- ============================================================================
-- 1. COMPLIANCE MONITORING VIEWS (SECURITY INVOKER)
-- ============================================================================

DROP VIEW IF EXISTS compliance_security_summary;
CREATE VIEW compliance_security_summary 
WITH (security_invoker = true)
AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  action,
  COUNT(*) as event_count,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(DISTINCT COALESCE(actor_id, 'system')) as unique_actors,
  AVG(risk_score)::INTEGER as avg_risk_score,
  MAX(risk_score) as max_risk_score,
  COUNT(*) FILTER (WHERE risk_score >= 70) as high_risk_count,
  COUNT(*) FILTER (WHERE risk_score >= 90) as critical_risk_count
FROM audit_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at), action;

COMMENT ON VIEW compliance_security_summary IS 
  'SOC 2 CC7.2 - 30-day security event summary. SECURITY INVOKER.';


DROP VIEW IF EXISTS compliance_financial_activity;
CREATE VIEW compliance_financial_activity
WITH (security_invoker = true)
AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  ledger_id,
  COUNT(*) FILTER (WHERE action = 'payout_initiated') as payouts_initiated,
  COUNT(*) FILTER (WHERE action = 'payout_completed') as payouts_completed,
  COUNT(*) FILTER (WHERE action = 'payout_failed') as payouts_failed,
  COUNT(*) FILTER (WHERE action = 'nacha_generated') as nacha_files_generated,
  COUNT(*) FILTER (WHERE action IN ('sale', 'record_sale')) as sales_recorded,
  COUNT(*) FILTER (WHERE action IN ('refund', 'record_refund')) as refunds_recorded
FROM audit_log
WHERE created_at > NOW() - INTERVAL '90 days'
  AND action IN (
    'payout_initiated', 'payout_completed', 'payout_failed',
    'nacha_generated', 'sale', 'record_sale', 'refund', 'record_refund'
  )
GROUP BY DATE_TRUNC('day', created_at), ledger_id;

COMMENT ON VIEW compliance_financial_activity IS 
  'SOC 2 CC6.1 - 90-day financial activity. SECURITY INVOKER.';


DROP VIEW IF EXISTS compliance_access_patterns;
CREATE VIEW compliance_access_patterns
WITH (security_invoker = true)
AS
SELECT
  COALESCE(ip_address::text, 'unknown') as ip_address,
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as request_count,
  COUNT(DISTINCT ledger_id) as ledgers_accessed,
  COUNT(DISTINCT action) as unique_actions,
  ARRAY_AGG(DISTINCT action) as actions,
  MAX(risk_score) as max_risk_score,
  COUNT(*) FILTER (WHERE action = 'auth_failed') as failed_auths
FROM audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY ip_address, DATE_TRUNC('hour', created_at)
HAVING COUNT(*) > 10 OR COUNT(*) FILTER (WHERE action = 'auth_failed') > 3;

COMMENT ON VIEW compliance_access_patterns IS 
  'Anomaly detection - high activity IPs. SECURITY INVOKER.';

-- ============================================================================
-- 2. RLS ON RISK_SCORE_DEFINITIONS
-- ============================================================================

ALTER TABLE risk_score_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Risk score definitions readable by authenticated" ON risk_score_definitions;
CREATE POLICY "Risk score definitions readable by authenticated"
ON risk_score_definitions FOR SELECT
TO authenticated
USING (true);

COMMENT ON TABLE risk_score_definitions IS 
  'Reference table for risk scoring. Read-only for authenticated users.';
