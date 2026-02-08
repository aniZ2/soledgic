-- ============================================================================
-- Ensure api_keys table exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],
  allowed_ips CIDR[],
  rate_limit_per_minute INTEGER DEFAULT 60,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  last_used_ip INET,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT valid_scopes CHECK (scopes <@ ARRAY['read', 'write', 'admin', 'reports', 'payouts'])
);

CREATE INDEX IF NOT EXISTS idx_api_keys_lookup ON api_keys(key_prefix) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_ledger ON api_keys(ledger_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- RLS policies for api_keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "service_role_api_keys" ON api_keys;
CREATE POLICY "service_role_api_keys" ON api_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can view their org's API keys
DROP POLICY IF EXISTS "authenticated_select_api_keys" ON api_keys;
CREATE POLICY "authenticated_select_api_keys" ON api_keys
  FOR SELECT TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Authenticated users can insert API keys for their org's ledgers
DROP POLICY IF EXISTS "authenticated_insert_api_keys" ON api_keys;
CREATE POLICY "authenticated_insert_api_keys" ON api_keys
  FOR INSERT TO authenticated
  WITH CHECK (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );
