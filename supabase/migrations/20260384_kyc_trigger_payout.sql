-- DB-level KYC gate on payout transactions (defense in depth).
-- The service layer checks KYC in TypeScript, but this trigger
-- catches direct RPC calls that bypass the edge function.

CREATE OR REPLACE FUNCTION public.check_creator_kyc_for_payout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_livemode boolean;
  v_kyc_status text;
BEGIN
  SELECT l.livemode INTO v_ledger_livemode
  FROM ledgers l WHERE l.id = NEW.ledger_id;

  IF v_ledger_livemode IS TRUE AND NEW.transaction_type = 'payout' THEN
    SELECT ca.kyc_status INTO v_kyc_status
    FROM connected_accounts ca
    WHERE ca.ledger_id = NEW.ledger_id
      AND ca.entity_id = (NEW.metadata->>'creator_id')
      AND ca.is_active = true;

    IF v_kyc_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'Creator KYC not approved — live-mode payouts blocked (status: %)', COALESCE(v_kyc_status, 'none');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
