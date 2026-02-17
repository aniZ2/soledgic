-- ============================================================================
-- Processor Webhook Inbox Claiming
-- Adds a concurrency-safe dequeue/claim function for async processing.
--
-- Notes:
-- - The inbox table is service-role only (RLS), so this function is intended for
--   internal jobs invoked with the service role key.
-- ============================================================================

-- Allow an in-progress state so multiple workers can safely run in parallel.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.processor_webhook_inbox'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%'
    AND pg_get_constraintdef(oid) ILIKE '%pending%'
    AND pg_get_constraintdef(oid) ILIKE '%processed%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.processor_webhook_inbox DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END;
$$;

ALTER TABLE public.processor_webhook_inbox
  ADD CONSTRAINT processor_webhook_inbox_status_check
  CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'skipped'));

-- Claim (dequeue) a batch of pending inbox rows for processing.
-- Uses SKIP LOCKED to prevent double-processing across parallel workers.
CREATE OR REPLACE FUNCTION public.claim_processor_webhook_inbox(p_limit integer DEFAULT 25)
RETURNS SETOF public.processor_webhook_inbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT i.id
    FROM public.processor_webhook_inbox i
    WHERE i.status = 'pending'
    ORDER BY i.received_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.processor_webhook_inbox i
  SET status = 'processing',
      attempts = i.attempts + 1
  FROM cte
  WHERE i.id = cte.id
  RETURNING i.*;
END;
$$;

-- SECURITY: prevent unprivileged callers from reading raw inbox payloads.
REVOKE EXECUTE ON FUNCTION public.claim_processor_webhook_inbox(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_processor_webhook_inbox(integer) TO service_role;
