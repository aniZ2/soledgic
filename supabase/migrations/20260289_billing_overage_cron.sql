-- ============================================================================
-- Scheduled Overage Billing Cron Job
-- Runs daily to (a) charge last month's overages once, and (b) retry failures.
--
-- This invokes the `bill-overages` edge function using the service role key.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Run daily at 07:00 AM UTC.
SELECT cron.schedule(
  'billing-overages-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/bill-overages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

