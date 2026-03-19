-- Change Soledgic 3.5% fee from "deducted from platform share" to
-- "off the top before split". Soledgic always gets 3.5% of gross
-- regardless of the creator/platform split ratio.
--
-- New math:
--   soledgic_fee = floor(gross * 0.035)
--   net = gross - processing_fee - soledgic_fee
--   creator = floor(net * creator_percent / 100)
--   platform = net - creator

DROP FUNCTION IF EXISTS public.calculate_sale_split(bigint, numeric, bigint);

CREATE OR REPLACE FUNCTION public.calculate_sale_split(
  p_gross_cents bigint,
  p_creator_percent numeric,
  p_processing_fee_cents bigint DEFAULT 0
)
RETURNS TABLE(creator_cents bigint, platform_cents bigint, fee_cents bigint, soledgic_fee_cents bigint)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_soledgic_fee BIGINT;
  v_net_cents BIGINT;
  v_creator_cents BIGINT;
  v_platform_cents BIGINT;
BEGIN
  IF p_creator_percent < 0 OR p_creator_percent > 100 THEN
    RAISE EXCEPTION 'creator_percent must be 0-100, got %', p_creator_percent;
  END IF;

  IF p_processing_fee_cents < 0 THEN
    RAISE EXCEPTION 'processing_fee cannot be negative';
  END IF;

  IF p_processing_fee_cents > p_gross_cents THEN
    RAISE EXCEPTION 'processing_fee (%) cannot exceed gross (%)', p_processing_fee_cents, p_gross_cents;
  END IF;

  -- Soledgic fee: 3.5% of gross, off the top (fixed, never capped)
  v_soledgic_fee := FLOOR(p_gross_cents * 0.035);

  -- Net after processing fee AND soledgic fee
  v_net_cents := p_gross_cents - p_processing_fee_cents - v_soledgic_fee;

  -- Safety: if fees consume everything, net is 0
  IF v_net_cents < 0 THEN
    v_net_cents := 0;
    v_soledgic_fee := p_gross_cents - p_processing_fee_cents;
    IF v_soledgic_fee < 0 THEN v_soledgic_fee := 0; END IF;
  END IF;

  -- Split the net between creator and platform
  v_creator_cents := FLOOR(v_net_cents * p_creator_percent / 100);
  v_platform_cents := v_net_cents - v_creator_cents;

  RETURN QUERY SELECT v_creator_cents, v_platform_cents, p_processing_fee_cents, v_soledgic_fee;
END;
$function$;
