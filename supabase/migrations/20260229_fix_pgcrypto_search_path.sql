-- ============================================================================
-- FIX: Update search_path to include extensions for pgcrypto functions
-- The functions need access to gen_random_bytes and hmac from pgcrypto
-- ============================================================================

-- ============================================================================
-- 1. Fix generate_api_key - include public in search_path for pgcrypto
-- ============================================================================
DROP FUNCTION IF EXISTS public.generate_api_key();
CREATE FUNCTION public.generate_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_random_bytes BYTEA;
  v_key TEXT;
BEGIN
  v_random_bytes := extensions.gen_random_bytes(16);
  v_key := 'sk_' || encode(v_random_bytes, 'hex');
  RETURN v_key;
END;
$$;

-- ============================================================================
-- 2. Fix rotate_webhook_secret
-- ============================================================================
DROP FUNCTION IF EXISTS public.rotate_webhook_secret(UUID);
CREATE FUNCTION public.rotate_webhook_secret(p_endpoint_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_new_secret TEXT;
BEGIN
  v_new_secret := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.webhook_endpoints
  SET previous_secret = secret,
      secret = v_new_secret,
      rotated_at = NOW()
  WHERE id = p_endpoint_id;

  RETURN v_new_secret;
END;
$$;

-- ============================================================================
-- 3. Fix validate_webhook_signature
-- ============================================================================
DROP FUNCTION IF EXISTS public.validate_webhook_signature(UUID, TEXT, TEXT);
CREATE FUNCTION public.validate_webhook_signature(
  p_endpoint_id UUID,
  p_signature TEXT,
  p_payload TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_endpoint RECORD;
  v_expected_current TEXT;
  v_expected_previous TEXT;
BEGIN
  SELECT * INTO v_endpoint
  FROM public.webhook_endpoints
  WHERE id = p_endpoint_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check current secret
  v_expected_current := 'sha256=' || encode(
    extensions.hmac(p_payload::bytea, v_endpoint.secret::bytea, 'sha256'),
    'hex'
  );

  IF p_signature = v_expected_current THEN
    RETURN TRUE;
  END IF;

  -- Check previous secret if rotation happened recently
  IF v_endpoint.previous_secret IS NOT NULL THEN
    v_expected_previous := 'sha256=' || encode(
      extensions.hmac(p_payload::bytea, v_endpoint.previous_secret::bytea, 'sha256'),
      'hex'
    );

    IF p_signature = v_expected_previous THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- ============================================================================
-- 4. Fix reprocess_stripe_event - remove unused variable
-- ============================================================================
DROP FUNCTION IF EXISTS public.reprocess_stripe_event(TEXT);
CREATE FUNCTION public.reprocess_stripe_event(p_event_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Placeholder - actual implementation depends on stripe event processing
  RETURN jsonb_build_object('status', 'not_implemented', 'event_id', p_event_id);
END;
$$;

-- ============================================================================
-- 5. Fix check_rate_limit_secure - actually use p_fail_closed
-- ============================================================================
DROP FUNCTION IF EXISTS public.check_rate_limit_secure(TEXT, INTEGER, INTEGER, BOOLEAN);
CREATE FUNCTION public.check_rate_limit_secure(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER,
  p_fail_closed BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Simple rate limiting using a cache table (if it exists)
  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.rate_limit_cache
    WHERE key = p_key
      AND created_at > NOW() - (p_window_seconds || ' seconds')::INTERVAL;

    RETURN v_count < p_limit;
  EXCEPTION WHEN undefined_table THEN
    -- Rate limit table doesn't exist - honor fail_closed parameter
    RETURN NOT p_fail_closed;
  END;
END;
$$;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.generate_api_key() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_webhook_secret(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_webhook_signature(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reprocess_stripe_event(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_secure(TEXT, INTEGER, INTEGER, BOOLEAN) TO authenticated, service_role;

SELECT 'pgcrypto search_path fixes applied' AS status;
