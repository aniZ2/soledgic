-- Rebind the audit log trigger to the fully-qualified sequence name.
-- Some environments compiled the trigger function while the sequence was
-- absent, leaving inserts to fail even after the sequence was recreated.

CREATE OR REPLACE FUNCTION public.trg_audit_log_chain_hash_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_prev_hash TEXT;
  v_payload TEXT;
BEGIN
  -- Assign monotonic sequence number from the public sequence explicitly.
  NEW.seq_num := nextval('public.audit_log_seq_num_seq'::regclass);

  -- Fetch previous record's hash
  SELECT row_hash INTO v_prev_hash
  FROM audit_log
  WHERE seq_num = NEW.seq_num - 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := 'GENESIS';
  END IF;

  NEW.prev_hash := v_prev_hash;

  -- Build canonical payload for hashing
  v_payload := NEW.seq_num::TEXT || '|'
    || NEW.prev_hash || '|'
    || COALESCE(NEW.action, '') || '|'
    || COALESCE(NEW.entity_id::TEXT, '') || '|'
    || COALESCE(NEW.created_at::TEXT, '') || '|'
    || COALESCE(NEW.ledger_id::TEXT, '') || '|'
    || COALESCE(NEW.actor_id, '') || '|'
    || COALESCE(NEW.ip_address::TEXT, '');

  -- Compute SHA-256 hash
  NEW.row_hash := encode(extensions.digest(v_payload::bytea, 'sha256'), 'hex');

  RETURN NEW;
END;
$function$;
