-- Drop the OLD record_sale_atomic overload (10 params, no p_entry_method).
-- CREATE OR REPLACE with a new parameter created a second overload instead of
-- replacing the original, causing "function is not unique" errors at call sites.
DROP FUNCTION IF EXISTS public.record_sale_atomic(
  UUID, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, JSONB
)
