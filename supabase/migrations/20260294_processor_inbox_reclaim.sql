-- ============================================================================
-- Processor Inbox Reclaim
-- Adds a timestamp for when processing begins and allows reclaiming stuck rows.
-- ============================================================================

ALTER TABLE public.processor_webhook_inbox
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

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
       OR (
         i.status = 'processing'
         AND i.processing_started_at IS NOT NULL
         AND i.processing_started_at <= (NOW() - interval '10 minutes')
       )
    ORDER BY i.received_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.processor_webhook_inbox i
  SET status = 'processing',
      attempts = i.attempts + 1,
      processing_started_at = NOW(),
      processing_error = NULL
  FROM cte
  WHERE i.id = cte.id
  RETURNING i.*;
END;
$$;

-- SECURITY: prevent unprivileged callers from reading raw inbox payloads.
REVOKE EXECUTE ON FUNCTION public.claim_processor_webhook_inbox(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_processor_webhook_inbox(integer) TO service_role;
