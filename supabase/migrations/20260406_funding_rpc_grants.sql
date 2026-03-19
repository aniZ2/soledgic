-- Lock down record_funding_atomic grants (separate file for CLI compatibility)
REVOKE ALL ON FUNCTION public.record_funding_atomic(uuid, text, text, bigint, bigint, jsonb) FROM anon, authenticated;
