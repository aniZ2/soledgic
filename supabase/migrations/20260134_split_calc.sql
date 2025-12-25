-- Soledgic: Split Calculator Function
-- Part 4 of 6

CREATE OR REPLACE FUNCTION public.calculate_sale_split(
  p_gross_cents BIGINT,
  p_creator_percent NUMERIC,
  p_processing_fee_cents BIGINT DEFAULT 0
)
RETURNS TABLE (
  creator_cents BIGINT,
  platform_cents BIGINT,
  fee_cents BIGINT
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
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
  
  v_net_cents := p_gross_cents - p_processing_fee_cents;
  v_creator_cents := FLOOR(v_net_cents * p_creator_percent / 100);
  v_platform_cents := v_net_cents - v_creator_cents;
  
  RETURN QUERY SELECT v_creator_cents, v_platform_cents, p_processing_fee_cents;
END;
$$;
