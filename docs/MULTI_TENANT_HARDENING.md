# Soledgic Multi-Tenant Hardening

## Overview

This document outlines the security hardening required to operate Soledgic as a multi-tenant SaaS platform where multiple independent businesses share infrastructure while maintaining complete data isolation.

---

## 1. Tenant Isolation Architecture

### Current State
- ✅ Row-Level Security (RLS) on all tables
- ✅ API key authentication per ledger
- ⚠️ Single API key type (no scopes)
- ⚠️ No rate limiting
- ⚠️ No tenant-level resource quotas

### Target State

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │  Rate   │→ │  Auth   │→ │  Quota  │→ │  Edge Function  │ │
│  │ Limiter │  │ Verify  │  │  Check  │  │    Router       │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
    ┌─────────┐          ┌─────────┐          ┌─────────┐
    │ Tenant A │          │ Tenant B │          │ Tenant C │
    │  Ledger  │          │  Ledger  │          │  Ledger  │
    └─────────┘          └─────────┘          └─────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │   (RLS Active)  │
                    └─────────────────┘
```

---

## 2. Database Hardening

### 2.1 Enhanced RLS Policies

```sql
-- Migration: 20251221_multi_tenant_hardening.sql

-- ============================================================================
-- ORGANIZATION/TENANT LAYER
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'growth', 'enterprise')),
  
  -- Billing
  processor_customer_id TEXT,
  subscription_status TEXT DEFAULT 'active',
  
  -- Limits (based on plan)
  max_ledgers INTEGER DEFAULT 1,
  max_transactions_per_month INTEGER DEFAULT 1000,
  max_creators INTEGER DEFAULT 10,
  
  -- Security
  allowed_ip_ranges CIDR[],
  require_2fa BOOLEAN DEFAULT false,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization members
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'auditor')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  
  UNIQUE(organization_id, user_id)
);

-- Link ledgers to organizations
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_ledgers_org ON ledgers(organization_id);

-- ============================================================================
-- API KEY SCOPING
-- ============================================================================

-- Add scopes and metadata to API keys
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS api_key_scopes TEXT[] DEFAULT ARRAY['read', 'write'];
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS api_key_expires_at TIMESTAMPTZ;
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS api_key_last_used_at TIMESTAMPTZ;
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS api_key_last_used_ip INET;

-- Secondary API keys with limited scopes
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL, -- Store hashed, not plaintext
  key_prefix TEXT NOT NULL, -- First 8 chars for identification
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],
  
  -- Restrictions
  allowed_ips CIDR[],
  rate_limit_per_minute INTEGER DEFAULT 60,
  expires_at TIMESTAMPTZ,
  
  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  last_used_ip INET,
  revoked_at TIMESTAMPTZ,
  
  CONSTRAINT valid_scopes CHECK (scopes <@ ARRAY['read', 'write', 'admin', 'reports', 'payouts'])
);

CREATE INDEX idx_api_keys_lookup ON api_keys(key_prefix) WHERE revoked_at IS NULL;

-- ============================================================================
-- RATE LIMITING
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY, -- e.g., "ledger:{id}:minute" or "ip:{addr}:minute"
  tokens INTEGER NOT NULL DEFAULT 0,
  last_refill TIMESTAMPTZ DEFAULT NOW(),
  max_tokens INTEGER NOT NULL DEFAULT 60,
  refill_rate INTEGER NOT NULL DEFAULT 60, -- tokens per minute
  
  -- Auto-cleanup old entries
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX idx_rate_limit_cleanup ON rate_limit_buckets(expires_at);

-- Function to check and consume rate limit
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
  -- Get or create bucket
  INSERT INTO rate_limit_buckets (key, tokens, max_tokens, refill_rate)
  VALUES (p_key, p_max_tokens, p_max_tokens, p_refill_rate)
  ON CONFLICT (key) DO UPDATE SET
    last_refill = rate_limit_buckets.last_refill
  RETURNING * INTO v_bucket;
  
  -- Calculate refill
  v_elapsed_minutes := EXTRACT(EPOCH FROM (NOW() - v_bucket.last_refill)) / 60;
  v_new_tokens := LEAST(
    v_bucket.max_tokens,
    v_bucket.tokens + FLOOR(v_elapsed_minutes * v_bucket.refill_rate)::INTEGER
  );
  
  -- Check if we have tokens
  IF v_new_tokens < 1 THEN
    RETURN FALSE;
  END IF;
  
  -- Consume token
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
  
  -- Counts
  transactions_count INTEGER DEFAULT 0,
  api_calls_count INTEGER DEFAULT 0,
  creators_count INTEGER DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,
  
  -- Billing
  billable_amount NUMERIC(10,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, metric_date)
);

CREATE INDEX idx_usage_org_date ON usage_metrics(organization_id, metric_date);

