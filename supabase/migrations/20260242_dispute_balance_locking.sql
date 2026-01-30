-- Migration: Dispute Balance Locking
-- Make held_funds work for disputes (event-driven holds without a withholding_rule)
-- 1. Make withholding_rule_id nullable
-- 2. Fix held_funds_summary view to LEFT JOIN
-- 3. Fix process_automatic_releases to skip rows without a rule
-- 4. Add dispute-specific index

-- ============================================================================
-- 1. Make withholding_rule_id nullable
-- ============================================================================
-- Disputes are event-driven, not rule-based, so they don't have a withholding_rule_id
ALTER TABLE held_funds ALTER COLUMN withholding_rule_id DROP NOT NULL;

-- ============================================================================
-- 2. Fix held_funds_summary view to LEFT JOIN withholding_rules
-- ============================================================================
-- The current INNER JOIN excludes dispute holds (where withholding_rule_id IS NULL)
DROP VIEW IF EXISTS held_funds_summary;

CREATE VIEW held_funds_summary
WITH (security_invoker = true)
AS
SELECT
  hf.ledger_id,
  hf.creator_id,
  COALESCE(wr.rule_type, 'dispute') AS rule_type,
  COALESCE(wr.name, hf.hold_reason) AS rule_name,
  count(*) AS hold_count,
  sum(hf.held_amount) AS total_held,
  sum(hf.released_amount) AS total_released,
  sum(hf.held_amount - hf.released_amount) AS currently_held,
  min(hf.release_eligible_at) FILTER (WHERE hf.status = 'held') AS next_release_date
FROM held_funds hf
LEFT JOIN withholding_rules wr ON hf.withholding_rule_id = wr.id
GROUP BY hf.ledger_id, hf.creator_id, COALESCE(wr.rule_type, 'dispute'), COALESCE(wr.name, hf.hold_reason);

-- ============================================================================
-- 3. Fix process_automatic_releases to skip dispute holds
-- ============================================================================
-- Dispute holds have no withholding_rule, so the JOIN would exclude them naturally,
-- but we should be explicit: only process rows that have a rule with release_trigger = 'automatic'
CREATE OR REPLACE FUNCTION process_automatic_releases(p_ledger_id UUID DEFAULT NULL)
RETURNS TABLE (
  held_fund_id UUID,
  creator_id TEXT,
  amount NUMERIC(14,2),
  success BOOLEAN
) AS $$
DECLARE
  v_held RECORD;
  v_result JSONB;
BEGIN
  FOR v_held IN
    SELECT hf.*
    FROM held_funds hf
    JOIN withholding_rules wr ON hf.withholding_rule_id = wr.id
    WHERE hf.status = 'held'
      AND hf.withholding_rule_id IS NOT NULL
      AND hf.release_eligible_at <= NOW()
      AND wr.release_trigger = 'automatic'
      AND (p_ledger_id IS NULL OR hf.ledger_id = p_ledger_id)
    ORDER BY hf.release_eligible_at ASC
  LOOP
    v_result := release_held_funds(v_held.id, 'Automatic release - hold period expired');

    held_fund_id := v_held.id;
    creator_id := v_held.creator_id;
    amount := v_held.held_amount;
    success := (v_result->>'success')::boolean;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. Add dispute-specific index
-- ============================================================================
-- Used for matching dispute holds by hold_reason when disputes are resolved
CREATE INDEX IF NOT EXISTS idx_held_funds_dispute
  ON held_funds(ledger_id, hold_reason)
  WHERE withholding_rule_id IS NULL;
