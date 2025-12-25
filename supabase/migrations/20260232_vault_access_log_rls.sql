-- ============================================================================
-- FIX: Add RLS policy for vault_access_log table
-- This table logs access to vault secrets and should only be accessible
-- by service_role for security auditing
-- ============================================================================

-- Policy: Only service_role can read vault access logs
CREATE POLICY "Service role read access" ON public.vault_access_log
  FOR SELECT
  TO service_role
  USING (true);

-- Policy: Only service_role can insert vault access logs
CREATE POLICY "Service role insert access" ON public.vault_access_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- No update or delete allowed - audit logs should be immutable
-- (RLS will block these operations for all roles)

SELECT 'vault_access_log RLS policies applied' AS status;
