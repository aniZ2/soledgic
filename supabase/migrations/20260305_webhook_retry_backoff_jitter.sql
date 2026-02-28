-- Webhook retry hardening:
-- Replace step-based retry timing with exponential backoff + jitter.

CREATE OR REPLACE FUNCTION public.mark_webhook_failed(
  p_delivery_id UUID,
  p_response_status INTEGER DEFAULT NULL,
  p_response_body TEXT DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_attempts INTEGER;
  v_max_attempts INTEGER;
  v_base_delay_seconds INTEGER;
  v_jitter_seconds INTEGER;
  v_retry_delay INTERVAL;
BEGIN
  SELECT wd.attempts, wd.max_attempts
    INTO v_attempts, v_max_attempts
    FROM public.webhook_deliveries wd
   WHERE wd.id = p_delivery_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 1m, 2m, 4m, 8m... capped at 4h.
  v_base_delay_seconds := LEAST(60 * CAST(POWER(2, GREATEST(v_attempts, 0)) AS INTEGER), 14400);

  -- Slow down on upstream throttling.
  IF p_response_status = 429 THEN
    v_base_delay_seconds := GREATEST(v_base_delay_seconds, 300);
  END IF;

  -- Small random jitter to prevent synchronized retries.
  v_jitter_seconds := FLOOR(RANDOM() * 31)::INTEGER; -- 0-30s
  v_retry_delay := make_interval(secs => v_base_delay_seconds + v_jitter_seconds);

  UPDATE public.webhook_deliveries
     SET status = CASE WHEN v_attempts + 1 >= v_max_attempts THEN 'failed' ELSE 'retrying' END,
         response_status = p_response_status,
         response_body = p_response_body,
         response_time_ms = p_response_time_ms,
         attempts = attempts + 1,
         next_retry_at = CASE
           WHEN v_attempts + 1 < v_max_attempts THEN NOW() + v_retry_delay
           ELSE NULL
         END
   WHERE id = p_delivery_id;
END;
$$;

