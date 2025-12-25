-- Soledgic: Security Fixes from Dec 22, 2025 Audit
-- Fixes: M1 (Pre-auth rate limiting), H2 (Health check limits), M3 (NACHA URL expiry), C1 (Fee tracking)
--        L2 (Endpoint body size limits), L3 (Geo-IP blocking), M2 (Reference ID cleanup)

-- ============================================================================
-- 1. Add pre-auth rate limit and geo-block events to risk score definitions
-- ============================================================================

INSERT INTO risk_score_definitions (action, base_score, description, soc2_control) VALUES
  ('preauth_rate_limited', 60, 'Pre-auth rate limit exceeded (potential brute force)', 'CC6.1'),
  ('blocked_country', 70, 'Request blocked due to geo-IP restrictions', 'CC6.1')
ON CONFLICT (action) DO UPDATE SET
  base_score = EXCLUDED.base_score,
  description = EXCLUDED.description,
  soc2_control = EXCLUDED.soc2_control;

-- ============================================================================
-- 2. Add column to track estimated fees for reconciliation (C1 fix)
-- ============================================================================

-- Add column to stripe_transactions table if not exists
ALTER TABLE stripe_transactions
  ADD COLUMN IF NOT EXISTS fee_estimated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fee_estimate_reason TEXT;

COMMENT ON COLUMN stripe_transactions.fee_estimated IS 
  'True if Stripe fee was estimated rather than fetched from balance transaction';
COMMENT ON COLUMN stripe_transactions.fee_estimate_reason IS 
  'Reason fee was estimated (for debugging/reconciliation)';

-- Create index for finding transactions with estimated fees (for reconciliation)
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_estimated_fees 
ON stripe_transactions(ledger_id, created_at DESC)
WHERE fee_estimated = true;

-- ============================================================================
-- 3. Create view for transactions needing fee reconciliation
-- ============================================================================

CREATE OR REPLACE VIEW transactions_needing_fee_reconciliation AS
SELECT 
  st.id,
  st.ledger_id,
  st.stripe_id,
  st.stripe_type,
  st.amount,
  st.fee,
  st.fee_estimate_reason,
  st.created_at,
  l.business_name
FROM stripe_transactions st
JOIN ledgers l ON l.id = st.ledger_id
WHERE st.fee_estimated = true
  AND st.created_at > NOW() - INTERVAL '30 days'
ORDER BY st.created_at DESC;

