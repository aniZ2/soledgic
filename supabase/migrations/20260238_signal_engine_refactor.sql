-- ============================================================================
-- PHASE 3.1: SIGNAL ENGINE REFACTOR
-- ============================================================================
--
-- Philosophy: Soledgic is a signal engine, not a decision engine.
-- We provide information, not judgment.
--
-- "Soledgic never says 'do' or 'don't.' It says 'this is where you are standing.'"
--
-- This migration renames vocabulary while preserving all logic:
-- - authorization_decisions → risk_evaluations
-- - decision → signal
-- - blocked/allowed/warn → high_risk/within_policy/elevated_risk
-- - expires_at → valid_until
-- ============================================================================

-- Rename authorization_decisions to risk_evaluations
ALTER TABLE IF EXISTS authorization_decisions RENAME TO risk_evaluations;

-- Rename columns to reflect signal paradigm
ALTER TABLE IF EXISTS risk_evaluations
  RENAME COLUMN decision TO signal;

ALTER TABLE IF EXISTS risk_evaluations
  RENAME COLUMN expires_at TO valid_until;

ALTER TABLE IF EXISTS risk_evaluations
  RENAME COLUMN violated_policies TO risk_factors;

-- Drop old check constraint first
ALTER TABLE risk_evaluations
  DROP CONSTRAINT IF EXISTS authorization_decisions_decision_check;

-- Migrate existing data to new vocabulary BEFORE adding new constraint
UPDATE risk_evaluations SET signal = 'within_policy' WHERE signal = 'allowed';
UPDATE risk_evaluations SET signal = 'elevated_risk' WHERE signal = 'warn';
UPDATE risk_evaluations SET signal = 'high_risk' WHERE signal = 'blocked';

-- Now add the new check constraint
ALTER TABLE risk_evaluations
  ADD CONSTRAINT risk_evaluations_signal_check
  CHECK (signal IN ('within_policy', 'elevated_risk', 'high_risk'));

-- Rename authorization_policies to risk_policies (optional, but consistent)
ALTER TABLE IF EXISTS authorization_policies RENAME TO risk_policies;

-- Update indexes
DROP INDEX IF EXISTS idx_authorization_decisions_lookup;
DROP INDEX IF EXISTS idx_authorization_decisions_expires;
CREATE INDEX IF NOT EXISTS idx_risk_evaluations_lookup
  ON risk_evaluations(ledger_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_risk_evaluations_valid_until
  ON risk_evaluations(valid_until);

-- Add acknowledged_at column for explicit user override tracking
-- "When users proceed anyway, that's on them"
ALTER TABLE risk_evaluations
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE risk_evaluations
  ADD COLUMN IF NOT EXISTS acknowledged_by TEXT DEFAULT NULL;

-- Add comment explaining the paradigm
COMMENT ON TABLE risk_evaluations IS
  'Risk evaluation signals (not decisions). Soledgic analyzes and flags, it does not authorize or deny.';

COMMENT ON COLUMN risk_evaluations.signal IS
  'Risk signal: within_policy (acceptable), elevated_risk (proceed with awareness), high_risk (significant concerns)';

COMMENT ON COLUMN risk_evaluations.acknowledged_at IS
  'Timestamp when user acknowledged risk and proceeded anyway. Null if not yet acknowledged.';

-- Update RLS policies with new table name
DROP POLICY IF EXISTS "Ledger API can manage decisions" ON risk_evaluations;
CREATE POLICY "Ledger API can manage evaluations"
  ON risk_evaluations FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Ledger API can manage policies" ON risk_policies;
CREATE POLICY "Ledger API can manage policies"
  ON risk_policies FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- NOTE ON RECORD-EXPENSE/BILL INTEGRATION:
-- ============================================================================
-- The risk_evaluation_id is now PURELY INFORMATIONAL.
-- Transactions proceed regardless of signal value.
-- The signal is recorded for audit/analysis, not for blocking.
--
-- If a client wants enforcement, THEY configure it on their end:
--   - "require acknowledgment on high_risk"
--   - "auto-reject on high_risk"
--   - "alert on elevated_risk"
--
-- That's THEIR configuration, not our judgment.
-- ============================================================================
