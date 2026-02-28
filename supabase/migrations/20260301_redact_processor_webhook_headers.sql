-- Redact sensitive header material from previously stored processor webhook inbox rows.
-- Runtime code now blocks these headers for new rows; this migration backfills existing data.

UPDATE public.processor_webhook_inbox
SET headers = COALESCE(
  (
    SELECT jsonb_object_agg(e.key, e.value)
    FROM jsonb_each(public.processor_webhook_inbox.headers) AS e(key, value)
    WHERE lower(e.key) NOT IN (
      'authorization',
      'cookie',
      'set-cookie',
      'x-soledgic-webhook-token',
      'x-webhook-token',
      'x-api-key',
      'forwarded',
      'x-vercel-oidc-token',
      'x-vercel-proxy-signature',
      'x-vercel-proxy-signature-ts',
      'x-vercel-forwarded-for'
    )
      AND lower(e.key) !~ '^x-vercel-sc-'
      AND lower(e.value::text) !~ 'bearer\\s+[a-z0-9._-]+'
      AND lower(e.value::text) !~ '"authorization"\\s*:\\s*"bearer\\s+[^"]+"'
      AND e.value::text !~ 'eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}'
  ),
  '{}'::jsonb
)
WHERE headers IS NOT NULL
  AND jsonb_typeof(headers) = 'object';