-- Make view security invoker (uses caller's permissions)
ALTER VIEW transactions_needing_fee_reconciliation SET (security_invoker = true);

COMMENT ON VIEW transactions_needing_fee_reconciliation IS 
  'Transactions with estimated Stripe fees that may need manual reconciliation';

-- ============================================================================
-- 4. Function to retry fetching actual Stripe fee
-- ============================================================================

CREATE OR REPLACE FUNCTION retry_stripe_fee_fetch(
  p_stripe_transaction_id UUID
) RETURNS TABLE (
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_stripe_id TEXT;
BEGIN
  -- This function marks a transaction for re-processing
  -- The actual Stripe API call should be done in the Edge Function
  
  SELECT stripe_id INTO v_stripe_id
  FROM public.stripe_transactions
  WHERE id = p_stripe_transaction_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Transaction not found'::TEXT;
    RETURN;
  END IF;
  
  -- Mark for reprocessing by setting a flag
  UPDATE public.stripe_transactions
  SET raw_data = raw_data || '{"needs_fee_refresh": true}'::jsonb
  WHERE id = p_stripe_transaction_id;
  
  RETURN QUERY SELECT true, ('Marked for fee refresh: ' || v_stripe_id)::TEXT;
END;
$$;

-- ============================================================================
-- 5. Update rate_limits table for pre-auth limiting
-- ============================================================================

-- Ensure rate_limits table can handle pre-auth keys
ALTER TABLE rate_limits
  ADD COLUMN IF NOT EXISTS key_type TEXT DEFAULT 'api_key';

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_type 
ON rate_limits(key_type, key, endpoint)
WHERE key_type = 'ip';

COMMENT ON COLUMN rate_limits.key_type IS 
  'Type of rate limit key: api_key (default), ip (for pre-auth), ledger_id';

-- ============================================================================
-- 6. Add audit log entry for security improvements applied
-- ============================================================================

INSERT INTO audit_log (
  ledger_id,
  action,
  entity_type,
  actor_type,
  actor_id,
  request_body,
  risk_score
) VALUES (
  NULL,
  'security_migration_applied',
  'system',
  'system',
  'migration_20260151',
  '{
    "fixes": [
      "M1: Pre-auth IP rate limiting",
      "H2: Reduced health check rate limit",
      "M3: Reduced NACHA URL expiry to 5 minutes",
      "C1: Fee estimation tracking for reconciliation",
      "L2: Endpoint-specific body size limits",
      "L3: Geo-IP blocking capability",
      "M2: Reference ID cleanup job",
      "H1: Secure API key storage in SDK",
      "L1: Error message sanitization"
    ],
    "version": "20260151_security_fixes_dec22"
  }'::jsonb,
  0
);

-- ============================================================================
-- 7. SECURITY FIX M2: Reference ID Cleanup Job (DEFERRED)
-- ============================================================================
-- The cleanup function was moved to a separate migration due to PL/pgSQL quoting issues.
-- See migration 20260153 for the cleanup_old_reference_ids function.

-- Create a view to see transactions pending cleanup
CREATE OR REPLACE VIEW transactions_pending_reference_cleanup AS
SELECT 
  l.business_name,
  COUNT(*) as transaction_count,
  MIN(t.created_at) as oldest_transaction,
  MAX(t.created_at) as newest_transaction
FROM public.transactions t
JOIN public.ledgers l ON l.id = t.ledger_id
WHERE t.created_at < NOW() - INTERVAL '365 days'
  AND t.reference_id IS NOT NULL
  AND t.reference_id NOT LIKE 'archived_%'
GROUP BY l.id, l.business_name
ORDER BY transaction_count DESC;

ALTER VIEW transactions_pending_reference_cleanup SET (security_invoker = true);

COMMENT ON VIEW transactions_pending_reference_cleanup IS 
  'Shows ledgers with transactions eligible for reference_id cleanup';

-- ============================================================================
-- 8. Security Dashboard Views
-- ============================================================================
-- Create views for monitoring security metrics

-- View: Security events by hour (last 24 hours)
CREATE OR REPLACE VIEW security_events_hourly AS
SELECT 
  date_trunc('hour', created_at) as hour,
  action,
  COUNT(*) as event_count,
  COUNT(DISTINCT ip_address) as unique_ips,
  AVG(risk_score) as avg_risk_score,
  MAX(risk_score) as max_risk_score
FROM audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND action IN (
    'auth_failed', 'rate_limited', 'preauth_rate_limited', 
    'blocked_ip', 'blocked_country', 'ssrf_attempt',
    'webhook_invalid_signature', 'webhook_replay_attempt'
  )
GROUP BY date_trunc('hour', created_at), action
ORDER BY hour DESC, event_count DESC;

ALTER VIEW security_events_hourly SET (security_invoker = true);

COMMENT ON VIEW security_events_hourly IS 
  'Hourly breakdown of security events for monitoring dashboard';

-- View: Top offending IPs (last 24 hours)
CREATE OR REPLACE VIEW security_top_offending_ips AS
SELECT 
  ip_address,
  COUNT(*) as total_events,
  COUNT(DISTINCT action) as event_types,
  SUM(CASE WHEN action = 'auth_failed' THEN 1 ELSE 0 END) as auth_failures,
  SUM(CASE WHEN action = 'rate_limited' THEN 1 ELSE 0 END) as rate_limits,
  SUM(CASE WHEN action = 'preauth_rate_limited' THEN 1 ELSE 0 END) as preauth_rate_limits,
  SUM(CASE WHEN action = 'ssrf_attempt' THEN 1 ELSE 0 END) as ssrf_attempts,
  MAX(risk_score) as max_risk_score,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND ip_address IS NOT NULL
  AND risk_score > 0
GROUP BY ip_address
HAVING COUNT(*) >= 5  -- At least 5 events
ORDER BY total_events DESC, max_risk_score DESC
LIMIT 100;

ALTER VIEW security_top_offending_ips SET (security_invoker = true);

COMMENT ON VIEW security_top_offending_ips IS 
  'Top 100 IPs with suspicious activity in last 24 hours';

-- View: Security summary (last hour)
CREATE OR REPLACE VIEW security_summary_hourly AS
SELECT 
  (SELECT COUNT(*) FROM audit_log WHERE action = 'auth_failed' AND created_at > NOW() - INTERVAL '1 hour') as auth_failures,
  (SELECT COUNT(*) FROM audit_log WHERE action = 'rate_limited' AND created_at > NOW() - INTERVAL '1 hour') as rate_limits,
  (SELECT COUNT(*) FROM audit_log WHERE action = 'preauth_rate_limited' AND created_at > NOW() - INTERVAL '1 hour') as preauth_rate_limits,
  (SELECT COUNT(*) FROM audit_log WHERE action = 'blocked_country' AND created_at > NOW() - INTERVAL '1 hour') as geo_blocks,
  (SELECT COUNT(*) FROM audit_log WHERE action = 'ssrf_attempt' AND created_at > NOW() - INTERVAL '1 hour') as ssrf_attempts,
  (SELECT COUNT(*) FROM audit_log WHERE action = 'webhook_invalid_signature' AND created_at > NOW() - INTERVAL '1 hour') as invalid_webhooks,
  (SELECT COUNT(*) FROM audit_log WHERE risk_score >= 70 AND created_at > NOW() - INTERVAL '1 hour') as high_risk_events,
  (SELECT COUNT(DISTINCT ip_address) FROM audit_log WHERE action = 'rate_limited' AND created_at > NOW() - INTERVAL '1 hour') as unique_rate_limited_ips,
  NOW() as as_of;

ALTER VIEW security_summary_hourly SET (security_invoker = true);

COMMENT ON VIEW security_summary_hourly IS 
  'Quick security status summary for the last hour';

-- View: Stripe fee reconciliation status
CREATE OR REPLACE VIEW stripe_fee_reconciliation_status AS
SELECT 
  l.id as ledger_id,
  l.business_name,
  COUNT(*) as total_transactions,
  SUM(CASE WHEN st.fee_estimated = true THEN 1 ELSE 0 END) as estimated_fee_count,
  ROUND(
    (SUM(CASE WHEN st.fee_estimated = true THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 
    2
  ) as estimated_fee_percent,
  SUM(st.fee) as total_fees,
  SUM(CASE WHEN st.fee_estimated = true THEN st.fee ELSE 0 END) as estimated_fee_amount
FROM stripe_transactions st
JOIN ledgers l ON l.id = st.ledger_id
WHERE st.created_at > NOW() - INTERVAL '7 days'
GROUP BY l.id, l.business_name
HAVING COUNT(*) >= 5  -- At least 5 transactions
ORDER BY estimated_fee_percent DESC NULLS LAST;

ALTER VIEW stripe_fee_reconciliation_status SET (security_invoker = true);

COMMENT ON VIEW stripe_fee_reconciliation_status IS 
  'Stripe fee estimation status by ledger for reconciliation monitoring';
