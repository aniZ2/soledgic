-- Repair missing audit log sequence used by trg_audit_log_chain_hash_fn.
-- This keeps direct and function-driven audit_log inserts from failing when
-- the sequence was not created in older environments.

CREATE SEQUENCE IF NOT EXISTS public.audit_log_seq_num_seq;

DO $$
DECLARE
  v_next_seq bigint;
BEGIN
  SELECT GREATEST(
    COALESCE((SELECT MAX(seq_num) FROM public.audit_log), 0),
    COALESCE((SELECT MAX(seq_num) FROM public.audit_log_archive), 0)
  ) + 1
  INTO v_next_seq;

  PERFORM setval('public.audit_log_seq_num_seq', v_next_seq, false);
END
$$;
