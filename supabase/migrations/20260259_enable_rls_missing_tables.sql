-- Enable RLS on tables missing row-level security
-- These tables were flagged by the Supabase security linter

-- ============================================================================
-- 1. connected_accounts
-- ============================================================================
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;

-- Service role bypass for edge functions
CREATE POLICY "Service role has full access to connected_accounts"
  ON connected_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No direct API access - these are managed by edge functions only
-- Authenticated users cannot access directly

-- ============================================================================
-- 2. escrow_releases
-- ============================================================================
ALTER TABLE escrow_releases ENABLE ROW LEVEL SECURITY;

-- Service role bypass for edge functions
CREATE POLICY "Service role has full access to escrow_releases"
  ON escrow_releases
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. payout_requests
-- ============================================================================
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;

-- Service role bypass for edge functions
CREATE POLICY "Service role has full access to payout_requests"
  ON payout_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 4. race_condition_events
-- ============================================================================
ALTER TABLE race_condition_events ENABLE ROW LEVEL SECURITY;

-- Service role bypass for edge functions (metrics/monitoring)
CREATE POLICY "Service role has full access to race_condition_events"
  ON race_condition_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 5. audit_log_archive
-- ============================================================================
ALTER TABLE audit_log_archive ENABLE ROW LEVEL SECURITY;

-- Service role bypass for edge functions
CREATE POLICY "Service role has full access to audit_log_archive"
  ON audit_log_archive
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  tbl TEXT;
  rls_enabled BOOLEAN;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'connected_accounts',
    'escrow_releases',
    'payout_requests',
    'race_condition_events',
    'audit_log_archive'
  ])
  LOOP
    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
    WHERE relname = tbl AND relnamespace = 'public'::regnamespace;

    IF NOT rls_enabled THEN
      RAISE EXCEPTION 'RLS not enabled on table: %', tbl;
    END IF;
  END LOOP;

  RAISE NOTICE 'RLS verification passed for all 5 tables';
END $$;
