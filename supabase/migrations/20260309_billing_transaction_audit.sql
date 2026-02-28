-- Add transaction audit columns to billing_overage_charges so the charge
-- amount can be fully reconstructed from the stored snapshot.

ALTER TABLE public.billing_overage_charges
  ADD COLUMN IF NOT EXISTS included_transactions integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS current_transaction_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_transactions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_transaction_price integer NOT NULL DEFAULT 2;

-- Drop the old 13-arg overload so callers can't accidentally use it
-- and so the explicit GRANT below covers the only remaining version.
DROP FUNCTION IF EXISTS public.claim_overage_billing_charge(
  uuid, date, date, integer, text,
  integer, integer, integer, integer,
  integer, integer, integer, integer
);

-- Recreate claim function with transaction parameters
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
  p_overage_team_member_price integer DEFAULT 2000,
  p_included_transactions integer DEFAULT 1000,
  p_current_transaction_count integer DEFAULT 0,
  p_additional_transactions integer DEFAULT 0,
  p_overage_transaction_price integer DEFAULT 2
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
    included_transactions,
    current_transaction_count,
    additional_transactions,
    overage_transaction_price,
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
    p_included_transactions,
    p_current_transaction_count,
    p_additional_transactions,
    p_overage_transaction_price,
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
      included_transactions = EXCLUDED.included_transactions,
      current_transaction_count = EXCLUDED.current_transaction_count,
      additional_transactions = EXCLUDED.additional_transactions,
      overage_transaction_price = EXCLUDED.overage_transaction_price,
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

-- Explicit grant for the new 17-arg overload (matches the pattern from 20260288).
GRANT EXECUTE ON FUNCTION public.claim_overage_billing_charge(
  uuid, date, date, integer, text,
  integer, integer, integer, integer,
  integer, integer, integer, integer,
  integer, integer, integer, integer
) TO service_role;
