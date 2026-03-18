-- Fix webhook double-delivery: use FOR UPDATE SKIP LOCKED to claim
-- deliveries atomically. Concurrent cron runs will skip already-claimed rows.

CREATE OR REPLACE FUNCTION public.get_pending_webhooks(p_limit integer DEFAULT 50)
RETURNS TABLE(
  delivery_id uuid,
  ledger_id uuid,
  endpoint_url text,
  endpoint_secret text,
  event_type text,
  payload jsonb,
  attempts integer
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT wd.id
    FROM webhook_deliveries wd
    WHERE wd.status IN ('pending', 'retrying')
      AND wd.scheduled_at <= NOW()
      AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= NOW())
      AND wd.attempts < wd.max_attempts
    ORDER BY wd.scheduled_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  SELECT
    wd.id as delivery_id,
    wd.ledger_id,
    we.url as endpoint_url,
    we.secret as endpoint_secret,
    wd.event_type,
    wd.payload,
    wd.attempts
  FROM webhook_deliveries wd
  JOIN webhook_endpoints we ON wd.endpoint_id = we.id
  WHERE wd.id IN (SELECT id FROM claimed)
    AND we.is_active = true;
END;
$function$;
