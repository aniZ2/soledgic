-- Audit lifecycle views, archive table, updated retention, and export function
-- Depends on: 20260255_audit_trail_tamper_evidence.sql

-- ============================================================================
-- ARCHIVE TABLE
-- ============================================================================
-- Mirror of audit_log for long-term cold storage

CREATE TABLE IF NOT EXISTS audit_log_archive (LIKE audit_log INCLUDING ALL);

-- Apply the same immutability trigger to the archive table
CREATE TRIGGER trg_audit_log_archive_immutable
  BEFORE UPDATE OR DELETE ON audit_log_archive
  FOR EACH ROW
  EXECUTE FUNCTION trg_audit_log_immutable_fn();

COMMENT ON TABLE audit_log_archive IS 'Archived audit_log records for long-term retention and compliance';

-- ============================================================================
-- DISPUTE LIFECYCLE MATERIALIZED VIEW
-- ============================================================================
-- One row per dispute, showing timeline from open to resolution with
-- embedded held_funds and audit events as JSONB arrays.

CREATE MATERIALIZED VIEW IF NOT EXISTS dispute_lifecycle AS
SELECT
  t_open.stripe_dispute_id,
  t_open.ledger_id,
  t_open.created_at AS opened_at,
  t_resolved.created_at AS resolved_at,
  CASE
    WHEN t_resolved.status = 'reversed' THEN 'lost'
    WHEN t_resolved.status = 'completed' AND t_resolved.transaction_type = 'reversal' THEN 'won'
    WHEN t_resolved.id IS NOT NULL THEN 'resolved'
    ELSE 'open'
  END AS outcome,
  t_open.amount AS disputed_amount,
  t_open.currency,
  -- Embedded held funds for this dispute
  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', hf.id,
        'held_amount', hf.held_amount,
        'released_amount', hf.released_amount,
        'status', hf.status,
        'held_at', hf.held_at,
        'released_at', hf.released_at,
        'hold_reason', hf.hold_reason
      ) ORDER BY hf.held_at)
      FROM held_funds hf
      WHERE hf.transaction_id = t_open.id
    ),
    '[]'::jsonb
  ) AS held_funds_entries,
  -- Embedded audit events for this dispute
  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', al.id,
        'action', al.action,
        'actor_type', al.actor_type,
        'actor_id', al.actor_id,
        'created_at', al.created_at,
        'risk_score', al.risk_score,
        'seq_num', al.seq_num
      ) ORDER BY al.created_at)
      FROM audit_log al
      WHERE al.entity_id = t_open.id
        OR (al.action LIKE '%dispute%'
            AND al.entity_id IN (
              SELECT id FROM transactions
              WHERE stripe_dispute_id = t_open.stripe_dispute_id
            ))
    ),
    '[]'::jsonb
  ) AS audit_events
FROM transactions t_open
LEFT JOIN transactions t_resolved
  ON t_resolved.stripe_dispute_id = t_open.stripe_dispute_id
  AND t_resolved.id != t_open.id
  AND t_resolved.transaction_type IN ('reversal', 'adjustment')
WHERE t_open.stripe_dispute_id IS NOT NULL
  AND t_open.transaction_type = 'sale'
GROUP BY t_open.id, t_open.stripe_dispute_id, t_open.ledger_id,
         t_open.created_at, t_open.amount, t_open.currency,
         t_resolved.id, t_resolved.created_at, t_resolved.status,
         t_resolved.transaction_type
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispute_lifecycle_dispute_id
  ON dispute_lifecycle(stripe_dispute_id);

CREATE OR REPLACE FUNCTION refresh_dispute_lifecycle()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.dispute_lifecycle;
END;
$$;

COMMENT ON MATERIALIZED VIEW dispute_lifecycle IS
  'Per-dispute timeline with embedded held funds and audit trail for SOC compliance';

-- ============================================================================
-- PAYOUT LIFECYCLE MATERIALIZED VIEW
-- ============================================================================
-- One row per payout transaction with embedded audit trail and duplicate
-- attempt metrics.

CREATE MATERIALIZED VIEW IF NOT EXISTS payout_lifecycle AS
SELECT
  t.id AS transaction_id,
  t.ledger_id,
  t.reference_id,
  t.amount AS payout_amount,
  t.currency,
  t.status,
  t.created_at,
  t.metadata,
  -- Embedded audit events for this payout
  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', al.id,
        'action', al.action,
        'actor_type', al.actor_type,
        'actor_id', al.actor_id,
        'created_at', al.created_at,
        'risk_score', al.risk_score,
        'seq_num', al.seq_num
      ) ORDER BY al.created_at)
      FROM audit_log al
      WHERE al.entity_id = t.id
    ),
    '[]'::jsonb
  ) AS audit_events,
  -- Duplicate attempt count from race_condition_events
  COALESCE(
    (
      SELECT COUNT(*)
      FROM race_condition_events rce
      WHERE rce.ledger_id = t.ledger_id
        AND rce.event_type = 'duplicate_deflected'
        AND rce.details->>'reference_id' = t.reference_id
    ),
    0
  ) AS duplicate_attempt_count
