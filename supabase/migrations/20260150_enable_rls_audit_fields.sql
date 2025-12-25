-- 2. Enable RLS on audit_sensitive_fields table
ALTER TABLE IF EXISTS public.audit_sensitive_fields ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access (admin only table)
DROP POLICY IF EXISTS "Service role only" ON public.audit_sensitive_fields;
CREATE POLICY "Service role only" ON public.audit_sensitive_fields
  FOR ALL TO service_role USING (true);
