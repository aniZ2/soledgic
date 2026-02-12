-- Enable RLS on payout_schedule_runs (internal audit table, service_role only)
ALTER TABLE public.payout_schedule_runs ENABLE ROW LEVEL SECURITY;

-- Idempotent: this policy may already exist in some environments.
DROP POLICY IF EXISTS "service_role_full_access" ON public.payout_schedule_runs;

CREATE POLICY "service_role_full_access" ON payout_schedule_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
