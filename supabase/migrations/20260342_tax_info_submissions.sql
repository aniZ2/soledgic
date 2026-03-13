-- Tax Info Submissions: W-9 style tax identity collection for creators
-- Stores only last 4 digits of TIN — full SSN/EIN/ITIN is NEVER stored

CREATE TABLE IF NOT EXISTS public.tax_info_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  entity_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',

  -- W-9 fields (no full TIN)
  legal_name text NOT NULL,
  tax_id_type text NOT NULL,
  tax_id_last4 text NOT NULL,
  business_type text NOT NULL,

  -- Address
  address_line1 text,
  address_line2 text,
  address_city text,
  address_state text,
  address_postal_code text,
  address_country text DEFAULT 'US',

  -- Certification
  certified_at timestamptz,
  certified_by text,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Constraints
  CONSTRAINT tax_id_last4_format CHECK (tax_id_last4 ~ '^\d{4}$'),
  CONSTRAINT tax_id_type_valid CHECK (tax_id_type IN ('ssn', 'ein', 'itin')),
  CONSTRAINT business_type_valid CHECK (business_type IN ('individual', 'sole_proprietor', 'llc', 'corporation', 'partnership')),
  CONSTRAINT status_valid CHECK (status IN ('active', 'superseded', 'revoked'))
);

-- Only one active submission per creator per ledger
CREATE UNIQUE INDEX uq_tax_info_active
  ON public.tax_info_submissions (ledger_id, entity_id)
  WHERE status = 'active';

CREATE INDEX idx_tax_info_ledger_entity
  ON public.tax_info_submissions (ledger_id, entity_id, status);

-- RLS
ALTER TABLE public.tax_info_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_info_service_all
  ON public.tax_info_submissions AS PERMISSIVE
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Ledger isolation"
  ON public.tax_info_submissions AS PERMISSIVE
  FOR ALL TO public
  USING (ledger_id = (current_setting('app.current_ledger_id', true))::uuid);

CREATE POLICY tax_info_dashboard_select
  ON public.tax_info_submissions AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (ledger_id IN (
    SELECT l.id FROM ledgers l
    JOIN organization_members om ON om.organization_id = l.organization_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
  ));

CREATE POLICY tax_info_dashboard_insert
  ON public.tax_info_submissions AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (ledger_id IN (
    SELECT l.id FROM ledgers l
    JOIN organization_members om ON om.organization_id = l.organization_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
  ));

CREATE POLICY tax_info_dashboard_update
  ON public.tax_info_submissions AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (ledger_id IN (
    SELECT l.id FROM ledgers l
    JOIN organization_members om ON om.organization_id = l.organization_id
    WHERE om.user_id = auth.uid() AND om.status = 'active'
  ));
