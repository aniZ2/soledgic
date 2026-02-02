-- Restrict test_concurrent_payouts() to superuser only.
-- This function is SECURITY DEFINER and disables/enables triggers,
-- so it must not be callable by authenticated, anon, or service_role.

REVOKE EXECUTE ON FUNCTION test_concurrent_payouts() FROM authenticated, anon, service_role;
