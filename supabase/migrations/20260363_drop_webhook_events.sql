-- Migration: Drop deprecated webhook_events table
-- Replaced by webhook_deliveries + webhook_endpoints (used by all active code)
-- Only consumer was reset-test-data route (updated to remove reference)

DROP TABLE IF EXISTS public.webhook_events CASCADE;
