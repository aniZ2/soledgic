-- Transaction Graph: explicit relationship edges between financial events.
-- Enables payout batch reconstruction, fee tracing, dispute chains,
-- and "where did this money come from" queries.

CREATE TABLE IF NOT EXISTS transaction_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  link_type text NOT NULL,  -- see types below
  amount numeric(14,2),     -- portion of source involved in this link (optional)
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Prevent duplicate edges
  CONSTRAINT uq_transaction_link UNIQUE (ledger_id, source_id, target_id, link_type)
);

-- Link types:
-- 'refund'          → refund transaction → original sale
-- 'fee'             → fee deduction → parent charge
-- 'payout_item'     → individual charge → payout batch
-- 'dispute'         → dispute → original charge
-- 'split'           → platform fee split → original sale
-- 'reversal'        → generic reversal → reversed transaction
-- 'adjustment'      → adjustment → corrected transaction
-- 'recurring_child' → recurring instance → parent template

CREATE INDEX idx_txn_links_source ON transaction_links (ledger_id, source_id);
CREATE INDEX idx_txn_links_target ON transaction_links (ledger_id, target_id);
CREATE INDEX idx_txn_links_type ON transaction_links (ledger_id, link_type);

COMMENT ON TABLE transaction_links IS 'Directed edges between transactions forming a financial event graph';

-- ============================================================================
-- Payout batches: groups of charges settled in a single bank deposit
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_batches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  processor_payout_id text,        -- Stripe transfer/payout ID or processor reference
  arrival_date date,               -- When the money hit the bank
  gross_amount numeric(14,2),      -- Sum of charges before fees
  fee_amount numeric(14,2),        -- Total fees deducted
  net_amount numeric(14,2),        -- Amount deposited (gross - fees)
  refund_amount numeric(14,2) DEFAULT 0,  -- Refunds deducted from batch
  adjustment_amount numeric(14,2) DEFAULT 0,
  currency text DEFAULT 'USD',
  item_count integer DEFAULT 0,    -- Number of charges in batch
  status text DEFAULT 'pending',   -- pending, settled, matched, disputed
  matched_bank_transaction_id uuid, -- Links to bank_transactions when matched
  matched_at timestamptz,
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,

  CONSTRAINT uq_payout_batch_processor UNIQUE (ledger_id, processor_payout_id)
);

CREATE INDEX idx_payout_batches_ledger ON payout_batches (ledger_id, arrival_date DESC);
CREATE INDEX idx_payout_batches_unmatched ON payout_batches (ledger_id, status) WHERE status != 'matched';

COMMENT ON TABLE payout_batches IS 'Reconstructed payout batches linking individual charges to bank deposits';

-- ============================================================================
-- Payout batch items: individual charges within a batch
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_batch_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id),
  processor_transaction_id uuid REFERENCES processor_transactions(id),
  amount numeric(14,2) NOT NULL,
  fee numeric(14,2) DEFAULT 0,
  net numeric(14,2),               -- amount - fee
  item_type text DEFAULT 'charge', -- charge, refund, fee, adjustment
  processor_id text,               -- External processor charge/refund ID
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_payout_batch_items_batch ON payout_batch_items (batch_id);
CREATE INDEX idx_payout_batch_items_txn ON payout_batch_items (transaction_id) WHERE transaction_id IS NOT NULL;

COMMENT ON TABLE payout_batch_items IS 'Individual charges/refunds/fees within a payout batch';

-- ============================================================================
-- Graph traversal helper: find all related transactions
-- ============================================================================

