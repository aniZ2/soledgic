-- Fix verify_audit_chain search_path (remove space after comma)

CREATE OR REPLACE FUNCTION verify_audit_chain(
  p_start_seq BIGINT DEFAULT 1,
  p_limit INTEGER DEFAULT 10000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rec RECORD;
  v_expected_hash TEXT;
  v_payload TEXT;
  v_prev_hash TEXT := NULL;
  v_count INTEGER := 0;
  v_broken_at BIGINT := NULL;
BEGIN
  FOR v_rec IN
    SELECT seq_num, prev_hash, row_hash, action, entity_id,
           created_at, ledger_id, actor_id, ip_address
    FROM public.audit_log
    WHERE seq_num >= p_start_seq
    ORDER BY seq_num ASC
    LIMIT p_limit
  LOOP
    v_count := v_count + 1;

    -- Determine expected prev_hash
    IF v_prev_hash IS NULL THEN
      -- First record in our window: check if it references GENESIS or the prior record
      IF v_rec.seq_num = 1 THEN
        IF v_rec.prev_hash != 'GENESIS' THEN
          RETURN jsonb_build_object(
            'status', 'broken',
            'broken_at_seq', v_rec.seq_num,
            'reason', 'First record prev_hash is not GENESIS',
            'records_verified', v_count
          );
        END IF;
        v_prev_hash := 'GENESIS';
      ELSE
        -- Starting mid-chain, trust the stored prev_hash for the first record
        v_prev_hash := v_rec.prev_hash;
      END IF;
    ELSE
      -- Verify prev_hash matches what we computed for the previous record
      IF v_rec.prev_hash != v_prev_hash THEN
        RETURN jsonb_build_object(
          'status', 'broken',
          'broken_at_seq', v_rec.seq_num,
          'reason', 'prev_hash mismatch',
          'records_verified', v_count
        );
      END IF;
    END IF;

    -- Recompute hash for current record
    v_payload := v_rec.seq_num::TEXT || '|'
      || COALESCE(v_rec.prev_hash, 'GENESIS') || '|'
      || COALESCE(v_rec.action, '') || '|'
      || COALESCE(v_rec.entity_id::TEXT, '') || '|'
      || COALESCE(v_rec.created_at::TEXT, '') || '|'
      || COALESCE(v_rec.ledger_id::TEXT, '') || '|'
      || COALESCE(v_rec.actor_id, '') || '|'
      || COALESCE(v_rec.ip_address::TEXT, '');

    v_expected_hash := encode(extensions.digest(v_payload::bytea, 'sha256'), 'hex');

    IF v_rec.row_hash != v_expected_hash THEN
      RETURN jsonb_build_object(
        'status', 'broken',
        'broken_at_seq', v_rec.seq_num,
        'reason', 'row_hash mismatch',
        'records_verified', v_count
      );
    END IF;

    -- This record's hash becomes the expected prev_hash for the next record
    v_prev_hash := v_rec.row_hash;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'intact',
    'broken_at_seq', NULL,
    'records_verified', v_count
  );
END;
$$;