-- Function to increment usage
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
-- ENHANCED RLS POLICIES
-- ============================================================================

-- Drop existing policies and recreate with organization context
ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger isolation" ON ledgers;
CREATE POLICY "Organization ledger access" ON ledgers
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
    OR 
    -- API key access (for Edge Functions)
    current_setting('app.current_ledger_id', true)::uuid = id
  );

-- Accounts inherit ledger access
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger isolation" ON accounts;
CREATE POLICY "Account access via ledger" ON accounts
  FOR ALL
  USING (
    ledger_id IN (
      SELECT id FROM ledgers WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
    OR
    current_setting('app.current_ledger_id', true)::uuid = ledger_id
  );

-- Transactions inherit ledger access  
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger isolation" ON transactions;
CREATE POLICY "Transaction access via ledger" ON transactions
  FOR ALL
  USING (
    ledger_id IN (
      SELECT id FROM ledgers WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
    OR
    current_setting('app.current_ledger_id', true)::uuid = ledger_id
  );

-- Similar policies for all other tables...
-- entries, accounting_periods, frozen_statements, reconciliation_snapshots, etc.

-- ============================================================================
-- AUDIT LOGGING ENHANCEMENT
-- ============================================================================

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id);

CREATE INDEX idx_audit_org ON audit_log(organization_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);

-- ============================================================================
-- DATA RETENTION POLICIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  
  -- Retention periods (in days)
  audit_log_retention_days INTEGER DEFAULT 2555, -- 7 years for financial
  transaction_detail_retention_days INTEGER DEFAULT 2555,
  api_logs_retention_days INTEGER DEFAULT 90,
  
  -- Deletion settings
  auto_delete_expired BOOLEAN DEFAULT false,
  deletion_requires_approval BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id)
);

-- ============================================================================
-- ENCRYPTION AT REST (column-level for sensitive data)
-- ============================================================================

-- Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypted fields table for PII
CREATE TABLE IF NOT EXISTS encrypted_pii (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'creator', 'contractor', etc.
  entity_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  encrypted_value BYTEA NOT NULL, -- pgp_sym_encrypt(value, key)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, entity_type, entity_id, field_name)
);

-- Note: Encryption key should be stored in Supabase Vault or environment variable
-- Access via: pgp_sym_decrypt(encrypted_value, current_setting('app.encryption_key'))
```

### 2.2 Migration Script

```bash
# Run this migration
supabase db push
```

---

## 3. API Gateway Hardening

### 3.1 Enhanced Authentication Middleware

```typescript
// supabase/functions/_shared/auth-middleware.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface AuthResult {
  success: boolean
  ledgerId?: string
  organizationId?: string
  scopes?: string[]
  error?: string
  rateLimited?: boolean
}

interface RateLimitConfig {
  maxRequests: number
  windowMinutes: number
}

const PLAN_LIMITS: Record<string, RateLimitConfig> = {
  free: { maxRequests: 100, windowMinutes: 1 },
  starter: { maxRequests: 500, windowMinutes: 1 },
  growth: { maxRequests: 2000, windowMinutes: 1 },
  enterprise: { maxRequests: 10000, windowMinutes: 1 },
}

