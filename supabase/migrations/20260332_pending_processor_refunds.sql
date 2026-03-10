-- pending_processor_refunds: Recovery table for refunds that succeeded at the
-- processor but failed to write to the ledger. process-processor-inbox reads
-- these rows and attempts auto-repair when the matching refund webhook arrives.

CREATE TABLE IF NOT EXISTS pending_processor_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  reference_id TEXT NOT NULL,
  original_transaction_id UUID NOT NULL,
  refund_amount INTEGER NOT NULL,
  reason TEXT,
  refund_from TEXT DEFAULT 'both',
  external_refund_id TEXT,
  processor_payment_id TEXT,
  metadata JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'repaired', 'repair_failed', 'manual')),
  error_message TEXT,
  repaired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_pending_refund_ref UNIQUE (ledger_id, reference_id)
);

CREATE INDEX idx_pending_refunds_status ON pending_processor_refunds(status, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_pending_refunds_external ON pending_processor_refunds(external_refund_id)
  WHERE external_refund_id IS NOT NULL;

-- RLS: service_role only (edge functions use service role client)
ALTER TABLE pending_processor_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to pending_processor_refunds"
  ON pending_processor_refunds
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