CREATE OR REPLACE FUNCTION get_transaction_graph(
  p_transaction_id uuid,
  p_ledger_id uuid,
  p_max_depth integer DEFAULT 3
) RETURNS TABLE (
  transaction_id uuid,
  related_id uuid,
  link_type text,
  direction text,  -- 'outgoing' or 'incoming'
  depth integer,
  amount numeric(14,2)
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE graph AS (
    -- Outgoing edges from source transaction
    SELECT
      tl.source_id AS transaction_id,
      tl.target_id AS related_id,
      tl.link_type,
      'outgoing'::text AS direction,
      1 AS depth,
      tl.amount
    FROM transaction_links tl
    WHERE tl.source_id = p_transaction_id
      AND tl.ledger_id = p_ledger_id

    UNION ALL

    -- Incoming edges to source transaction
    SELECT
      tl.target_id AS transaction_id,
      tl.source_id AS related_id,
      tl.link_type,
      'incoming'::text AS direction,
      1 AS depth,
      tl.amount
    FROM transaction_links tl
    WHERE tl.target_id = p_transaction_id
      AND tl.ledger_id = p_ledger_id

    UNION ALL

    -- Recursive: follow edges from discovered nodes
    SELECT
      g.related_id AS transaction_id,
      CASE WHEN tl.source_id = g.related_id THEN tl.target_id ELSE tl.source_id END AS related_id,
      tl.link_type,
      CASE WHEN tl.source_id = g.related_id THEN 'outgoing' ELSE 'incoming' END AS direction,
      g.depth + 1 AS depth,
      tl.amount
    FROM graph g
    JOIN transaction_links tl ON (tl.source_id = g.related_id OR tl.target_id = g.related_id)
      AND tl.ledger_id = p_ledger_id
    WHERE g.depth < p_max_depth
      -- Avoid cycles
      AND CASE WHEN tl.source_id = g.related_id THEN tl.target_id ELSE tl.source_id END != p_transaction_id
  )
  SELECT DISTINCT ON (g.related_id, g.link_type)
    g.transaction_id, g.related_id, g.link_type, g.direction, g.depth, g.amount
  FROM graph g
  ORDER BY g.related_id, g.link_type, g.depth;
END;
$$;

COMMENT ON FUNCTION get_transaction_graph(uuid, uuid, integer) IS 'Traverse the transaction graph from a starting node, returning all related transactions up to max_depth';

-- ============================================================================
-- Payout batch reconstruction: given a processor payout, find its charges
-- ============================================================================

CREATE OR REPLACE FUNCTION reconstruct_payout_batch(
  p_ledger_id uuid,
  p_payout_processor_id text,
  p_arrival_date date,
  p_net_amount numeric(14,2)
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch_id uuid;
  v_gross numeric(14,2) := 0;
  v_fees numeric(14,2) := 0;
  v_refunds numeric(14,2) := 0;
  v_item_count integer := 0;
  v_matched_bank_txn_id uuid;
  v_rec record;
BEGIN
  -- Check if batch already exists
  SELECT id INTO v_batch_id
  FROM payout_batches
  WHERE ledger_id = p_ledger_id
    AND processor_payout_id = p_payout_processor_id;

  IF v_batch_id IS NOT NULL THEN
    RETURN jsonb_build_object('batch_id', v_batch_id, 'already_exists', true);
  END IF;

  -- Find charges that could be part of this payout:
  -- Transactions within a reasonable window before the arrival date
  -- whose amounts sum to approximately the net payout amount.
  --
  -- Strategy: find unlinked charges in the 7 days before arrival_date
  -- and greedily add them until we reach the net amount.

  CREATE TEMP TABLE _candidate_charges ON COMMIT DROP AS
  SELECT
    t.id AS transaction_id,
    pt.id AS processor_transaction_id,
    t.amount,
    pt.processor_id,
    t.created_at
  FROM transactions t
  LEFT JOIN processor_transactions pt ON pt.matched_transaction_id = t.id AND pt.ledger_id = p_ledger_id
  LEFT JOIN payout_batch_items pbi ON pbi.transaction_id = t.id
  WHERE t.ledger_id = p_ledger_id
    AND t.transaction_type IN ('sale', 'income')
    AND t.status = 'completed'
    AND t.created_at::date BETWEEN (p_arrival_date - interval '14 days') AND p_arrival_date
    AND pbi.id IS NULL  -- not already in a batch
  ORDER BY t.created_at;

  -- Create the batch
  INSERT INTO payout_batches (ledger_id, processor_payout_id, arrival_date, currency, status)
  VALUES (p_ledger_id, p_payout_processor_id, p_arrival_date, 'USD', 'pending')
  RETURNING id INTO v_batch_id;

  -- Add candidates as batch items
  FOR v_rec IN SELECT * FROM _candidate_charges LOOP
    INSERT INTO payout_batch_items (batch_id, transaction_id, processor_transaction_id, amount, item_type, processor_id)
    VALUES (v_batch_id, v_rec.transaction_id, v_rec.processor_transaction_id, v_rec.amount, 'charge', v_rec.processor_id);

    -- Create graph edge: charge → payout batch
    INSERT INTO transaction_links (ledger_id, source_id, target_id, link_type, amount)
    SELECT p_ledger_id, v_rec.transaction_id, t.id, 'payout_item', v_rec.amount
    FROM transactions t
    WHERE t.ledger_id = p_ledger_id AND t.reference_id = p_payout_processor_id
    LIMIT 1
    ON CONFLICT DO NOTHING;

    v_gross := v_gross + v_rec.amount;
    v_item_count := v_item_count + 1;
  END LOOP;

  -- Find refunds in the same window
  FOR v_rec IN
    SELECT t.id AS transaction_id, t.amount
    FROM transactions t
    LEFT JOIN payout_batch_items pbi ON pbi.transaction_id = t.id
    WHERE t.ledger_id = p_ledger_id
      AND t.transaction_type = 'refund'
      AND t.status = 'completed'
      AND t.created_at::date BETWEEN (p_arrival_date - interval '14 days') AND p_arrival_date
      AND pbi.id IS NULL
  LOOP
    INSERT INTO payout_batch_items (batch_id, transaction_id, amount, item_type)
    VALUES (v_batch_id, v_rec.transaction_id, v_rec.amount, 'refund');

    v_refunds := v_refunds + ABS(v_rec.amount);
  END LOOP;

  -- Compute fee as the difference
  v_fees := v_gross - v_refunds - p_net_amount;
  IF v_fees < 0 THEN v_fees := 0; END IF;

  -- Try to match to a bank deposit
  SELECT id INTO v_matched_bank_txn_id
  FROM bank_transactions
  WHERE ledger_id = p_ledger_id
    AND ABS(amount - p_net_amount) < 0.02
    AND transaction_date BETWEEN (p_arrival_date - interval '3 days') AND (p_arrival_date + interval '3 days')
    AND reconciliation_status = 'unmatched'
  ORDER BY ABS(transaction_date - p_arrival_date)
  LIMIT 1;

  -- Update the batch with computed amounts
  UPDATE payout_batches SET
    gross_amount = v_gross,
    fee_amount = v_fees,
    net_amount = p_net_amount,
    refund_amount = v_refunds,
    item_count = v_item_count,
    matched_bank_transaction_id = v_matched_bank_txn_id,
    matched_at = CASE WHEN v_matched_bank_txn_id IS NOT NULL THEN now() ELSE NULL END,
    status = CASE WHEN v_matched_bank_txn_id IS NOT NULL THEN 'matched' ELSE 'pending' END
  WHERE id = v_batch_id;

  -- If matched, update the bank transaction too
  IF v_matched_bank_txn_id IS NOT NULL THEN
    UPDATE bank_transactions SET
      reconciliation_status = 'matched',
      matched_at = now(),
      matched_by = 'batch_reconstruction',
      match_confidence = 90.0
    WHERE id = v_matched_bank_txn_id;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'item_count', v_item_count,
    'gross_amount', v_gross,
    'fee_amount', v_fees,
    'refund_amount', v_refunds,
    'net_amount', p_net_amount,
    'bank_matched', v_matched_bank_txn_id IS NOT NULL,
    'matched_bank_transaction_id', v_matched_bank_txn_id
  );
END;
$$;

COMMENT ON FUNCTION reconstruct_payout_batch(uuid, text, date, numeric) IS 'Reconstruct a payout batch from individual charges and match to bank deposit';
