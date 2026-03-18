-- 1. Dashboard SELECT policy for processor_reconciliation_runs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'processor_recon_dashboard_select') THEN
    CREATE POLICY processor_recon_dashboard_select ON public.processor_reconciliation_runs
      FOR SELECT TO authenticated
      USING (ledger_id IN (
        SELECT l.id FROM ledgers l
        JOIN organization_members om ON om.organization_id = l.organization_id
        WHERE om.user_id = auth.uid() AND om.status = 'active'
      ));
  END IF;
END $$;

-- 2. Idempotency key column on checkout_sessions (for session-mode dedup)
ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkout_sessions_idempotency
  ON public.checkout_sessions (ledger_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