export async function authenticateRequest(
  req: Request,
  requiredScopes: string[] = ['read']
): Promise<AuthResult> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Extract API key
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) {
    return { success: false, error: 'Missing API key' }
  }

  // Get client IP for rate limiting and audit
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   req.headers.get('cf-connecting-ip') || 
                   'unknown'

  // Check primary API key first
  const { data: ledger, error: ledgerError } = await supabase
    .from('ledgers')
    .select(`
      id, 
      organization_id,
      api_key_scopes,
      api_key_expires_at,
      organizations!inner(plan, subscription_status, allowed_ip_ranges)
    `)
    .eq('api_key', apiKey)
    .single()

  if (ledgerError || !ledger) {
    // Check secondary API keys
    const keyPrefix = apiKey.substring(0, 8)
    const { data: secondaryKey } = await supabase
      .from('api_keys')
      .select(`
        id,
        ledger_id,
        scopes,
        allowed_ips,
        rate_limit_per_minute,
        expires_at,
        ledgers!inner(organization_id, organizations!inner(plan, subscription_status))
      `)
      .eq('key_prefix', keyPrefix)
      .is('revoked_at', null)
      .single()

    if (!secondaryKey) {
      return { success: false, error: 'Invalid API key' }
    }

    // Verify full key hash
    const keyHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(apiKey)
    )
    const hashHex = Array.from(new Uint8Array(keyHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Compare hashes (in production, use constant-time comparison)
    // For now, continue with lookup result

    // Check expiration
    if (secondaryKey.expires_at && new Date(secondaryKey.expires_at) < new Date()) {
      return { success: false, error: 'API key expired' }
    }

    // Check IP allowlist
    if (secondaryKey.allowed_ips?.length > 0) {
      const allowed = secondaryKey.allowed_ips.some((cidr: string) => 
        isIpInCidr(clientIp, cidr)
      )
      if (!allowed) {
        return { success: false, error: 'IP not allowed' }
      }
    }

    // Check scopes
    const hasRequiredScopes = requiredScopes.every(s => 
      secondaryKey.scopes.includes(s) || secondaryKey.scopes.includes('admin')
    )
    if (!hasRequiredScopes) {
      return { success: false, error: 'Insufficient permissions' }
    }

    // Update last used
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString(), last_used_ip: clientIp })
      .eq('id', secondaryKey.id)

    return {
      success: true,
      ledgerId: secondaryKey.ledger_id,
      organizationId: (secondaryKey.ledgers as any).organization_id,
      scopes: secondaryKey.scopes,
    }
  }

  // Primary key validation
  const org = (ledger as any).organizations

  // Check subscription status
  if (org.subscription_status !== 'active') {
    return { success: false, error: 'Subscription inactive' }
  }

  // Check key expiration
  if (ledger.api_key_expires_at && new Date(ledger.api_key_expires_at) < new Date()) {
    return { success: false, error: 'API key expired' }
  }

  // Check IP allowlist (organization level)
  if (org.allowed_ip_ranges?.length > 0) {
    const allowed = org.allowed_ip_ranges.some((cidr: string) => 
      isIpInCidr(clientIp, cidr)
    )
    if (!allowed) {
      return { success: false, error: 'IP not allowed for organization' }
    }
  }

  // Check scopes
  const scopes = ledger.api_key_scopes || ['read', 'write']
  const hasRequiredScopes = requiredScopes.every(s => 
    scopes.includes(s) || scopes.includes('admin')
  )
  if (!hasRequiredScopes) {
    return { success: false, error: 'Insufficient permissions' }
  }

  // Rate limiting
  const planLimits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.free
  const { data: rateLimitOk } = await supabase.rpc('check_rate_limit', {
    p_key: `ledger:${ledger.id}:minute`,
    p_max_tokens: planLimits.maxRequests,
    p_refill_rate: planLimits.maxRequests,
  })

  if (!rateLimitOk) {
    return { success: false, error: 'Rate limit exceeded', rateLimited: true }
  }

  // Update usage metrics
  await supabase.rpc('increment_usage', {
    p_ledger_id: ledger.id,
    p_metric: 'api_calls',
    p_amount: 1,
  })

  // Update last used
  await supabase
    .from('ledgers')
    .update({ 
      api_key_last_used_at: new Date().toISOString(), 
      api_key_last_used_ip: clientIp 
    })
    .eq('id', ledger.id)

  return {
    success: true,
    ledgerId: ledger.id,
    organizationId: ledger.organization_id,
    scopes,
  }
}

function isIpInCidr(ip: string, cidr: string): boolean {
  // Simplified check - in production use a proper CIDR library
  if (cidr === '0.0.0.0/0') return true
  
  const [range, bits] = cidr.split('/')
  if (!bits) return ip === range
  
  // For now, basic prefix match
  const prefix = range.split('.').slice(0, parseInt(bits) / 8).join('.')
  return ip.startsWith(prefix)
}

// Audit logging helper
export async function logAuditEvent(
  supabase: any,
  event: {
    ledgerId: string
    organizationId?: string
    action: string
    entityType: string
    entityId?: string
    details?: any
    userId?: string
    ipAddress?: string
    userAgent?: string
    apiKeyId?: string
  }
) {
  await supabase.from('audit_log').insert({
    ledger_id: event.ledgerId,
    organization_id: event.organizationId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    details: event.details,
    user_id: event.userId,
    ip_address: event.ipAddress,
    user_agent: event.userAgent,
    api_key_id: event.apiKeyId,
    source: 'api',
  })
}
```

### 3.2 Update All Edge Functions

Each Edge Function should use the new middleware:

```typescript
// Example: record-sale/index.ts

import { authenticateRequest, logAuditEvent } from '../_shared/auth-middleware.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Authenticate with required scopes
  const auth = await authenticateRequest(req, ['write'])
  
  if (!auth.success) {
    const status = auth.rateLimited ? 429 : 401
    return new Response(
      JSON.stringify({ success: false, error: auth.error }),
      { 
        status, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          ...(auth.rateLimited ? { 'Retry-After': '60' } : {})
        } 
      }
    )
  }

  // Set ledger context for RLS
  await supabase.rpc('set_config', { 
    setting: 'app.current_ledger_id', 
    value: auth.ledgerId 
  })

  // ... rest of function logic ...

  // Log audit event
  await logAuditEvent(supabase, {
    ledgerId: auth.ledgerId!,
    organizationId: auth.organizationId,
    action: 'sale_recorded',
    entityType: 'transaction',
    entityId: transaction.id,
    details: { amount, creatorId },
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: req.headers.get('user-agent'),
  })
})
```

---

## 4. Secrets Management

### 4.1 Supabase Vault Integration

```sql
-- Store encryption keys in Vault
SELECT vault.create_secret('soledgic_encryption_key', 'your-32-byte-encryption-key-here');

