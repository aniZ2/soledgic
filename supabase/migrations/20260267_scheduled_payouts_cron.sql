-- ============================================================================
-- Scheduled Payouts Cron Job
-- Runs daily to check for and process scheduled payouts
-- ============================================================================

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the payouts job to run daily at 6:00 AM UTC
-- This invokes the scheduled-payouts edge function
SELECT cron.schedule(
  'scheduled-payouts-daily',
  '0 6 * * *',  -- Every day at 6:00 AM UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-payouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Create a table to track payout schedule runs for auditing
CREATE TABLE IF NOT EXISTS payout_schedule_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT CHECK (status IN ('success', 'failed', 'partial')),
  processed_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payout_schedule_runs_date ON payout_schedule_runs(run_at DESC);

-- Grant permissions
GRANT SELECT, INSERT ON payout_schedule_runs TO service_role;

-- Add payout settings to ledger metadata schema comment
COMMENT ON COLUMN ledgers.metadata IS
  'Contains settings including payout_settings: { schedule: manual|weekly|biweekly|monthly, day_of_week: 0-6, day_of_month: 1-28, minimum_amount: cents }';
