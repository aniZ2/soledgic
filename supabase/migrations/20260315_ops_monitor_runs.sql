-- ============================================================================
-- Ops Monitor Runs Table + Hourly Cron
-- Structured persistence for ops-monitor results (queryable for trends).
-- Hourly cron invokes the ops-monitor Edge Function via net.http_post.
-- ============================================================================

-- ============================================================================
-- OPS MONITOR RUNS TABLE
-- ============================================================================
CREATE TABLE ops_monitor_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at           timestamptz NOT NULL DEFAULT now(),
  triggered_by     text NOT NULL DEFAULT 'cron',  -- 'cron' | 'manual'
  overall_status   text NOT NULL CHECK (overall_status IN ('ok', 'warning', 'critical')),
  checks           jsonb NOT NULL DEFAULT '[]',
  total_checks     integer NOT NULL DEFAULT 0,
  ok_checks        integer NOT NULL DEFAULT 0,
  warning_checks   integer NOT NULL DEFAULT 0,
  critical_checks  integer NOT NULL DEFAULT 0,
  alert_sent       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Time-series queries (most recent first)
CREATE INDEX idx_ops_monitor_runs_run_at ON ops_monitor_runs (run_at DESC);

-- Quick lookup for non-ok runs
CREATE INDEX idx_ops_monitor_runs_status ON ops_monitor_runs (overall_status, run_at DESC)
  WHERE overall_status IN ('warning', 'critical');

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE ops_monitor_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role ops_monitor_runs" ON ops_monitor_runs
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- HOURLY CRON: ops-monitor via Edge Function
-- ============================================================================
SELECT cron.schedule(
  'ops-monitor-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/ops-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

COMMENT ON TABLE ops_monitor_runs IS 'Structured persistence for ops-monitor check results (hourly cron + manual)';
