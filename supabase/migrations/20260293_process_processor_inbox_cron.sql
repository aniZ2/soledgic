-- ============================================================================
-- Processor Inbox Processing Cron Job
-- Runs frequently to drain processor_webhook_inbox into normalized events.
--
-- This invokes the `process-processor-inbox` edge function using the service role key.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Run every minute.
SELECT cron.schedule(
  'process-processor-inbox-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-processor-inbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

