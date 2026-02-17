-- Fix migration: Add missing columns to existing organizations table
-- and complete multi-tenant hardening setup

-- ============================================================================
-- ADD MISSING COLUMNS TO ORGANIZATIONS
-- ============================================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_ledgers INTEGER DEFAULT 1;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_transactions_per_month INTEGER DEFAULT 1000;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_creators INTEGER DEFAULT 10;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_ip_ranges CIDR[];
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS require_2fa BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS processor_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

-- Add check constraint if not exists (wrapped in DO block to handle if exists)
DO $$ 
BEGIN
  ALTER TABLE organizations ADD CONSTRAINT organizations_plan_check 
    CHECK (plan IN ('free', 'starter', 'growth', 'enterprise'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER TABLE organizations ADD CONSTRAINT organizations_subscription_status_check 
    CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- ENHANCED API KEYS (if not exists)
-- ============================================================================

ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS api_key_scopes TEXT[] DEFAULT ARRAY['read', 'write'];
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS api_key_expires_at TIMESTAMPTZ;
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS api_key_last_used_at TIMESTAMPTZ;
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS api_key_last_used_ip INET;

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

-- ============================================================================
-- RATE LIMITING
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY,
  tokens INTEGER NOT NULL DEFAULT 0,
  last_refill TIMESTAMPTZ DEFAULT NOW(),
  max_tokens INTEGER NOT NULL DEFAULT 60,
  refill_rate INTEGER NOT NULL DEFAULT 60,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_cleanup ON rate_limit_buckets(expires_at);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_max_tokens INTEGER DEFAULT 60,
  p_refill_rate INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
  v_bucket RECORD;
  v_elapsed_minutes NUMERIC;
  v_new_tokens INTEGER;
BEGIN
  INSERT INTO rate_limit_buckets (key, tokens, max_tokens, refill_rate)
  VALUES (p_key, p_max_tokens, p_max_tokens, p_refill_rate)
  ON CONFLICT (key) DO UPDATE SET last_refill = rate_limit_buckets.last_refill
  RETURNING * INTO v_bucket;
  
  v_elapsed_minutes := EXTRACT(EPOCH FROM (NOW() - v_bucket.last_refill)) / 60;
  v_new_tokens := LEAST(
    v_bucket.max_tokens,
    v_bucket.tokens + FLOOR(v_elapsed_minutes * v_bucket.refill_rate)::INTEGER
  );
  
  IF v_new_tokens < 1 THEN
    RETURN FALSE;
  END IF;
  
  UPDATE rate_limit_buckets
  SET tokens = v_new_tokens - 1,
      last_refill = CASE WHEN v_elapsed_minutes >= 1 THEN NOW() ELSE last_refill END,
      expires_at = NOW() + INTERVAL '1 hour'
  WHERE key = p_key;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- USAGE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  ledger_id UUID REFERENCES ledgers(id),
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transactions_count INTEGER DEFAULT 0,
  api_calls_count INTEGER DEFAULT 0,
  creators_count INTEGER DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,
  billable_amount NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ledger_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_org_date ON usage_metrics(organization_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_date ON usage_metrics(ledger_id, metric_date);

CREATE OR REPLACE FUNCTION increment_usage(
  p_ledger_id UUID,
  p_metric TEXT,
  p_amount INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  INSERT INTO usage_metrics (ledger_id, organization_id, metric_date, transactions_count, api_calls_count)
  SELECT p_ledger_id, organization_id, CURRENT_DATE, 
         CASE WHEN p_metric = 'transactions' THEN p_amount ELSE 0 END,
         CASE WHEN p_metric = 'api_calls' THEN p_amount ELSE 0 END
  FROM ledgers WHERE id = p_ledger_id
  ON CONFLICT (ledger_id, metric_date) DO UPDATE SET
    transactions_count = usage_metrics.transactions_count + 
      CASE WHEN p_metric = 'transactions' THEN p_amount ELSE 0 END,
    api_calls_count = usage_metrics.api_calls_count + 
      CASE WHEN p_metric = 'api_calls' THEN p_amount ELSE 0 END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ENHANCED AUDIT LOG
-- ============================================================================

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS api_key_id UUID;

CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_ip ON audit_log(ip_address, created_at DESC);

-- ============================================================================
-- DATA RETENTION POLICIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  audit_log_retention_days INTEGER DEFAULT 2555,
  transaction_detail_retention_days INTEGER DEFAULT 2555,
  api_logs_retention_days INTEGER DEFAULT 90,
  auto_delete_expired BOOLEAN DEFAULT false,
  deletion_requires_approval BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_retention_policies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create
DROP POLICY IF EXISTS "Organization member access" ON organizations;
DROP POLICY IF EXISTS "Member list access" ON organization_members;
DROP POLICY IF EXISTS "API key management" ON api_keys;
DROP POLICY IF EXISTS "Usage visibility" ON usage_metrics;

-- Service role bypass for Edge Functions
CREATE POLICY "Service role full access" ON organizations FOR ALL USING (true);
CREATE POLICY "Service role full access" ON organization_members FOR ALL USING (true);
CREATE POLICY "Service role full access" ON api_keys FOR ALL USING (true);
CREATE POLICY "Service role full access" ON usage_metrics FOR ALL USING (true);
CREATE POLICY "Service role full access" ON data_retention_policies FOR ALL USING (true);

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_buckets WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_data_retention() RETURNS void AS $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN SELECT * FROM data_retention_policies WHERE auto_delete_expired = true LOOP
    DELETE FROM audit_log 
    WHERE organization_id = v_policy.organization_id
      AND created_at < NOW() - (v_policy.audit_log_retention_days || ' days')::interval;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ASSIGN EXISTING LEDGERS TO DEFAULT ORG
-- ============================================================================

DO $$
DECLARE
  v_default_org_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM ledgers WHERE organization_id IS NULL) THEN
    -- Check if default org exists
    SELECT id INTO v_default_org_id FROM organizations WHERE slug = 'default';
    
    IF v_default_org_id IS NULL THEN
      INSERT INTO organizations (name, slug, plan, max_ledgers, max_transactions_per_month, max_creators)
      VALUES ('Default Organization', 'default', 'growth', 100, 100000, 1000)
      RETURNING id INTO v_default_org_id;
    END IF;
    
    UPDATE ledgers SET organization_id = v_default_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE organizations IS 'Top-level tenant isolation unit';
COMMENT ON TABLE organization_members IS 'User membership in organizations with roles';
COMMENT ON TABLE api_keys IS 'Secondary API keys with scoped permissions';
COMMENT ON TABLE rate_limit_buckets IS 'Token bucket rate limiting state';
COMMENT ON TABLE usage_metrics IS 'Daily usage tracking for billing and limits';
COMMENT ON TABLE data_retention_policies IS 'Per-organization data retention configuration';
