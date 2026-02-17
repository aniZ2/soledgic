-- Soledgic: Processor Webhook Inbox
-- Stores inbound processor webhooks for replay + async processing.
-- Whitelabeled: no vendor-specific naming.

CREATE TABLE IF NOT EXISTS public.processor_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),

  -- Optional routing (derived from webhook payload tags/metadata when available)
  ledger_id uuid REFERENCES public.ledgers(id) ON DELETE SET NULL,

  -- Idempotency (when processor provides a stable id)
  event_id text,
  event_type text,
  resource_id text,
  livemode boolean,

  -- Raw data
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL,

  -- Optional auth/sig verification state
  signature_valid boolean,
  signature_error text,

  -- Async processing
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  processing_error text
);

CREATE INDEX IF NOT EXISTS idx_processor_webhook_inbox_received
  ON public.processor_webhook_inbox(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_processor_webhook_inbox_status
  ON public.processor_webhook_inbox(status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_processor_webhook_inbox_ledger
  ON public.processor_webhook_inbox(ledger_id, received_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processor_webhook_inbox_event_id_unique
  ON public.processor_webhook_inbox(event_id)
  WHERE event_id IS NOT NULL;

ALTER TABLE public.processor_webhook_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role processor_webhook_inbox" ON public.processor_webhook_inbox;
CREATE POLICY "Service role processor_webhook_inbox"
  ON public.processor_webhook_inbox
  FOR ALL
  USING (auth.role() = 'service_role');

