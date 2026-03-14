-- =============================================================================
-- 20260355: Tighten RPC grants — restrict sensitive functions to service_role
-- =============================================================================
-- Several RPCs recreated in recent migrations inherited overly broad grants
-- from the baseline (anon + authenticated + service_role). Financial RPCs
-- should only be callable by service_role.

-- record_refund_atomic_v2 — recreated in 20260352 without REVOKE/GRANT
REVOKE ALL ON FUNCTION public.record_refund_atomic_v2(uuid, text, uuid, bigint, text, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_refund_atomic_v2(uuid, text, uuid, bigint, text, text, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_refund_atomic_v2(uuid, text, uuid, bigint, text, text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic_v2(uuid, text, uuid, bigint, text, text, text, jsonb, text) TO service_role;

-- generate_1099_documents — recreated in 20260353 without REVOKE/GRANT
REVOKE ALL ON FUNCTION public.generate_1099_documents(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_1099_documents(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.generate_1099_documents(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_1099_documents(uuid, integer) TO service_role;

-- apply_withholding_to_sale — recreated in 20260353 without REVOKE/GRANT
REVOKE ALL ON FUNCTION public.apply_withholding_to_sale(uuid, uuid, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_withholding_to_sale(uuid, uuid, text, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_withholding_to_sale(uuid, uuid, text, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_withholding_to_sale(uuid, uuid, text, numeric, text) TO service_role;
