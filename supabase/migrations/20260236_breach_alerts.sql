-- Soledgic: Breach Alert System
-- Slack and webhook notifications for cash breach predictions

-- ============================================================================
-- 1. ALERT CONFIGURATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,

  -- Alert type and channel
  alert_type TEXT NOT NULL CHECK (alert_type IN ('breach_risk', 'projection_created', 'instrument_invalidated')),
  channel TEXT NOT NULL CHECK (channel IN ('slack', 'email', 'webhook')),

  -- Channel-specific configuration (stored encrypted via app layer)
  config JSONB NOT NULL DEFAULT '{}',
  -- For Slack: { "webhook_url": "https://hooks.slack.com/...", "channel": "#alerts" }
  -- For Email: { "recipients": ["cfo@company.com"] }
  -- For Webhook: uses existing webhook_endpoints table

  -- Alert thresholds
  thresholds JSONB DEFAULT '{}',
  -- { "coverage_ratio_below": 0.5, "shortfall_above": 10000 }

  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One config per type/channel combination per ledger
  CONSTRAINT unique_alert_config UNIQUE (ledger_id, alert_type, channel)
);

CREATE INDEX idx_alert_configurations_ledger ON alert_configurations(ledger_id) WHERE is_active = true;
CREATE INDEX idx_alert_configurations_type ON alert_configurations(alert_type) WHERE is_active = true;

-- ============================================================================
-- 2. ALERT HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  alert_config_id UUID REFERENCES alert_configurations(id) ON DELETE SET NULL,

  alert_type TEXT NOT NULL,
  channel TEXT NOT NULL,

  -- Alert payload
  payload JSONB NOT NULL,

  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,

  -- Response (for debugging)
  response_status INTEGER,
  response_body TEXT,

  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_history_ledger ON alert_history(ledger_id);
CREATE INDEX idx_alert_history_pending ON alert_history(created_at) WHERE status = 'pending';

-- ============================================================================
-- 3. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE alert_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY alert_configurations_service_all ON alert_configurations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY alert_history_service_all ON alert_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can manage their ledger's alerts
CREATE POLICY alert_configurations_user_select ON alert_configurations
  FOR SELECT TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY alert_configurations_user_insert ON alert_configurations
  FOR INSERT TO authenticated
  WITH CHECK (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY alert_configurations_user_update ON alert_configurations
  FOR UPDATE TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY alert_configurations_user_delete ON alert_configurations
  FOR DELETE TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY alert_history_user_select ON alert_history
  FOR SELECT TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. HELPER FUNCTION: Check if breach alert should trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION should_trigger_breach_alert(
  p_ledger_id UUID,
  p_coverage_ratio NUMERIC,
  p_shortfall NUMERIC
)
RETURNS TABLE (
  config_id UUID,
  channel TEXT,
  config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ac.id,
    ac.channel,
    ac.config
  FROM alert_configurations ac
  WHERE ac.ledger_id = p_ledger_id
    AND ac.alert_type = 'breach_risk'
    AND ac.is_active = true
    AND (
      -- Check coverage ratio threshold (default 0.5 = 50%)
      p_coverage_ratio < COALESCE((ac.thresholds->>'coverage_ratio_below')::numeric, 0.5)
      OR
      -- Check shortfall threshold (default 0 = any shortfall)
      p_shortfall > COALESCE((ac.thresholds->>'shortfall_above')::numeric, 0)
    );
END;
$$;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE alert_configurations IS 'Configuration for breach alerts (Slack, email, webhook)';
COMMENT ON TABLE alert_history IS 'History of sent alerts for audit and debugging';
COMMENT ON COLUMN alert_configurations.config IS 'Channel-specific config: Slack webhook URL, email recipients, etc.';
COMMENT ON COLUMN alert_configurations.thresholds IS 'Alert thresholds: coverage_ratio_below, shortfall_above';
