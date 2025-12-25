-- Soledgic: Drop old record_sale_atomic function
DROP FUNCTION IF EXISTS public.record_sale_atomic(UUID, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, JSONB);