FROM transactions t
WHERE t.transaction_type = 'payout'
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_lifecycle_tx_id
  ON payout_lifecycle(transaction_id);

CREATE OR REPLACE FUNCTION refresh_payout_lifecycle()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.payout_lifecycle;
END;
$$;

COMMENT ON MATERIALIZED VIEW payout_lifecycle IS
  'Per-payout timeline with embedded audit trail and duplicate deflection count';

-- ============================================================================
-- UPDATED RETENTION FUNCTION
-- ============================================================================
-- Default retention: 365 days (up from 90)
-- Archives to audit_log_archive before deleting from live table
-- Financial records (risk_score >= 40) retained for 7 years (IRS requirement)
-- Only deletes records that were successfully archived first

CREATE OR REPLACE FUNCTION cleanup_audit_log(p_retention_days INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_archived INTEGER;
  v_deleted INTEGER;
  v_cutoff TIMESTAMPTZ;
  v_financial_cutoff TIMESTAMPTZ;
BEGIN
  v_cutoff := NOW() - (p_retention_days || ' days')::INTERVAL;
  v_financial_cutoff := NOW() - INTERVAL '7 years';

  -- Step 1: Archive eligible records (that are not already archived)
  WITH to_archive AS (
    SELECT al.*
    FROM audit_log al
    WHERE al.created_at < v_cutoff
      -- Financial records: keep for 7 years
      AND NOT (al.risk_score >= 40 AND al.created_at > v_financial_cutoff)
      -- Only archive if not already in archive
      AND NOT EXISTS (
        SELECT 1 FROM audit_log_archive ala WHERE ala.id = al.id
      )
  ),
  inserted AS (
    INSERT INTO audit_log_archive
    SELECT * FROM to_archive
    RETURNING id
  )
  SELECT COUNT(*) INTO v_archived FROM inserted;

  -- Step 2: Delete only records that were successfully archived
  WITH deletable AS (
    SELECT al.id
    FROM audit_log al
    WHERE al.created_at < v_cutoff
      AND NOT (al.risk_score >= 40 AND al.created_at > v_financial_cutoff)
      -- Only delete if successfully archived
      AND EXISTS (
        SELECT 1 FROM audit_log_archive ala WHERE ala.id = al.id
      )
  ),
  deleted AS (
    DELETE FROM audit_log
    WHERE id IN (SELECT id FROM deletable)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RAISE NOTICE 'Audit cleanup: archived=%, deleted=%, retention=% days, financial_retention=7 years',
    v_archived, v_deleted, p_retention_days;

  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION cleanup_audit_log IS
  'Archives and cleans up audit_log with 365-day default retention and 7-year IRS financial retention';

-- ============================================================================
-- EXPORT FUNCTION
-- ============================================================================
-- Returns JSONB with live + optional archived records for compliance exports

CREATE OR REPLACE FUNCTION export_audit_logs(
  p_ledger_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_include_archived BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_live JSONB;
  v_archived JSONB;
BEGIN
  -- Fetch live records
  SELECT COALESCE(jsonb_agg(row_to_json(al.*) ORDER BY al.created_at), '[]'::jsonb)
  INTO v_live
  FROM public.audit_log al
  WHERE al.ledger_id = p_ledger_id
    AND al.created_at >= p_start_date
    AND al.created_at <= p_end_date;

  -- Optionally fetch archived records
  IF p_include_archived THEN
    SELECT COALESCE(jsonb_agg(row_to_json(ala.*) ORDER BY ala.created_at), '[]'::jsonb)
    INTO v_archived
    FROM public.audit_log_archive ala
    WHERE ala.ledger_id = p_ledger_id
      AND ala.created_at >= p_start_date
      AND ala.created_at <= p_end_date;
  ELSE
    v_archived := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ledger_id', p_ledger_id,
    'date_range', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'exported_at', NOW(),
    'include_archived', p_include_archived,
    'live_records', v_live,
    'live_count', jsonb_array_length(v_live),
    'archived_records', v_archived,
    'archived_count', jsonb_array_length(v_archived)
  );
END;
$$;

COMMENT ON FUNCTION export_audit_logs IS
  'Exports audit_log records (live + optional archived) for a ledger within a date range';
COMMENT ON FUNCTION refresh_dispute_lifecycle IS
  'Refreshes the dispute_lifecycle materialized view concurrently';
COMMENT ON FUNCTION refresh_payout_lifecycle IS
  'Refreshes the payout_lifecycle materialized view concurrently';
