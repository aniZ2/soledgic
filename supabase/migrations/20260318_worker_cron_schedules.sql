-- ============================================================================
-- Cron Schedules for Unscheduled Workers
-- Adds pg_cron entries for three Edge Functions that were designed for
-- scheduled execution but had no cron job:
--   1. reconcile-checkout-ledger  — every 5 minutes
--   2. process-webhooks           — every minute
--   3. security-alerts            — every 15 minutes
--
-- PREREQUISITE (out-of-band):
--   The process-webhooks and security-alerts functions authenticate via
--   x-cron-secret, which reads current_setting('app.settings.cron_secret').
--   You MUST set this before applying this migration:
--
--     ALTER DATABASE postgres SET app.settings.cron_secret = '<your-secret>';
--
--   Do NOT commit the real secret to version control.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- 1. reconcile-checkout-ledger — every 5 minutes
--    Auth: Bearer service_role_key (same pattern as process-processor-inbox)
-- ============================================================================
SELECT cron.schedule(
  'reconcile-checkout-ledger-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/reconcile-checkout-ledger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================================
-- 2. process-webhooks — every minute
--    Auth: x-cron-secret header (constant-time comparison in Edge Function)
-- ============================================================================
SELECT cron.schedule(
  'process-webhooks-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-webhooks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================================
-- 3. security-alerts — every 15 minutes
--    Auth: x-cron-secret header (same pattern as process-webhooks)
-- ============================================================================
SELECT cron.schedule(
  'security-alerts-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/security-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
