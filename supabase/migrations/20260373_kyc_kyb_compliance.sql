-- KYC/KYB compliance infrastructure
-- Adds verification status to organizations and connected_accounts,
-- creates compliance_documents table for document collection.

-- ============================================================
-- 1. Organizations: add KYC/KYB columns
-- ============================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'pending'
    CHECK (kyc_status IN ('pending', 'under_review', 'approved', 'rejected', 'suspended')),
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason text,
  ADD COLUMN IF NOT EXISTS business_type text
    CHECK (business_type IN ('individual', 'sole_proprietor', 'llc', 'corporation', 'partnership', 'nonprofit')),
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS primary_contact_name text,
  ADD COLUMN IF NOT EXISTS primary_contact_email text,
  ADD COLUMN IF NOT EXISTS primary_contact_phone text,
  ADD COLUMN IF NOT EXISTS business_address jsonb,
  ADD COLUMN IF NOT EXISTS verification_method text DEFAULT 'manual'
    CHECK (verification_method IN ('manual', 'provider')),
  ADD COLUMN IF NOT EXISTS kyc_risk_score smallint DEFAULT 0
    CHECK (kyc_risk_score >= 0 AND kyc_risk_score <= 100),
  ADD COLUMN IF NOT EXISTS kyc_flags text[] DEFAULT '{}';

COMMENT ON COLUMN public.organizations.kyc_status IS 'KYB verification status for the organization';
COMMENT ON COLUMN public.organizations.business_type IS 'Legal entity type for compliance';
COMMENT ON COLUMN public.organizations.business_address IS 'Registered business address as JSON {line1, line2, city, state, zip, country}';
COMMENT ON COLUMN public.organizations.verification_method IS 'How KYC was verified: manual (admin review) or provider (Stripe Identity, Persona, etc.)';
COMMENT ON COLUMN public.organizations.kyc_risk_score IS 'Risk score 0-100, set during review (0 = low risk, 100 = high risk)';
COMMENT ON COLUMN public.organizations.kyc_flags IS 'Array of risk flags: address_mismatch, suspicious_domain, high_volume, etc.';

-- No backfill: existing orgs start as 'pending' and must complete KYB.

-- Index for admin compliance dashboard queries
CREATE INDEX IF NOT EXISTS idx_organizations_kyc_status
  ON public.organizations (kyc_status)
  WHERE kyc_status != 'approved';

-- ============================================================
-- 2. Connected accounts: add creator-level KYC status
-- ============================================================
ALTER TABLE public.connected_accounts
  ADD COLUMN IF NOT EXISTS kyc_status text DEFAULT 'pending'
    CHECK (kyc_status IN ('pending', 'under_review', 'approved', 'rejected', 'suspended'));

COMMENT ON COLUMN public.connected_accounts.kyc_status IS 'Creator-level KYC verification status';

-- No backfill: existing creators start as 'pending' and must complete KYC.

CREATE INDEX IF NOT EXISTS idx_connected_accounts_kyc_status
  ON public.connected_accounts (kyc_status)
  WHERE kyc_status != 'approved';

-- ============================================================
-- 3. Compliance documents table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.compliance_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_type text NOT NULL
    CHECK (document_type IN ('ein_letter', 'articles_of_incorporation', 'government_id', 'proof_of_address', 'w9', 'other')),
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint,
  mime_type text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text,
  uploaded_by uuid NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.compliance_documents IS 'KYC/KYB document uploads for organization verification';

CREATE INDEX IF NOT EXISTS idx_compliance_documents_org
  ON public.compliance_documents (organization_id);

CREATE INDEX IF NOT EXISTS idx_compliance_documents_status
  ON public.compliance_documents (status)
  WHERE status = 'pending';

-- RLS policies
ALTER TABLE public.compliance_documents ENABLE ROW LEVEL SECURITY;

-- Org members can view their own org's documents
CREATE POLICY compliance_documents_select_own ON public.compliance_documents
  FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

-- Org members can insert documents for their own org
CREATE POLICY compliance_documents_insert_own ON public.compliance_documents
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
    AND uploaded_by = auth.uid()
  );

-- Only service_role can update/delete (admin review flow)
CREATE POLICY compliance_documents_service_all ON public.compliance_documents
  FOR ALL
  USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_compliance_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_compliance_documents_updated_at
  BEFORE UPDATE ON public.compliance_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_compliance_documents_updated_at();
