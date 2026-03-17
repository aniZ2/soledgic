-- Import sessions: track each file upload with visibility into match progress
CREATE TABLE IF NOT EXISTS import_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  file_name text,
  file_format text NOT NULL,  -- csv, ofx, qfx, camt053, bai2, mt940
  row_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  unmatched_count integer NOT NULL DEFAULT 0,
  opening_balance numeric(14,2),
  closing_balance numeric(14,2),
  computed_closing_balance numeric(14,2),  -- opening + sum(transactions)
  balance_verified boolean,  -- true if computed == closing
  balance_discrepancy numeric(14,2),  -- difference if any
  currency text DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',  -- pending, imported, reconciled, failed
  error text,
  created_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_import_sessions_ledger ON import_sessions (ledger_id, created_at DESC);

-- Add import_session_id to bank_transactions for traceability
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS import_session_id uuid REFERENCES import_sessions(id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_session ON bank_transactions (import_session_id) WHERE import_session_id IS NOT NULL;

-- Implement the missing auto_match_bank_aggregator_transaction RPC
-- Tiered matching: exact → amount+date → batch → fuzzy description
CREATE OR REPLACE FUNCTION auto_match_bank_aggregator_transaction(
  p_bank_aggregator_txn_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_txn record;
  v_match record;
  v_ledger_id uuid;
  v_amount numeric(14,2);
  v_date date;
  v_description text;
  v_matched_id uuid;
  v_match_type text;
  v_confidence numeric(5,2);
BEGIN
  -- Load the bank transaction
  SELECT * INTO v_txn
  FROM bank_transactions
  WHERE id = p_bank_aggregator_txn_id
    AND reconciliation_status = 'unmatched';

  IF v_txn IS NULL THEN
    -- Try bank_aggregator_transactions table
    SELECT bat.*, bat.ledger_id as lid, bat.amount as amt,
           bat.date as txn_date, bat.name as txn_name
    INTO v_txn
    FROM bank_aggregator_transactions bat
    WHERE bat.id = p_bank_aggregator_txn_id
      AND bat.match_status = 'unmatched';

    IF v_txn IS NULL THEN
      RETURN jsonb_build_object('matched', false, 'reason', 'transaction_not_found_or_already_matched');
    END IF;

    v_ledger_id := v_txn.lid;
    v_amount := v_txn.amt;
    v_date := v_txn.txn_date;
    v_description := COALESCE(v_txn.txn_name, '');
  ELSE
    v_ledger_id := v_txn.ledger_id;
    v_amount := v_txn.amount;
    v_date := v_txn.transaction_date;
    v_description := COALESCE(v_txn.name, v_txn.merchant_name, '');
  END IF;

  -- ============================================================
  -- PASS 1: Exact match (amount + date + reference)
  -- ============================================================
  IF v_txn.provider_transaction_id IS NOT NULL OR (v_txn.raw_data->>'reference') IS NOT NULL THEN
    SELECT t.id INTO v_matched_id
    FROM transactions t
    WHERE t.ledger_id = v_ledger_id
      AND ABS(t.amount) = ABS(v_amount)
      AND t.created_at::date = v_date
      AND (t.reference_id = v_txn.provider_transaction_id
           OR t.reference_id = v_txn.raw_data->>'reference')
    LIMIT 1;

    IF v_matched_id IS NOT NULL THEN
      v_match_type := 'exact';
      v_confidence := 99.0;
      PERFORM _record_match(p_bank_aggregator_txn_id, v_matched_id, v_ledger_id, v_match_type, v_confidence);
      RETURN jsonb_build_object('matched', true, 'match_type', v_match_type, 'matched_transaction_id', v_matched_id, 'confidence', v_confidence);
    END IF;
  END IF;

  -- ============================================================
  -- PASS 2: Amount + date window (±3 days)
  -- ============================================================
  SELECT t.id, t.amount INTO v_match
  FROM transactions t
  LEFT JOIN bank_matches bm ON bm.transaction_id = t.id AND bm.ledger_id = v_ledger_id
  WHERE t.ledger_id = v_ledger_id
    AND ABS(t.amount) = ABS(v_amount)
    AND t.created_at::date BETWEEN (v_date - interval '3 days') AND (v_date + interval '3 days')
    AND bm.id IS NULL  -- not already matched
  ORDER BY ABS(t.created_at::date - v_date)
  LIMIT 1;

  IF v_match.id IS NOT NULL THEN
    v_matched_id := v_match.id;
    v_match_type := 'amount_date';
    v_confidence := 85.0;
    PERFORM _record_match(p_bank_aggregator_txn_id, v_matched_id, v_ledger_id, v_match_type, v_confidence);
    RETURN jsonb_build_object('matched', true, 'match_type', v_match_type, 'matched_transaction_id', v_matched_id, 'confidence', v_confidence);
  END IF;

  -- ============================================================
  -- PASS 3: Fuzzy description match (amount + trigram similarity)
  -- ============================================================
  -- Only if pg_trgm extension is available; fallback to ILIKE
  SELECT t.id INTO v_matched_id
  FROM transactions t
  LEFT JOIN bank_matches bm ON bm.transaction_id = t.id AND bm.ledger_id = v_ledger_id
  WHERE t.ledger_id = v_ledger_id
    AND ABS(t.amount) = ABS(v_amount)
    AND t.created_at::date BETWEEN (v_date - interval '7 days') AND (v_date + interval '7 days')
    AND bm.id IS NULL
    AND (
      LOWER(t.description) LIKE '%' || LOWER(LEFT(v_description, 20)) || '%'
      OR LOWER(COALESCE(t.metadata->>'merchant_name', '')) LIKE '%' || LOWER(LEFT(v_description, 15)) || '%'
    )
  ORDER BY ABS(t.created_at::date - v_date)
  LIMIT 1;

  IF v_matched_id IS NOT NULL THEN
    v_match_type := 'fuzzy_description';
    v_confidence := 70.0;
    PERFORM _record_match(p_bank_aggregator_txn_id, v_matched_id, v_ledger_id, v_match_type, v_confidence);
    RETURN jsonb_build_object('matched', true, 'match_type', v_match_type, 'matched_transaction_id', v_matched_id, 'confidence', v_confidence);
  END IF;

  -- No match found
  RETURN jsonb_build_object('matched', false, 'reason', 'no_match_found');
END;
$$;

-- Helper: record a match in bank_matches and update the source transaction
CREATE OR REPLACE FUNCTION _record_match(
  p_bank_txn_id uuid,
  p_transaction_id uuid,
  p_ledger_id uuid,
  p_match_type text,
  p_confidence numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert into bank_matches (ignore conflict if already matched)
  INSERT INTO bank_matches (ledger_id, transaction_id, bank_transaction_id, match_type, confidence, status)
  VALUES (p_ledger_id, p_transaction_id, p_bank_txn_id, p_match_type, p_confidence, 'confirmed')
  ON CONFLICT (ledger_id, transaction_id) DO NOTHING;

  -- Update bank_transactions if that's the source
  UPDATE bank_transactions
  SET reconciliation_status = 'matched',
      matched_transaction_id = p_transaction_id,
      matched_at = now(),
      matched_by = 'auto',
      match_confidence = p_confidence
  WHERE id = p_bank_txn_id;

  -- Update bank_aggregator_transactions if that's the source
  UPDATE bank_aggregator_transactions
  SET match_status = 'matched',
      matched_transaction_id = p_transaction_id
  WHERE id = p_bank_txn_id;
END;
$$;

COMMENT ON FUNCTION auto_match_bank_aggregator_transaction(uuid) IS 'Tiered auto-match: exact reference → amount+date → fuzzy description';
COMMENT ON TABLE import_sessions IS 'Tracks each file upload with format, row counts, balance verification, and match progress';
