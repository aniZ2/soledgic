CREATE OR REPLACE FUNCTION public.get_pending_webhooks(p_limit integer DEFAULT 100)
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
  WHERE wd.status IN ('pending', 'retrying')
    AND wd.scheduled_at <= NOW()
    AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= NOW())
    AND wd.attempts < wd.max_attempts
    AND we.is_active = true
  ORDER BY wd.scheduled_at
  LIMIT p_limit;
END;
$function$;
