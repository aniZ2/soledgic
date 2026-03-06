-- Migration: ops-monitor system views
-- Adds two secure (definer-context) functions for ops-monitor checks:
--   1. get_lock_wait_count() — active queries waiting on locks
--   2. get_deadlock_count() — cumulative deadlock counter from pg_stat_database

-- 1. Lock wait count: queries currently blocked on a lock
CREATE OR REPLACE FUNCTION public.get_lock_wait_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT count(*)
  FROM pg_catalog.pg_stat_activity
  WHERE wait_event_type = 'Lock'
    AND state = 'active';
$$;

-- 2. Cumulative deadlock count (since last stats reset)
CREATE OR REPLACE FUNCTION public.get_deadlock_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT coalesce(sum(deadlocks), 0)
  FROM pg_catalog.pg_stat_database;
$$;

-- Permissions: service_role only
REVOKE ALL ON FUNCTION public.get_lock_wait_count() FROM public;
REVOKE ALL ON FUNCTION public.get_lock_wait_count() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_lock_wait_count() TO service_role;

REVOKE ALL ON FUNCTION public.get_deadlock_count() FROM public;
REVOKE ALL ON FUNCTION public.get_deadlock_count() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_deadlock_count() TO service_role;
