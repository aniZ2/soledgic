CREATE OR REPLACE FUNCTION public.submit_tax_info_atomic(
  p_ledger_id uuid,
  p_entity_id text,
  p_legal_name text,
  p_tax_id_type text,
  p_tax_id_last4 text,
  p_business_type text,
  p_address_line1 text DEFAULT NULL,
  p_address_line2 text DEFAULT NULL,
  p_address_city text DEFAULT NULL,
  p_address_state text DEFAULT NULL,
  p_address_postal_code text DEFAULT NULL,
  p_address_country text DEFAULT 'US',
  p_certified_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission_id uuid;
  v_now timestamptz := now();
BEGIN
  UPDATE tax_info_submissions
  SET status = 'superseded', updated_at = v_now
  WHERE ledger_id = p_ledger_id
    AND entity_id = p_entity_id
    AND status = 'active';

  INSERT INTO tax_info_submissions (
    ledger_id, entity_id, status, legal_name, tax_id_type, tax_id_last4,
    business_type, address_line1, address_line2, address_city,
    address_state, address_postal_code, address_country,
    certified_at, certified_by
  ) VALUES (
    p_ledger_id, p_entity_id, 'active', p_legal_name, p_tax_id_type,
    p_tax_id_last4, p_business_type, p_address_line1, p_address_line2,
    p_address_city, p_address_state, p_address_postal_code,
    p_address_country, v_now, COALESCE(p_certified_by, p_entity_id)
  )
  RETURNING id INTO v_submission_id;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'entity_id', p_entity_id
  );
END;
$$;
