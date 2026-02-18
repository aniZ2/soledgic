-- Soledgic: processor Integration Tables
-- Phase 1: processor as a data source for reconciliation

-- ============================================================================
-- processor EVENTS - Raw event storage for reprocessing capability
-- ============================================================================
CREATE TABLE IF NOT EXISTS processor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  processor_event_id text NOT NULL,
  event_type text NOT NULL,
  livemode boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pending', -- pending, processed, skipped, failed
  processed_at timestamptz,
  transaction_id uuid REFERENCES transactions(id),
  error_message text,
  raw_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(ledger_id, processor_event_id)
);

CREATE INDEX idx_processor_events_ledger ON processor_events(ledger_id);
CREATE INDEX idx_processor_events_type ON processor_events(event_type);
CREATE INDEX idx_processor_events_status ON processor_events(status);
CREATE INDEX idx_processor_events_created ON processor_events(created_at DESC);

-- ============================================================================
-- processor TRANSACTIONS - For reconciliation (like bank_aggregator_transactions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS processor_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- processor identifiers
  processor_id text NOT NULL,
  processor_type text NOT NULL, -- charge, refund, payout, dispute, transfer
  
  -- Money
  amount numeric(15,2) NOT NULL, -- Positive for inflows, negative for outflows
  fee numeric(15,2) DEFAULT 0,
  net numeric(15,2),
  currency text DEFAULT 'USD',
  
  -- Status
  status text NOT NULL, -- succeeded, pending, failed, etc.
  description text,
  
  -- Matching to ledger
  transaction_id uuid REFERENCES transactions(id), -- Matched ledger transaction
  match_status text NOT NULL DEFAULT 'unmatched', -- unmatched, auto_matched, matched, excluded, reviewed
  match_confidence numeric(3,2),
  
  -- Metadata
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(ledger_id, processor_id, processor_type)
);

CREATE INDEX idx_processor_txns_ledger ON processor_transactions(ledger_id);
CREATE INDEX idx_processor_txns_type ON processor_transactions(processor_type);
CREATE INDEX idx_processor_txns_status ON processor_transactions(status);
CREATE INDEX idx_processor_txns_match ON processor_transactions(match_status);
CREATE INDEX idx_processor_txns_date ON processor_transactions(created_at DESC);

-- ============================================================================
-- processor BALANCE SNAPSHOTS - For reconciliation checks
-- ============================================================================
CREATE TABLE IF NOT EXISTS processor_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL,
  available jsonb NOT NULL, -- Array of {amount, currency}
  pending jsonb NOT NULL,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(ledger_id, snapshot_at)
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE processor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE processor_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE processor_balance_snapshots ENABLE ROW LEVEL SECURITY;

-- API key access policies
CREATE POLICY "API key access processor_events" ON processor_events
  FOR ALL
  USING (
    ledger_id IN (
      SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'
    )
  );

CREATE POLICY "API key access processor_transactions" ON processor_transactions
  FOR ALL
  USING (
    ledger_id IN (
      SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'
    )
  );

CREATE POLICY "API key access processor_balance_snapshots" ON processor_balance_snapshots
  FOR ALL
  USING (
    ledger_id IN (
      SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'
    )
  );

-- Service role bypass
CREATE POLICY "Service role processor_events" ON processor_events
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role processor_transactions" ON processor_transactions
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role processor_balance_snapshots" ON processor_balance_snapshots
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Reprocess a failed processor event
CREATE OR REPLACE FUNCTION reprocess_processor_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event processor_events%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM processor_events WHERE id = p_event_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  -- Reset status to pending so webhook can reprocess
  UPDATE processor_events 
  SET status = 'pending', 
      processed_at = NULL, 
      error_message = NULL,
      transaction_id = NULL
  WHERE id = p_event_id;

  RETURN jsonb_build_object('success', true, 'message', 'Event reset for reprocessing');
END;
$$;

-- Get processor reconciliation summary
CREATE OR REPLACE FUNCTION get_processor_reconciliation_summary(p_ledger_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_transactions', COUNT(*),
    'unmatched', COUNT(*) FILTER (WHERE match_status = 'unmatched'),
    'auto_matched', COUNT(*) FILTER (WHERE match_status = 'auto_matched'),
    'manually_matched', COUNT(*) FILTER (WHERE match_status = 'matched'),
    'reviewed', COUNT(*) FILTER (WHERE match_status = 'reviewed'),
    'excluded', COUNT(*) FILTER (WHERE match_status = 'excluded'),
    'by_type', jsonb_object_agg(processor_type, type_count),
    'total_amount', SUM(amount),
    'total_fees', SUM(COALESCE(fee, 0))
  ) INTO v_result
  FROM (
    SELECT 
      match_status,
      processor_type,
      amount,
      fee,
      COUNT(*) OVER (PARTITION BY processor_type) as type_count
    FROM processor_transactions
    WHERE ledger_id = p_ledger_id
  ) sub;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger
CREATE TRIGGER processor_transactions_updated_at
  BEFORE UPDATE ON processor_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE processor_events IS 'Raw processor webhook events for idempotency and reprocessing';
COMMENT ON TABLE processor_transactions IS 'processor transactions for reconciliation (parallel to bank_aggregator_transactions)';
COMMENT ON TABLE processor_balance_snapshots IS 'Periodic processor balance snapshots for reconciliation checks';
