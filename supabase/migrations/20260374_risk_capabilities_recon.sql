-- Risk engine, capabilities, and processor reconciliation infrastructure.
-- Adds behavioral risk tracking, granular org capabilities,
-- and Soledgic-vs-Stripe reconciliation tooling.

-- ============================================================
-- 0. Atomic capability merge (avoids read-modify-write races)
-- ============================================================
CREATE OR REPLACE FUNCTION public.jsonb_merge_capabilities(
  p_org_id uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.organizations
  SET capabilities = COALESCE(capabilities, '{}'::jsonb) || p_patch
  WHERE id = p_org_id;
END;
$$;

COMMENT ON FUNCTION public.jsonb_merge_capabilities IS 'Atomically merge capability overrides into an org (right-side wins on conflict)';

-- ============================================================
-- 1. Organization capabilities (granular permission controls)
-- ============================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.capabilities IS 'Granular permission overrides: can_go_live, can_payout, max_daily_payout_cents, max_single_payout_cents, payout_delay_hours, requires_payout_review, max_daily_volume_cents';

-- Default capabilities (applied in application when field is missing):
-- {
--   "can_go_live": true,           -- controlled by kyc_status gates
--   "can_payout": true,            -- can process payouts
--   "max_daily_payout_cents": -1,  -- -1 = unlimited
--   "max_single_payout_cents": -1, -- -1 = unlimited
--   "payout_delay_hours": 0,       -- 0 = instant (after processing)
--   "requires_payout_review": false,-- manual admin review before payout
--   "max_daily_volume_cents": -1   -- -1 = unlimited daily transaction volume
-- }

-- ============================================================
-- 2. Risk signals table (behavioral event stream)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.risk_signals (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  signal_type text NOT NULL
    CHECK (signal_type IN (
      'velocity_spike',         -- unusual transaction volume
      'refund_abuse',           -- high refund rate
      'rapid_topup_withdraw',   -- topup then immediate withdrawal
      'large_single_txn',       -- single transaction exceeds threshold
      'failed_auth_burst',      -- many failed auth attempts
      'payout_velocity',        -- high payout frequency
      'chargeback',             -- processor-reported chargeback
      'duplicate_identity',     -- multiple accounts, same identity signals
      'geo_anomaly',            -- unexpected country/IP
      'custom'                  -- admin-assigned signal
    )),
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  entity_type text,  -- 'organization', 'creator', 'wallet'
  entity_id text,    -- the specific entity
  description text,
  details jsonb DEFAULT '{}'::jsonb,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.risk_signals IS 'Behavioral risk events for fraud detection and compliance monitoring';

CREATE INDEX IF NOT EXISTS idx_risk_signals_org
  ON public.risk_signals (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_signals_ledger_unresolved
  ON public.risk_signals (ledger_id)
  WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_risk_signals_severity
  ON public.risk_signals (severity)
  WHERE resolved = false;

ALTER TABLE public.risk_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY risk_signals_service_all ON public.risk_signals
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 3. Processor reconciliation reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.processor_reconciliation_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  -- Counts
  ledger_count integer NOT NULL DEFAULT 0,
  processor_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  ledger_only_count integer NOT NULL DEFAULT 0,   -- in ledger, missing from processor
  processor_only_count integer NOT NULL DEFAULT 0, -- in processor, missing from ledger
  amount_mismatch_count integer NOT NULL DEFAULT 0,
  -- Totals
  ledger_total_cents bigint NOT NULL DEFAULT 0,
  processor_total_cents bigint NOT NULL DEFAULT 0,
  discrepancy_cents bigint NOT NULL DEFAULT 0,
  -- Result
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running', 'completed', 'failed')),
  error text,
  details jsonb DEFAULT '{}'::jsonb,  -- full mismatch breakdown
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

COMMENT ON TABLE public.processor_reconciliation_runs IS 'Results of Soledgic ledger vs Stripe processor reconciliation runs';

CREATE INDEX IF NOT EXISTS idx_processor_recon_ledger
  ON public.processor_reconciliation_runs (ledger_id, created_at DESC);

ALTER TABLE public.processor_reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY processor_recon_service_all ON public.processor_reconciliation_runs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 4. Aggregate risk score view (per-org, rolling 30 days)
-- ============================================================
CREATE OR REPLACE VIEW public.org_risk_summary AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.kyc_status,
  o.kyc_risk_score,
  o.kyc_flags,
  COALESCE(rs.open_signals, 0) AS open_risk_signals,
  COALESCE(rs.critical_signals, 0) AS critical_signals,
  COALESCE(rs.high_signals, 0) AS high_signals,
  COALESCE(al.high_risk_actions_30d, 0) AS high_risk_actions_30d,
  COALESCE(al.failed_auths_30d, 0) AS failed_auths_30d,
  -- Composite behavioral score: weighted sum of signals
  LEAST(100, COALESCE(o.kyc_risk_score, 0)
    + COALESCE(rs.critical_signals, 0) * 25
    + COALESCE(rs.high_signals, 0) * 10
    + COALESCE(rs.open_signals, 0) * 3
    + COALESCE(al.high_risk_actions_30d, 0) * 2
    + COALESCE(al.failed_auths_30d, 0)
  ) AS composite_risk_score
FROM public.organizations o
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE NOT resolved) AS open_signals,
    count(*) FILTER (WHERE NOT resolved AND severity = 'critical') AS critical_signals,
    count(*) FILTER (WHERE NOT resolved AND severity = 'high') AS high_signals
  FROM public.risk_signals r
  WHERE r.organization_id = o.id
) rs ON true
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE risk_score >= 70) AS high_risk_actions_30d,
    count(*) FILTER (WHERE action = 'auth_failed') AS failed_auths_30d
  FROM public.audit_log al_inner
  WHERE al_inner.created_at > now() - interval '30 days'
    -- audit_log scoped by ledger; join through org's ledgers
    AND al_inner.ledger_id IN (
      SELECT id FROM public.ledgers WHERE organization_id = o.id
    )
) al ON true;

COMMENT ON VIEW public.org_risk_summary IS 'Aggregated risk view per organization: composite score from KYC, behavioral signals, and audit events';
