-- Soledgic: Webhook Delivery System
-- Outbound webhooks to notify customers of events

-- ============================================================================
-- WEBHOOK ENDPOINTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  description TEXT,
  secret TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  events TEXT[] NOT NULL DEFAULT ARRAY['*'], -- Array of event types to subscribe to, '*' = all
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_endpoints_ledger ON webhook_endpoints(ledger_id) WHERE is_active = true;

-- ============================================================================
-- WEBHOOK DELIVERIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  
  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  
  -- Response info
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  
  -- Timing
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries(scheduled_at) 
  WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX idx_webhook_deliveries_ledger ON webhook_deliveries(ledger_id);

-- ============================================================================
-- WEBHOOK EVENT TYPES
-- ============================================================================

COMMENT ON TABLE webhook_endpoints IS 'Customer-configured webhook endpoints';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery attempts and status';

-- Event types:
-- sale.created
-- sale.refunded
-- payout.processed
-- payout.executed
-- payout.failed
-- creator.created
-- creator.updated
-- period.closed
-- statement.generated
-- reconciliation.completed

-- ============================================================================
-- FUNCTION: Queue webhook for delivery
-- ============================================================================

CREATE OR REPLACE FUNCTION queue_webhook(
  p_ledger_id UUID,
  p_event_type TEXT,
  p_payload JSONB
) RETURNS SETOF webhook_deliveries AS $$
BEGIN
  RETURN QUERY
  INSERT INTO webhook_deliveries (endpoint_id, ledger_id, event_type, payload)
  SELECT 
    we.id,
    p_ledger_id,
    p_event_type,
    p_payload
  FROM webhook_endpoints we
  WHERE we.ledger_id = p_ledger_id
    AND we.is_active = true
    AND (we.events @> ARRAY[p_event_type] OR we.events @> ARRAY['*'])
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get pending webhooks for processing
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_webhooks(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  delivery_id UUID,
  endpoint_url TEXT,
  endpoint_secret TEXT,
  event_type TEXT,
  payload JSONB,
  attempts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wd.id as delivery_id,
    we.url as endpoint_url,
    we.secret as endpoint_secret,
    wd.event_type,
    wd.payload,
    wd.attempts
  FROM webhook_deliveries wd
  JOIN webhook_endpoints we ON wd.endpoint_id = we.id
  WHERE wd.status IN ('pending', 'retrying')
    AND wd.scheduled_at <= NOW()
    AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= NOW())
    AND wd.attempts < wd.max_attempts
    AND we.is_active = true
  ORDER BY wd.scheduled_at
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Mark webhook as delivered
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_webhook_delivered(
  p_delivery_id UUID,
  p_response_status INTEGER,
  p_response_body TEXT DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE webhook_deliveries
  SET 
    status = 'delivered',
    delivered_at = NOW(),
    response_status = p_response_status,
    response_body = p_response_body,
    response_time_ms = p_response_time_ms,
    attempts = attempts + 1
  WHERE id = p_delivery_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Mark webhook as failed (will retry)
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_webhook_failed(
  p_delivery_id UUID,
  p_response_status INTEGER DEFAULT NULL,
  p_response_body TEXT DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_attempts INTEGER;
  v_max_attempts INTEGER;
  v_retry_delay INTERVAL;
BEGIN
  -- Get current attempts
  SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
  FROM webhook_deliveries WHERE id = p_delivery_id;
  
  -- Exponential backoff: 1min, 5min, 15min, 1hr, 4hr
  v_retry_delay := CASE v_attempts
    WHEN 0 THEN INTERVAL '1 minute'
    WHEN 1 THEN INTERVAL '5 minutes'
    WHEN 2 THEN INTERVAL '15 minutes'
    WHEN 3 THEN INTERVAL '1 hour'
    ELSE INTERVAL '4 hours'
  END;
  
  UPDATE webhook_deliveries
  SET 
    status = CASE WHEN v_attempts + 1 >= v_max_attempts THEN 'failed' ELSE 'retrying' END,
    response_status = p_response_status,
    response_body = p_response_body,
    response_time_ms = p_response_time_ms,
    attempts = attempts + 1,
    next_retry_at = CASE WHEN v_attempts + 1 < v_max_attempts THEN NOW() + v_retry_delay ELSE NULL END
  WHERE id = p_delivery_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Webhook endpoints: accessible via API key (ledger owner)
CREATE POLICY "Webhook endpoints via API key"
  ON webhook_endpoints FOR ALL
  USING (
    ledger_id IN (
      SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'
    )
  );

-- Webhook deliveries: accessible via API key
CREATE POLICY "Webhook deliveries via API key"
  ON webhook_deliveries FOR SELECT
  USING (
    ledger_id IN (
      SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'
    )
  );
