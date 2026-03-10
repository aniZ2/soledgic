-- Drop the OLD record_refund_atomic_v2 overload (8 params, no p_entry_method).
DROP FUNCTION IF EXISTS public.record_refund_atomic_v2(
  UUID, TEXT, UUID, BIGINT, TEXT, TEXT, TEXT, JSONB
)