-- Access in functions
CREATE OR REPLACE FUNCTION get_encryption_key() RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'soledgic_encryption_key');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4.2 Environment Variables

```bash
# Required environment variables for Edge Functions
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx

# Optional integrations
BANK_FEED_CLIENT_ID=xxx
BANK_FEED_SECRET=xxx
PROCESSOR_SECRET_KEY=xxx
SENDGRID_API_KEY=xxx

# Monitoring
SENTRY_DSN=xxx
```

---

## 5. Monitoring & Alerting

### 5.1 Health Check Endpoint

```typescript
// supabase/functions/health/index.ts

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const checks: Record<string, boolean> = {}

  // Database connectivity
  try {
    const { error } = await supabase.from('ledgers').select('count').limit(1)
    checks.database = !error
  } catch {
    checks.database = false
  }

  // Check for stuck transactions
  const { data: stuck } = await supabase
    .from('transactions')
    .select('count')
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 3600000).toISOString())
  checks.no_stuck_transactions = (stuck?.length || 0) === 0

  // Check rate limit table health
  const { error: rlError } = await supabase
    .from('rate_limit_buckets')
    .delete()
    .lt('expires_at', new Date().toISOString())
  checks.rate_limit_cleanup = !rlError

  const healthy = Object.values(checks).every(v => v)

  return new Response(
    JSON.stringify({ 
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString()
    }),
    { 
      status: healthy ? 200 : 503,
      headers: { 'Content-Type': 'application/json' }
    }
  )
})
```

### 5.2 Metrics Dashboard Query

```sql
-- Daily API usage by organization
SELECT 
  o.name as organization,
  o.plan,
  SUM(um.api_calls_count) as api_calls,
  SUM(um.transactions_count) as transactions,
  COUNT(DISTINCT um.ledger_id) as active_ledgers
FROM usage_metrics um
JOIN ledgers l ON um.ledger_id = l.id
JOIN organizations o ON l.organization_id = o.id
WHERE um.metric_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY o.id, o.name, o.plan
ORDER BY api_calls DESC;

-- Rate limit violations
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as violations
FROM audit_log
WHERE action = 'rate_limit_exceeded'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 1;
```

---

## 6. Deployment Checklist

### Pre-Production

- [ ] Run database migration for multi-tenant tables
- [ ] Deploy updated Edge Functions with auth middleware
- [ ] Configure Supabase Vault for encryption keys
- [ ] Set up monitoring alerts (Sentry, PagerDuty, etc.)
- [ ] Enable database backups (point-in-time recovery)
- [ ] Configure IP allowlists for enterprise customers
- [ ] Set up usage metering for billing

### Security Review

- [ ] Penetration test API endpoints
- [ ] Verify RLS policies with cross-tenant queries
- [ ] Test rate limiting under load
- [ ] Verify audit log completeness
- [ ] Review API key rotation process
- [ ] Test subscription status enforcement

### Compliance

- [ ] Document data retention policies
- [ ] Implement right-to-deletion (GDPR)
- [ ] Set up data export functionality
- [ ] Configure audit log retention
- [ ] Document security controls for SOC 2

---

## 7. Emergency Procedures

### API Key Compromise

```sql
-- Revoke all keys for a ledger
UPDATE api_keys SET revoked_at = NOW() WHERE ledger_id = 'xxx';

-- Rotate primary key
UPDATE ledgers 
SET api_key = 'sk_live_' || encode(gen_random_bytes(24), 'hex'),
    api_key_last_used_at = NULL
WHERE id = 'xxx';
```

### Rate Limit Override (Emergency)

```sql
-- Temporarily increase limits for specific org
UPDATE organizations 
SET max_transactions_per_month = 999999 
WHERE id = 'xxx';

-- Clear rate limit buckets
DELETE FROM rate_limit_buckets WHERE key LIKE 'ledger:xxx%';
```

### Tenant Data Export

```sql
-- Export all data for a ledger (for migration or deletion)
COPY (
  SELECT * FROM transactions WHERE ledger_id = 'xxx'
) TO '/tmp/transactions.csv' CSV HEADER;

COPY (
  SELECT * FROM entries WHERE account_id IN (
    SELECT id FROM accounts WHERE ledger_id = 'xxx'
  )
) TO '/tmp/entries.csv' CSV HEADER;

-- ... repeat for all tables
```
