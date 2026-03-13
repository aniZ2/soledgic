CREATE OR REPLACE FUNCTION public.rotate_webhook_secret(p_endpoint_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_new_secret TEXT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.webhook_endpoints we ON we.ledger_id = l.id
      WHERE we.id = p_endpoint_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  v_new_secret := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.webhook_endpoints
  SET previous_secret = secret,
      secret = v_new_secret,
      secret_rotated_at = NOW()
  WHERE id = p_endpoint_id;

  RETURN v_new_secret;
END;
$function$;
