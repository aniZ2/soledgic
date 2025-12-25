-- Soledgic: Stripe Integration Tables
-- Phase 1: Stripe as a data source for reconciliation

-- ============================================================================
-- STRIPE EVENTS - Raw event storage for reprocessing capability
-- ============================================================================
CREATE TABLE IF NOT EXISTS stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  livemode boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pending', -- pending, processed, skipped, failed
  processed_at timestamptz,
  transaction_id uuid REFERENCES transactions(id),
  error_message text,
  raw_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(ledger_id, stripe_event_id)
);

CREATE INDEX idx_stripe_events_ledger ON stripe_events(ledger_id);
CREATE INDEX idx_stripe_events_type ON stripe_events(event_type);
CREATE INDEX idx_stripe_events_status ON stripe_events(status);
CREATE INDEX idx_stripe_events_created ON stripe_events(created_at DESC);

-- ============================================================================
-- STRIPE TRANSACTIONS - For reconciliation (like plaid_transactions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stripe_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Stripe identifiers
  stripe_id text NOT NULL,
  stripe_type text NOT NULL, -- charge, refund, payout, dispute, transfer
  
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
  
  UNIQUE(ledger_id, stripe_id, stripe_type)
);

CREATE INDEX idx_stripe_txns_ledger ON stripe_transactions(ledger_id);
CREATE INDEX idx_stripe_txns_type ON stripe_transactions(stripe_type);
CREATE INDEX idx_stripe_txns_status ON stripe_transactions(status);
CREATE INDEX idx_stripe_txns_match ON stripe_transactions(match_status);
CREATE INDEX idx_stripe_txns_date ON stripe_transactions(created_at DESC);

-- ============================================================================
-- STRIPE BALANCE SNAPSHOTS - For reconciliation checks
-- ============================================================================
CREATE TABLE IF NOT EXISTS stripe_balance_snapshots (
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
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_balance_snapshots ENABLE ROW LEVEL SECURITY;

-- API key access policies
CREATE POLICY "API key access stripe_events" ON stripe_events
  FOR ALL
  USING (
    ledger_id IN (
      SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'
    )
  );

CREATE POLICY "API key access stripe_transactions" ON stripe_transactions
  FOR ALL
  USING (
    ledger_id IN (
      SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'
    )
  );

CREATE POLICY "API key access stripe_balance_snapshots" ON stripe_balance_snapshots
  FOR ALL
  USING (
    ledger_id IN (
      SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'
    )
  );

-- Service role bypass
CREATE POLICY "Service role stripe_events" ON stripe_events
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role stripe_transactions" ON stripe_transactions
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role stripe_balance_snapshots" ON stripe_balance_snapshots
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Reprocess a failed Stripe event
CREATE OR REPLACE FUNCTION reprocess_stripe_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event stripe_events%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM stripe_events WHERE id = p_event_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  -- Reset status to pending so webhook can reprocess
  UPDATE stripe_events 
  SET status = 'pending', 
      processed_at = NULL, 
      error_message = NULL,
      transaction_id = NULL
  WHERE id = p_event_id;

  RETURN jsonb_build_object('success', true, 'message', 'Event reset for reprocessing');
END;
$$;

-- Get Stripe reconciliation summary
CREATE OR REPLACE FUNCTION get_stripe_reconciliation_summary(p_ledger_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
    'by_type', jsonb_object_agg(stripe_type, type_count),
    'total_amount', SUM(amount),
    'total_fees', SUM(COALESCE(fee, 0))
  ) INTO v_result
  FROM (
    SELECT 
      match_status,
      stripe_type,
      amount,
      fee,
      COUNT(*) OVER (PARTITION BY stripe_type) as type_count
    FROM stripe_transactions
    WHERE ledger_id = p_ledger_id
  ) sub;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger
CREATE TRIGGER stripe_transactions_updated_at
  BEFORE UPDATE ON stripe_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE stripe_events IS 'Raw Stripe webhook events for idempotency and reprocessing';
COMMENT ON TABLE stripe_transactions IS 'Stripe transactions for reconciliation (parallel to plaid_transactions)';
COMMENT ON TABLE stripe_balance_snapshots IS 'Periodic Stripe balance snapshots for reconciliation checks';
