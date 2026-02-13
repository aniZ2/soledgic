-- ============================================================================
-- Processor-Based Overage Billing (Monthly)
--
-- Creates an idempotent charge record for monthly overage billing:
-- - Additional ledgers: organizations.current_live_ledger_count - max_ledgers
-- - Additional team members: organizations.current_member_count - max_team_members
--
-- The edge function `bill-overages` claims a charge row (atomic) and then
-- executes the processor transfer. This prevents double-charging on retries.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.billing_overage_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Billing cycle (UTC month boundaries)
  period_start date NOT NULL,
  period_end date NOT NULL,

  currency text NOT NULL DEFAULT 'usd',

  -- Snapshot used to compute the charge (auditability)
  included_ledgers integer NOT NULL DEFAULT 1,
  included_team_members integer NOT NULL DEFAULT 1,
  current_ledger_count integer NOT NULL DEFAULT 0,
  current_member_count integer NOT NULL DEFAULT 0,
  additional_ledgers integer NOT NULL DEFAULT 0,
  additional_team_members integer NOT NULL DEFAULT 0,
  overage_ledger_price integer NOT NULL DEFAULT 2000,
  overage_team_member_price integer NOT NULL DEFAULT 2000,

  amount_cents integer NOT NULL CHECK (amount_cents >= 0),

  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,

  processor_payment_id text,
  error text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_billing_overage_charges_org_period
  ON public.billing_overage_charges(organization_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_billing_overage_charges_status
  ON public.billing_overage_charges(status);

ALTER TABLE public.billing_overage_charges ENABLE ROW LEVEL SECURITY;

-- Service role can manage all rows.
CREATE POLICY "Service role billing overage charges"
  ON public.billing_overage_charges
  FOR ALL
  USING (auth.role() = 'service_role');

-- Only org owners/admins can view billing charges.
CREATE POLICY "Org owners view billing overage charges"
  ON public.billing_overage_charges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = billing_overage_charges.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

-- Atomic "claim" function:
-- 1) Creates the cycle row if missing.
-- 2) Transitions queued/failed -> processing and increments attempts.
-- Returns the claimed row as JSON, or NULL if already in-progress/succeeded.
CREATE OR REPLACE FUNCTION public.claim_overage_billing_charge(
  p_organization_id uuid,
  p_period_start date,
  p_period_end date,
  p_amount_cents integer,
  p_currency text DEFAULT 'usd',
  p_included_ledgers integer DEFAULT 1,
  p_included_team_members integer DEFAULT 1,
  p_current_ledger_count integer DEFAULT 0,
  p_current_member_count integer DEFAULT 0,
  p_additional_ledgers integer DEFAULT 0,
  p_additional_team_members integer DEFAULT 0,
  p_overage_ledger_price integer DEFAULT 2000,
  p_overage_team_member_price integer DEFAULT 2000
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row public.billing_overage_charges%rowtype;
BEGIN
  INSERT INTO public.billing_overage_charges (
    organization_id,
    period_start,
    period_end,
    currency,
    included_ledgers,
    included_team_members,
    current_ledger_count,
    current_member_count,
    additional_ledgers,
    additional_team_members,
    overage_ledger_price,
    overage_team_member_price,
    amount_cents,
    status,
    updated_at
  ) VALUES (
    p_organization_id,
    p_period_start,
    p_period_end,
    COALESCE(NULLIF(p_currency, ''), 'usd'),
    p_included_ledgers,
    p_included_team_members,
    p_current_ledger_count,
    p_current_member_count,
    p_additional_ledgers,
    p_additional_team_members,
    p_overage_ledger_price,
    p_overage_team_member_price,
    p_amount_cents,
    'queued',
    now()
  )
  ON CONFLICT (organization_id, period_start) DO UPDATE
    SET
      period_end = EXCLUDED.period_end,
      currency = EXCLUDED.currency,
      included_ledgers = EXCLUDED.included_ledgers,
      included_team_members = EXCLUDED.included_team_members,
      current_ledger_count = EXCLUDED.current_ledger_count,
      current_member_count = EXCLUDED.current_member_count,
      additional_ledgers = EXCLUDED.additional_ledgers,
      additional_team_members = EXCLUDED.additional_team_members,
      overage_ledger_price = EXCLUDED.overage_ledger_price,
      overage_team_member_price = EXCLUDED.overage_team_member_price,
      amount_cents = EXCLUDED.amount_cents,
      updated_at = now()
    WHERE public.billing_overage_charges.status IN ('queued', 'failed');

  UPDATE public.billing_overage_charges
  SET
    status = 'processing',
    attempts = attempts + 1,
    last_attempt_at = now(),
    error = NULL,
    updated_at = now()
  WHERE organization_id = p_organization_id
    AND period_start = p_period_start
    AND status IN ('queued', 'failed')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_overage_billing_charge(
  uuid,
  date,
  date,
  integer,
  text,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) TO service_role;

