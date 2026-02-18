-- Migration: processor Reconciliation Job Schema
-- Tables for tracking reconciliation runs and drift alerts

-- ============================================================================
-- 1. reconciliation_runs table
-- ============================================================================
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,

  -- Run metadata
  run_type TEXT NOT NULL CHECK (run_type IN ('sync', 'auto_match', 'check_drift', 'daily')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Results
  stats JSONB DEFAULT '{}'::jsonb,
  -- e.g. { "synced": 42, "matched": 38, "unmatched": 4, "new_matches": 12 }

  -- Drift (for check_drift runs)
  drift_amount NUMERIC(15,2),
  drift_percent NUMERIC(8,4),

  -- Error info
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recon_runs_ledger ON reconciliation_runs(ledger_id, started_at DESC);
CREATE INDEX idx_recon_runs_status ON reconciliation_runs(status) WHERE status = 'running';

-- ============================================================================
-- 2. drift_alerts table
-- ============================================================================
CREATE TABLE IF NOT EXISTS drift_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,

  -- Balance comparison
  expected_balance NUMERIC(15,2) NOT NULL,  -- Internal ledger cash balance
  actual_balance NUMERIC(15,2) NOT NULL,    -- processor reported balance
  drift_amount NUMERIC(15,2) NOT NULL,
  drift_percent NUMERIC(8,4) NOT NULL,

  -- Severity
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),

  -- Resolution
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolution_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drift_alerts_ledger ON drift_alerts(ledger_id, created_at DESC);
CREATE INDEX idx_drift_alerts_severity ON drift_alerts(severity) WHERE acknowledged_at IS NULL;

-- ============================================================================
-- 3. Index on processor_transactions for reconciliation matching
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_processor_txns_unmatched
  ON processor_transactions(ledger_id, amount, created_at)
  WHERE match_status = 'unmatched';

-- ============================================================================
-- 4. RLS policies for service_role access
-- ============================================================================
ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE drift_alerts ENABLE ROW LEVEL SECURITY;

-- Service role has full access (these are system-managed tables)
CREATE POLICY "service_role_full_access_recon_runs" ON reconciliation_runs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_drift_alerts" ON drift_alerts
  FOR ALL USING (true) WITH CHECK (true);
