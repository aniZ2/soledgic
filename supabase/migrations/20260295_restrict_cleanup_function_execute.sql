-- Restrict cleanup_ledger_data RPC execution to service role only.
-- This function performs destructive ledger-wide deletes and should never be
-- callable by anon/authenticated roles.

REVOKE EXECUTE ON FUNCTION public.cleanup_ledger_data(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_ledger_data(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_ledger_data(UUID) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_ledger_data(UUID) TO service_role;
