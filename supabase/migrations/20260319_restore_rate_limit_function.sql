-- Restore check_rate_limit_secure function
--
-- This function was accidentally dropped in 20260230_drop_broken_functions.sql
-- and never recreated, causing all API routes in production to fail-closed
-- on rate limiting (every request returns 429).

CREATE OR REPLACE FUNCTION public.check_rate_limit_secure(
  p_key TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 100,
  p_window_seconds INTEGER DEFAULT 60,
  p_fail_closed BOOLEAN DEFAULT true
) RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_at TIMESTAMPTZ,
  blocked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_record rate_limits;
  v_window_start TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Check if rate_limits table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limits') THEN
    RETURN QUERY SELECT true, p_max_requests, v_now + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;

  v_window_start := v_now - (p_window_seconds || ' seconds')::INTERVAL;

  -- Check if blocked
  SELECT * INTO v_record
  FROM rate_limits
  WHERE key = p_key AND endpoint = p_endpoint
  FOR UPDATE;

  -- Check temporary block
  IF v_record IS NOT NULL AND v_record.blocked_until IS NOT NULL AND v_record.blocked_until > v_now THEN
    RETURN QUERY SELECT false, 0, v_record.blocked_until, true;
    RETURN;
  END IF;

  IF v_record IS NULL THEN
    -- First request
    INSERT INTO rate_limits (key, endpoint, request_count, window_start)
    VALUES (p_key, p_endpoint, 1, v_now);
    RETURN QUERY SELECT true, p_max_requests - 1, v_now + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;

  IF v_record.window_start < v_window_start THEN
    -- Window expired, reset
    UPDATE rate_limits
    SET request_count = 1,
        window_start = v_now,
        violation_count = GREATEST(0, COALESCE(violation_count, 0) - 1)
    WHERE key = p_key AND endpoint = p_endpoint;
    RETURN QUERY SELECT true, p_max_requests - 1, v_now + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;

  IF v_record.request_count >= p_max_requests THEN
    -- Rate limited - increment violation count
    UPDATE rate_limits
    SET violation_count = COALESCE(violation_count, 0) + 1,
        blocked_until = CASE
          WHEN COALESCE(violation_count, 0) >= 10 THEN v_now + INTERVAL '1 hour'
          WHEN COALESCE(violation_count, 0) >= 5 THEN v_now + INTERVAL '5 minutes'
          WHEN COALESCE(violation_count, 0) >= 3 THEN v_now + INTERVAL '1 minute'
          ELSE NULL
        END
    WHERE key = p_key AND endpoint = p_endpoint;

    RETURN QUERY SELECT false, 0, v_record.window_start + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;

  -- Increment counter
  UPDATE rate_limits
  SET request_count = request_count + 1
  WHERE key = p_key AND endpoint = p_endpoint;

  RETURN QUERY SELECT
    true,
    p_max_requests - v_record.request_count - 1,
    v_record.window_start + (p_window_seconds || ' seconds')::INTERVAL,
    false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit_secure(TEXT, TEXT, INTEGER, INTEGER, BOOLEAN) TO authenticated, service_role;
