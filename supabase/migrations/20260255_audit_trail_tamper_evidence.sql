-- SOC-ready audit trail with tamper evidence
-- Adds chain-hashing, immutability, verification functions, and backfill
-- Requires pgcrypto extension (extensions.digest)

-- ============================================================================
-- ENSURE PGCRYPTO IS AVAILABLE
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- ADD CHAIN-HASH COLUMNS TO audit_log
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS audit_log_seq_num_seq;

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS seq_num BIGINT,
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS row_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_seq_num
  ON audit_log(seq_num)
  WHERE seq_num IS NOT NULL;

-- ============================================================================
-- CHAIN-HASH TRIGGER (BEFORE INSERT)
-- ============================================================================
-- Assigns seq_num, fetches previous record's hash, computes SHA-256 of the
-- canonical representation. Uses SECURITY DEFINER to access pgcrypto in
-- extensions schema.

CREATE OR REPLACE FUNCTION trg_audit_log_chain_hash_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, extensions'
AS $$
DECLARE
  v_prev_hash TEXT;
  v_payload TEXT;
BEGIN
  -- Assign monotonic sequence number
  NEW.seq_num := nextval('audit_log_seq_num_seq');

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
$$;

CREATE TRIGGER trg_audit_log_chain_hash
  BEFORE INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION trg_audit_log_chain_hash_fn();

-- ============================================================================
-- IMMUTABILITY TRIGGER (BEFORE UPDATE OR DELETE)
-- ============================================================================
-- Blocks all modifications to audit_log except by postgres / supabase_admin.

CREATE OR REPLACE FUNCTION trg_audit_log_immutable_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Allow superuser roles for emergency maintenance
  IF current_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_log records are immutable — % blocked for role %',
    TG_OP, current_user
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION trg_audit_log_immutable_fn();

-- ============================================================================
-- VERIFICATION FUNCTION: verify_audit_chain
-- ============================================================================
-- Walks the chain from p_start_seq, recomputes hashes, returns integrity
-- status. Defaults to checking from seq 1 with a limit of 10000 rows.

CREATE OR REPLACE FUNCTION verify_audit_chain(
  p_start_seq BIGINT DEFAULT 1,
  p_limit INTEGER DEFAULT 10000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, extensions'
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
    FROM audit_log
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

-- ============================================================================
-- VERIFICATION FUNCTION: detect_audit_gaps
-- ============================================================================
-- Uses window functions to find gaps in the seq_num sequence.

CREATE OR REPLACE FUNCTION detect_audit_gaps(
  p_start_seq BIGINT DEFAULT 1,
  p_end_seq BIGINT DEFAULT NULL
)
RETURNS TABLE (gap_start BIGINT, gap_end BIGINT, gap_size BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH seq AS (
    SELECT
      a.seq_num,
      LEAD(a.seq_num) OVER (ORDER BY a.seq_num) AS next_seq
    FROM public.audit_log a
    WHERE a.seq_num >= p_start_seq
      AND (p_end_seq IS NULL OR a.seq_num <= p_end_seq)
  )
  SELECT
    s.seq_num + 1 AS gap_start,
    s.next_seq - 1 AS gap_end,
    s.next_seq - s.seq_num - 1 AS gap_size
  FROM seq s
  WHERE s.next_seq IS NOT NULL
    AND s.next_seq - s.seq_num > 1
  ORDER BY s.seq_num;
END;
$$;

-- ============================================================================
-- BACKFILL EXISTING RECORDS
-- ============================================================================
-- Iterates existing audit_log rows ordered by (created_at, id), assigns
-- seq_num and computes chain hashes for all pre-existing records.

DO $$
DECLARE
  v_rec RECORD;
  v_prev_hash TEXT := 'GENESIS';
  v_payload TEXT;
  v_seq BIGINT := 0;
  v_hash TEXT;
BEGIN
  -- Only backfill if there are records without seq_num
  IF NOT EXISTS (SELECT 1 FROM audit_log WHERE seq_num IS NULL LIMIT 1) THEN
    RAISE NOTICE 'No records to backfill — skipping';
    RETURN;
  END IF;

  -- Temporarily disable the chain-hash trigger to avoid conflicts
  ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_chain_hash;
  ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_immutable;

  FOR v_rec IN
    SELECT id, action, entity_id, created_at, ledger_id, actor_id, ip_address
    FROM audit_log
    WHERE seq_num IS NULL
    ORDER BY created_at ASC, id ASC
  LOOP
    v_seq := v_seq + 1;

    v_payload := v_seq::TEXT || '|'
      || v_prev_hash || '|'
      || COALESCE(v_rec.action, '') || '|'
      || COALESCE(v_rec.entity_id::TEXT, '') || '|'
      || COALESCE(v_rec.created_at::TEXT, '') || '|'
      || COALESCE(v_rec.ledger_id::TEXT, '') || '|'
      || COALESCE(v_rec.actor_id, '') || '|'
      || COALESCE(v_rec.ip_address::TEXT, '');

    v_hash := encode(extensions.digest(v_payload::bytea, 'sha256'), 'hex');

    UPDATE audit_log
    SET seq_num = v_seq,
        prev_hash = v_prev_hash,
        row_hash = v_hash
    WHERE id = v_rec.id;

    v_prev_hash := v_hash;
  END LOOP;

  -- Set sequence to continue after the last backfilled value
  IF v_seq > 0 THEN
    PERFORM setval('audit_log_seq_num_seq', v_seq);
    RAISE NOTICE 'Backfilled % audit_log records with chain hashes', v_seq;
  END IF;

  -- Re-enable triggers
  ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_chain_hash;
  ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_immutable;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN audit_log.seq_num IS 'Monotonic sequence number for gap detection';
COMMENT ON COLUMN audit_log.prev_hash IS 'SHA-256 hash of the previous record (or GENESIS for first)';
COMMENT ON COLUMN audit_log.row_hash IS 'SHA-256 hash of this record''s canonical representation';
COMMENT ON FUNCTION verify_audit_chain IS 'Walks the audit chain and verifies hash integrity';
COMMENT ON FUNCTION detect_audit_gaps IS 'Detects gaps in the audit_log seq_num sequence';
COMMENT ON TRIGGER trg_audit_log_chain_hash ON audit_log IS 'Assigns seq_num and computes chain hash on insert';
COMMENT ON TRIGGER trg_audit_log_immutable ON audit_log IS 'Blocks UPDATE/DELETE on audit_log for non-superuser roles';
