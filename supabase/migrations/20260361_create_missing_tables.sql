-- Create tables referenced by application code but never created.
-- Each table was verified as needed by checking actual .from() calls
-- in edge functions and web app code.

BEGIN;

-- ============================================================
-- bank_aggregator_connections: Teller bank link state
-- Used by: bank-aggregator/index.ts (13 refs), sync-bank-feeds, bank-aggregator-webhooks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bank_aggregator_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  item_id text,
  institution_name text,
  institution_id text,
  status text NOT NULL DEFAULT 'active',
  accounts jsonb DEFAULT '[]',
  access_token text DEFAULT '[ENCRYPTED]',
  access_token_vault_id uuid,
  cursor text,
  last_sync_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_agg_conn_ledger ON public.bank_aggregator_connections(ledger_id);

ALTER TABLE public.bank_aggregator_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger isolation" ON public.bank_aggregator_connections
  AS PERMISSIVE FOR ALL TO public
  USING (ledger_id = (current_setting('app.current_ledger_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_aggregator_connections TO service_role;
GRANT SELECT ON public.bank_aggregator_connections TO authenticated;

-- ============================================================
-- bank_aggregator_transactions: Synced bank feed entries
-- Used by: bank-aggregator/index.ts (2 refs), health-check (check 5 original),
--          reconcile/index.ts, reconciliations-service.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bank_aggregator_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.bank_aggregator_connections(id),
  bank_aggregator_transaction_id text,
  bank_aggregator_account_id text,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'USD',
  date date,
  name text,
  merchant_name text,
  category text,
  pending boolean DEFAULT false,
  match_status text NOT NULL DEFAULT 'unmatched',
  matched_transaction_id uuid REFERENCES public.transactions(id),
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_agg_txn_provider_id
  ON public.bank_aggregator_transactions(bank_aggregator_transaction_id)
  WHERE bank_aggregator_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_agg_txn_ledger ON public.bank_aggregator_transactions(ledger_id);
CREATE INDEX IF NOT EXISTS idx_bank_agg_txn_unmatched ON public.bank_aggregator_transactions(ledger_id, match_status)
  WHERE match_status = 'unmatched';

ALTER TABLE public.bank_aggregator_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger isolation" ON public.bank_aggregator_transactions
  AS PERMISSIVE FOR ALL TO public
  USING (ledger_id = (current_setting('app.current_ledger_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_aggregator_transactions TO service_role;
GRANT SELECT ON public.bank_aggregator_transactions TO authenticated;

-- ============================================================
-- bank_matches: Reconciliation junction (bank txn ↔ ledger txn)
-- Used by: reconciliations-service.ts, reconcile/index.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bank_matches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id),
  bank_transaction_id uuid,
  match_type text DEFAULT 'auto',
  confidence numeric(5,2),
  status text NOT NULL DEFAULT 'confirmed',
  matched_at timestamptz DEFAULT now(),
  matched_by text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_matches_txn ON public.bank_matches(ledger_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_bank_matches_ledger ON public.bank_matches(ledger_id);

ALTER TABLE public.bank_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger isolation" ON public.bank_matches
  AS PERMISSIVE FOR ALL TO public
  USING (ledger_id = (current_setting('app.current_ledger_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_matches TO service_role;
GRANT SELECT ON public.bank_matches TO authenticated;

-- ============================================================
-- reconciliation_snapshots: Frozen reconciliation state
-- Used by: reconciliations-service.ts, frozen-statements/index.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reconciliation_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.accounting_periods(id),
  period_start date,
  period_end date,
  snapshot_data jsonb NOT NULL DEFAULT '{}',
  integrity_hash text,
  matched_count integer DEFAULT 0,
  unmatched_count integer DEFAULT 0,
  matched_total numeric(14,2) DEFAULT 0,
  unmatched_total numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recon_snapshots_ledger ON public.reconciliation_snapshots(ledger_id);

ALTER TABLE public.reconciliation_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger isolation" ON public.reconciliation_snapshots
  AS PERMISSIVE FOR ALL TO public
  USING (ledger_id = (current_setting('app.current_ledger_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_snapshots TO service_role;
GRANT SELECT ON public.reconciliation_snapshots TO authenticated;

-- ============================================================
-- frozen_statements: Immutable period-end statements
-- Used by: frozen-statements/index.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.frozen_statements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.accounting_periods(id),
  statement_type text NOT NULL,
  statement_data jsonb NOT NULL DEFAULT '{}',
  integrity_hash text,
  generated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT uq_frozen_statement UNIQUE (ledger_id, period_id, statement_type)
);

CREATE INDEX IF NOT EXISTS idx_frozen_statements_ledger ON public.frozen_statements(ledger_id);

ALTER TABLE public.frozen_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger isolation" ON public.frozen_statements
  AS PERMISSIVE FOR ALL TO public
  USING (ledger_id = (current_setting('app.current_ledger_id', true))::uuid);

GRANT SELECT, INSERT ON public.frozen_statements TO service_role;
GRANT SELECT ON public.frozen_statements TO authenticated;

-- ============================================================
-- authorization_decisions: Preflight auth decision cache
-- Used by: preflight-authorization/index.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.authorization_decisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  decision text NOT NULL,
  violated_policies jsonb DEFAULT '[]',
  proposed_transaction jsonb DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT uq_auth_decision_key UNIQUE (ledger_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_auth_decisions_ledger ON public.authorization_decisions(ledger_id);
CREATE INDEX IF NOT EXISTS idx_auth_decisions_expiry ON public.authorization_decisions(expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.authorization_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger isolation" ON public.authorization_decisions
  AS PERMISSIVE FOR ALL TO public
  USING (ledger_id = (current_setting('app.current_ledger_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE ON public.authorization_decisions TO service_role;
GRANT SELECT ON public.authorization_decisions TO authenticated;

-- ============================================================
-- authorization_policies: Preflight auth rules
-- Used by: preflight-authorization/index.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.authorization_policies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  policy_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  severity text DEFAULT 'medium',
  priority integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_policies_ledger ON public.authorization_policies(ledger_id);
CREATE INDEX IF NOT EXISTS idx_auth_policies_active ON public.authorization_policies(ledger_id, is_active)
  WHERE is_active = true;

ALTER TABLE public.authorization_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger isolation" ON public.authorization_policies
  AS PERMISSIVE FOR ALL TO public
  USING (ledger_id = (current_setting('app.current_ledger_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.authorization_policies TO service_role;
GRANT SELECT ON public.authorization_policies TO authenticated;

-- ============================================================
-- processor_events: Normalized processor webhook events
-- Used by: process-processor-inbox/index.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.processor_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  processor_event_id text NOT NULL,
  event_type text,
  livemode boolean DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  raw_data jsonb DEFAULT '{}',
  processed_at timestamptz,
  transaction_id uuid REFERENCES public.transactions(id),
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT uq_processor_event UNIQUE (ledger_id, processor_event_id)
);

CREATE INDEX IF NOT EXISTS idx_processor_events_ledger ON public.processor_events(ledger_id);
CREATE INDEX IF NOT EXISTS idx_processor_events_status ON public.processor_events(status)
  WHERE status = 'pending';

ALTER TABLE public.processor_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger isolation" ON public.processor_events
  AS PERMISSIVE FOR ALL TO public
  USING (ledger_id = (current_setting('app.current_ledger_id', true))::uuid);

GRANT SELECT, INSERT, UPDATE ON public.processor_events TO service_role;
GRANT SELECT ON public.processor_events TO authenticated;

COMMIT;
