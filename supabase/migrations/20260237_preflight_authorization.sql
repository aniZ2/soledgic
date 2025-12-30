-- Soledgic: Preflight Authorization Engine (Phase 3)
-- Ledger-native policy enforcement BEFORE money moves
--
-- This system:
-- - Decides whether a transaction SHOULD be allowed
-- - Proves authorization BEFORE execution
-- - Blocks or warns BEFORE risk materializes
--
-- This system does NOT:
-- - Move money
-- - Reserve balances
-- - Lock accounts
-- - Execute transfers

-- ============================================================================
-- 1. AUTHORIZATION POLICIES TABLE
-- ============================================================================
-- Defines what is allowed per ledger

CREATE TABLE IF NOT EXISTS authorization_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,

  -- Policy definition
  policy_type TEXT NOT NULL CHECK (policy_type IN (
    'require_instrument',   -- Require authorizing instrument above threshold
    'budget_cap',           -- Monthly/quarterly spending caps
    'projection_guard'      -- Block if would cause breach risk
  )),

  -- Policy-specific configuration
  -- require_instrument: { "threshold_amount": 100000 } (cents)
  -- budget_cap: { "period": "monthly", "cap_amount": 5000000, "category": "software" }
  -- projection_guard: { "min_coverage_ratio": 0.5 }
  config JSONB NOT NULL DEFAULT '{}',

  -- Enforcement level
  -- hard = blocks transaction
  -- soft = allows with warning
  severity TEXT NOT NULL DEFAULT 'hard' CHECK (severity IN ('hard', 'soft')),

  -- Evaluation order (lower = first)
  priority INTEGER NOT NULL DEFAULT 100,

  -- Policy status
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One active policy per type per ledger (can have multiple with different configs via priority)
  CONSTRAINT unique_policy_priority UNIQUE (ledger_id, policy_type, priority)
);

CREATE INDEX idx_authorization_policies_ledger ON authorization_policies(ledger_id) WHERE is_active = true;
CREATE INDEX idx_authorization_policies_type ON authorization_policies(policy_type) WHERE is_active = true;

-- ============================================================================
-- 2. AUTHORIZATION DECISIONS TABLE
-- ============================================================================
-- Records of preflight authorization checks (immutable)

CREATE TABLE IF NOT EXISTS authorization_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,

  -- Idempotency (REQUIRED) - prevents duplicate evaluations
  idempotency_key TEXT NOT NULL,

  -- Proposed transaction details (what was evaluated)
  proposed_transaction JSONB NOT NULL,
  -- {
  --   "amount": 500000,
  --   "currency": "USD",
  --   "counterparty_name": "Acme Corp",
  --   "authorizing_instrument_id": "uuid or null",
  --   "expected_date": "2025-01-15",
  --   "category": "software"
  -- }

  -- Decision outcome
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'warn', 'blocked')),

  -- Policy violations (empty array if allowed with no warnings)
  violated_policies JSONB NOT NULL DEFAULT '[]',
  -- [
  --   { "policy_id": "uuid", "policy_type": "budget_cap", "severity": "soft", "reason": "Monthly cap exceeded by $5,000" }
  -- ]

  -- Time-bound validity (decisions expire)
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),

  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency enforcement per ledger
  CONSTRAINT unique_idempotency_key UNIQUE (ledger_id, idempotency_key)
);

CREATE INDEX idx_authorization_decisions_ledger ON authorization_decisions(ledger_id);
CREATE INDEX idx_authorization_decisions_idempotency ON authorization_decisions(ledger_id, idempotency_key);
CREATE INDEX idx_authorization_decisions_expires ON authorization_decisions(expires_at);
CREATE INDEX idx_authorization_decisions_decision ON authorization_decisions(decision);

-- ============================================================================
-- 3. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE authorization_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_decisions ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY authorization_policies_service_all ON authorization_policies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY authorization_decisions_service_all ON authorization_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can manage their ledger's policies
CREATE POLICY authorization_policies_user_select ON authorization_policies
  FOR SELECT TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY authorization_policies_user_insert ON authorization_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY authorization_policies_user_update ON authorization_policies
  FOR UPDATE TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY authorization_policies_user_delete ON authorization_policies
  FOR DELETE TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Users can view their ledger's decisions (read-only - decisions are immutable)
CREATE POLICY authorization_decisions_user_select ON authorization_decisions
  FOR SELECT TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Check if a decision is still valid (not expired)
CREATE OR REPLACE FUNCTION is_authorization_valid(p_decision_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
  v_decision TEXT;
BEGIN
  SELECT expires_at, decision INTO v_expires_at, v_decision
  FROM authorization_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Expired decisions are invalid
  IF v_expires_at < NOW() THEN
    RETURN false;
  END IF;

  -- Only allowed or warn decisions are valid for proceeding
  RETURN v_decision IN ('allowed', 'warn');
END;
$$;

-- Get active policies for a ledger, ordered by priority
CREATE OR REPLACE FUNCTION get_active_policies(p_ledger_id UUID)
RETURNS TABLE (
  id UUID,
  policy_type TEXT,
  config JSONB,
  severity TEXT,
  priority INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ap.id,
    ap.policy_type,
    ap.config,
    ap.severity,
    ap.priority
  FROM authorization_policies ap
  WHERE ap.ledger_id = p_ledger_id
    AND ap.is_active = true
  ORDER BY ap.priority ASC;
END;
$$;

-- Cleanup expired decisions (called by cron)
CREATE OR REPLACE FUNCTION cleanup_expired_authorization_decisions(p_older_than_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM authorization_decisions
  WHERE expires_at < NOW() - (p_older_than_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE authorization_policies IS 'Ledger-native authorization policies that define what transactions are allowed';
COMMENT ON TABLE authorization_decisions IS 'Immutable record of preflight authorization checks';

COMMENT ON COLUMN authorization_policies.policy_type IS 'Type of policy: require_instrument, budget_cap, projection_guard';
COMMENT ON COLUMN authorization_policies.severity IS 'hard = blocks transaction, soft = allows with warning';
COMMENT ON COLUMN authorization_policies.priority IS 'Evaluation order (lower = first)';

COMMENT ON COLUMN authorization_decisions.idempotency_key IS 'Required key to prevent duplicate evaluations';
COMMENT ON COLUMN authorization_decisions.decision IS 'allowed = proceed, warn = proceed with caution, blocked = do not proceed';
COMMENT ON COLUMN authorization_decisions.expires_at IS 'Decisions are time-bound and expire (default 2 hours)';
