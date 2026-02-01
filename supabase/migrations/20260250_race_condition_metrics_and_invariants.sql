-- Race condition operational metrics and balance invariant checks
-- Tracks when atomic RPCs deflect concurrent duplicates, and provides
-- functions to verify money-movement invariants hold in production.

-- ============================================================================
-- OPERATIONAL METRICS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS race_condition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_race_events_ledger ON race_condition_events(ledger_id);
CREATE INDEX idx_race_events_type ON race_condition_events(event_type);
CREATE INDEX idx_race_events_created ON race_condition_events(created_at DESC);

-- ============================================================================
-- INVARIANT CHECK: No negative available balances
-- ============================================================================
CREATE OR REPLACE FUNCTION check_balance_invariants(p_ledger_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_violations JSONB := '[]'::jsonb;
  v_rec RECORD;
  v_total_checked INTEGER := 0;
  v_total_violations INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT
      a.id AS account_id,
      a.entity_id,
      a.ledger_id,
      COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)
        AS computed_balance,
      COALESCE((
        SELECT SUM(hf.held_amount - hf.released_amount)
        FROM public.held_funds hf
        WHERE hf.ledger_id = a.ledger_id
          AND hf.creator_id = a.entity_id
          AND hf.status IN ('held', 'partial')
      ), 0) AS total_held
    FROM public.accounts a
    LEFT JOIN public.entries e ON e.account_id = a.id
    LEFT JOIN public.transactions t ON t.id = e.transaction_id
      AND t.status NOT IN ('voided', 'reversed')
    WHERE a.account_type = 'creator_balance'
      AND (p_ledger_id IS NULL OR a.ledger_id = p_ledger_id)
    GROUP BY a.id, a.entity_id, a.ledger_id
  LOOP
    v_total_checked := v_total_checked + 1;

    IF v_rec.computed_balance - v_rec.total_held < -0.005 THEN
      v_total_violations := v_total_violations + 1;
      v_violations := v_violations || jsonb_build_object(
        'account_id', v_rec.account_id,
        'entity_id', v_rec.entity_id,
        'ledger_id', v_rec.ledger_id,
        'computed_balance', v_rec.computed_balance,
        'held_amount', v_rec.total_held,
        'available_balance', v_rec.computed_balance - v_rec.total_held
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'check', 'negative_balance',
    'status', CASE WHEN v_total_violations = 0 THEN 'pass' ELSE 'fail' END,
    'accounts_checked', v_total_checked,
    'violations', v_total_violations,
    'details', v_violations
  );
END;
$$;

-- ============================================================================
-- INVARIANT CHECK: No duplicate reference_ids per ledger
-- ============================================================================
CREATE OR REPLACE FUNCTION check_no_duplicate_references(p_ledger_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_duplicates JSONB := '[]'::jsonb;
  v_rec RECORD;
  v_total_duplicates INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT t.ledger_id, t.reference_id, COUNT(*) AS dup_count
    FROM public.transactions t
    WHERE t.reference_id IS NOT NULL
      AND (p_ledger_id IS NULL OR t.ledger_id = p_ledger_id)
    GROUP BY t.ledger_id, t.reference_id
    HAVING COUNT(*) > 1
    LIMIT 100
  LOOP
    v_total_duplicates := v_total_duplicates + 1;
    v_duplicates := v_duplicates || jsonb_build_object(
      'ledger_id', v_rec.ledger_id,
      'reference_id', v_rec.reference_id,
      'count', v_rec.dup_count
    );
  END LOOP;

  RETURN jsonb_build_object(
    'check', 'duplicate_references',
    'status', CASE WHEN v_total_duplicates = 0 THEN 'pass' ELSE 'fail' END,
    'duplicates_found', v_total_duplicates,
    'details', v_duplicates
  );
END;
$$;

-- ============================================================================
-- INVARIANT CHECK: Double-entry balance (debits = credits per transaction)
-- ============================================================================
CREATE OR REPLACE FUNCTION check_double_entry_balance(p_ledger_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_unbalanced JSONB := '[]'::jsonb;
  v_rec RECORD;
  v_total_unbalanced INTEGER := 0;
  v_total_checked INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT
      e.transaction_id,
      t.ledger_id,
      t.reference_id,
      t.transaction_type,
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) AS total_debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) AS total_credits
    FROM public.entries e
    JOIN public.transactions t ON t.id = e.transaction_id
    WHERE (p_ledger_id IS NULL OR t.ledger_id = p_ledger_id)
    GROUP BY e.transaction_id, t.ledger_id, t.reference_id, t.transaction_type
    HAVING ABS(
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END)
      - SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)
    ) > 0.005
    LIMIT 100
  LOOP
    v_total_unbalanced := v_total_unbalanced + 1;
    v_unbalanced := v_unbalanced || jsonb_build_object(
      'transaction_id', v_rec.transaction_id,
      'ledger_id', v_rec.ledger_id,
      'reference_id', v_rec.reference_id,
      'type', v_rec.transaction_type,
      'debits', v_rec.total_debits,
      'credits', v_rec.total_credits,
      'imbalance', v_rec.total_debits - v_rec.total_credits
    );
  END LOOP;

  SELECT COUNT(DISTINCT e.transaction_id) INTO v_total_checked
  FROM public.entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE (p_ledger_id IS NULL OR t.ledger_id = p_ledger_id);

  RETURN jsonb_build_object(
    'check', 'double_entry_balance',
    'status', CASE WHEN v_total_unbalanced = 0 THEN 'pass' ELSE 'fail' END,
    'transactions_checked', v_total_checked,
    'unbalanced', v_total_unbalanced,
    'details', v_unbalanced
  );
END;
$$;

-- ============================================================================
-- COMBINED INVARIANT RUNNER
-- ============================================================================
CREATE OR REPLACE FUNCTION run_money_invariants(p_ledger_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_balance_check JSONB;
  v_dup_check JSONB;
  v_de_check JSONB;
  v_overall TEXT := 'pass';
BEGIN
  v_balance_check := public.check_balance_invariants(p_ledger_id);
  v_dup_check := public.check_no_duplicate_references(p_ledger_id);
  v_de_check := public.check_double_entry_balance(p_ledger_id);

  IF v_balance_check->>'status' = 'fail'
     OR v_dup_check->>'status' = 'fail'
     OR v_de_check->>'status' = 'fail' THEN
    v_overall := 'fail';
  END IF;

  RETURN jsonb_build_object(
    'status', v_overall,
    'run_at', NOW(),
    'ledger_id', p_ledger_id,
    'checks', jsonb_build_array(v_balance_check, v_dup_check, v_de_check),
    'race_condition_stats', (
      SELECT jsonb_build_object(
        'total_events', COUNT(*),
        'last_24h', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),
        'last_7d', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'),
        'by_type', (
          SELECT jsonb_object_agg(event_type, cnt)
          FROM (
            SELECT event_type, COUNT(*) AS cnt
            FROM public.race_condition_events
            WHERE (p_ledger_id IS NULL OR ledger_id = p_ledger_id)
            GROUP BY event_type
          ) sub
        )
      )
      FROM public.race_condition_events
      WHERE (p_ledger_id IS NULL OR ledger_id = p_ledger_id)
    )
  );
END;
$$;
