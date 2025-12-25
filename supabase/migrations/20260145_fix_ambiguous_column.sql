-- Soledgic: Fix ambiguous column reference in record_sale_atomic
-- Must DROP first since we're changing return type column names

DROP FUNCTION IF EXISTS public.record_sale_atomic(UUID, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, JSONB);
