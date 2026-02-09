-- Enable RLS on payout_schedule_runs (internal audit table, service_role only)
ALTER TABLE payout_schedule_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON payout_schedule_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
