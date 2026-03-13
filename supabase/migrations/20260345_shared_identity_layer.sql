-- Shared identity layer for a unified Osifo ecosystem account
-- Keeps identity global while preserving ledger-scoped economic state

-- Allow authenticated users to create their own user profile row if one does not exist yet.
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.participant_identity_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  participant_id text NOT NULL,
  user_id uuid NOT NULL,
  membership_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  link_source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'active',
  is_primary boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT participant_identity_links_status_valid
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT participant_identity_links_source_valid
    CHECK (link_source IN ('manual', 'email_match', 'provisioned', 'imported'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_participant_identity_link
  ON public.participant_identity_links (ledger_id, participant_id);

CREATE INDEX IF NOT EXISTS idx_participant_identity_links_user
  ON public.participant_identity_links (user_id, status, linked_at DESC);

CREATE INDEX IF NOT EXISTS idx_participant_identity_links_ledger
  ON public.participant_identity_links (ledger_id, status);

CREATE TABLE IF NOT EXISTS public.shared_tax_profiles (
  user_id uuid NOT NULL PRIMARY KEY,
  status text NOT NULL DEFAULT 'active',
  legal_name text,
  tax_id_type text,
  tax_id_last4 text,
  business_type text,
  address_line1 text,
  address_line2 text,
  address_city text,
  address_state text,
  address_postal_code text,
  address_country text DEFAULT 'US',
  certified_at timestamptz,
  certified_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_tax_profiles_status_valid
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT shared_tax_profiles_tax_id_type_valid
    CHECK (tax_id_type IS NULL OR tax_id_type IN ('ssn', 'ein', 'itin')),
  CONSTRAINT shared_tax_profiles_business_type_valid
    CHECK (business_type IS NULL OR business_type IN ('individual', 'sole_proprietor', 'llc', 'corporation', 'partnership')),
  CONSTRAINT shared_tax_profiles_tax_id_last4_format
    CHECK (tax_id_last4 IS NULL OR tax_id_last4 ~ '^\d{4}$')
);

CREATE TABLE IF NOT EXISTS public.shared_payout_profiles (
  user_id uuid NOT NULL PRIMARY KEY,
  status text NOT NULL DEFAULT 'active',
  default_method text NOT NULL DEFAULT 'manual',
  schedule text NOT NULL DEFAULT 'manual',
  minimum_amount integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  country text DEFAULT 'US',
  payouts_enabled boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_payout_profiles_status_valid
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT shared_payout_profiles_default_method_valid
    CHECK (default_method IN ('manual', 'card', 'bank')),
  CONSTRAINT shared_payout_profiles_schedule_valid
    CHECK (schedule IN ('manual', 'weekly', 'biweekly', 'monthly')),
  CONSTRAINT shared_payout_profiles_minimum_amount_nonnegative
    CHECK (minimum_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_shared_payout_profiles_status
  ON public.shared_payout_profiles (status);

ALTER TABLE public.participant_identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_payout_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY participant_identity_links_service_all
  ON public.participant_identity_links AS PERMISSIVE
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY participant_identity_links_self_select
  ON public.participant_identity_links AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY participant_identity_links_org_admin_select
  ON public.participant_identity_links AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id
      FROM public.ledgers l
      JOIN public.organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY participant_identity_links_org_admin_insert
  ON public.participant_identity_links AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    ledger_id IN (
      SELECT l.id
      FROM public.ledgers l
      JOIN public.organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY participant_identity_links_org_admin_update
  ON public.participant_identity_links AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id
      FROM public.ledgers l
      JOIN public.organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY shared_tax_profiles_service_all
  ON public.shared_tax_profiles AS PERMISSIVE
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY shared_tax_profiles_self_select
  ON public.shared_tax_profiles AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY shared_tax_profiles_self_insert
  ON public.shared_tax_profiles AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY shared_tax_profiles_self_update
  ON public.shared_tax_profiles AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY shared_payout_profiles_service_all
  ON public.shared_payout_profiles AS PERMISSIVE
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY shared_payout_profiles_self_select
  ON public.shared_payout_profiles AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY shared_payout_profiles_self_insert
  ON public.shared_payout_profiles AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY shared_payout_profiles_self_update
  ON public.shared_payout_profiles AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trigger_participant_identity_links_updated
  BEFORE UPDATE ON public.participant_identity_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_shared_tax_profiles_updated
  BEFORE UPDATE ON public.shared_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_shared_payout_profiles_updated
  BEFORE UPDATE ON public.shared_payout_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
