-- Soledgic: Shadow Ledger (Phase 2)
-- Migration: Deterministic Future Projection (Ghost Entries)
--
-- Ghost Entries are NOT transactions.
-- They NEVER affect entries, balances, reports, or any posted ledger state.
-- They are deterministic projections derived from Authorizing Instruments.
-- They exist only to express Future Intent and enable snap-to matching when reality arrives.

-- ============================================================================
-- 1. ADD STATUS TO AUTHORIZING INSTRUMENTS
-- ============================================================================

ALTER TABLE authorizing_instruments
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'invalidated'));

CREATE INDEX IF NOT EXISTS idx_authorizing_instruments_status
  ON authorizing_instruments(ledger_id, status);

COMMENT ON COLUMN authorizing_instruments.status IS
  'Instrument status: active (can project), invalidated (expired all pending projections)';

-- ============================================================================
-- 2. PROJECTED TRANSACTIONS TABLE (GHOST ENTRIES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS projected_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  authorizing_instrument_id UUID NOT NULL REFERENCES authorizing_instruments(id) ON DELETE CASCADE,

  -- Projection details
  expected_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Status: pending (awaiting match), fulfilled (matched to real tx), expired (instrument invalidated)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'expired')),

  -- Traceability: link back to the real transaction when matched
  matched_transaction_id UUID REFERENCES transactions(id),

  -- Metadata for counterparty, notes, etc.
  metadata JSONB DEFAULT '{}',

  -- Immutable creation timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- UNIQUE constraint prevents duplicate projections
  CONSTRAINT unique_projection UNIQUE (ledger_id, authorizing_instrument_id, expected_date, amount, currency)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_projected_transactions_ledger
  ON projected_transactions(ledger_id);
CREATE INDEX IF NOT EXISTS idx_projected_transactions_instrument
  ON projected_transactions(authorizing_instrument_id);
CREATE INDEX IF NOT EXISTS idx_projected_transactions_status
  ON projected_transactions(ledger_id, status);
CREATE INDEX IF NOT EXISTS idx_projected_transactions_expected_date
  ON projected_transactions(ledger_id, expected_date);
CREATE INDEX IF NOT EXISTS idx_projected_transactions_pending
  ON projected_transactions(ledger_id, status, expected_date)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_projected_transactions_matched
  ON projected_transactions(matched_transaction_id)
  WHERE matched_transaction_id IS NOT NULL;

-- ============================================================================
-- 3. ADD PROJECTION_ID TO TRANSACTIONS (OPTIONAL FK)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions'
    AND column_name = 'projection_id'
  ) THEN
    ALTER TABLE transactions
    ADD COLUMN projection_id UUID REFERENCES projected_transactions(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_projection
  ON transactions(projection_id)
  WHERE projection_id IS NOT NULL;

-- ============================================================================
-- 4. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE projected_transactions ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS projected_transactions_service_all ON projected_transactions;
CREATE POLICY projected_transactions_service_all ON projected_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can only see projections in their ledgers
DROP POLICY IF EXISTS projected_transactions_user_select ON projected_transactions;
CREATE POLICY projected_transactions_user_select ON projected_transactions
  FOR SELECT
  TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Users can insert projections for their ledgers
DROP POLICY IF EXISTS projected_transactions_user_insert ON projected_transactions;
CREATE POLICY projected_transactions_user_insert ON projected_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Users can update projection status (for matching)
DROP POLICY IF EXISTS projected_transactions_user_update ON projected_transactions;
CREATE POLICY projected_transactions_user_update ON projected_transactions
  FOR UPDATE
  TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. INSTRUMENT INVALIDATION TRIGGER
-- ============================================================================
-- When an instrument is invalidated, expire all pending projections

CREATE OR REPLACE FUNCTION expire_pending_projections()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when status changes to 'invalidated'
  IF OLD.status = 'active' AND NEW.status = 'invalidated' THEN
    UPDATE projected_transactions
    SET status = 'expired'
    WHERE authorizing_instrument_id = NEW.id
    AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_expire_projections_on_invalidation ON authorizing_instruments;
CREATE TRIGGER trigger_expire_projections_on_invalidation
  AFTER UPDATE ON authorizing_instruments
  FOR EACH ROW
  EXECUTE FUNCTION expire_pending_projections();

-- ============================================================================
-- 6. HELPER FUNCTION: Generate projection dates from cadence
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_projection_dates(
  p_start_date DATE,
  p_until_date DATE,
  p_cadence TEXT
)
RETURNS TABLE (expected_date DATE)
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current DATE := p_start_date;
  v_interval INTERVAL;
BEGIN
  -- Determine interval based on cadence
  CASE p_cadence
    WHEN 'weekly' THEN v_interval := '7 days'::INTERVAL;
    WHEN 'bi_weekly' THEN v_interval := '14 days'::INTERVAL;
    WHEN 'monthly' THEN v_interval := '1 month'::INTERVAL;
    WHEN 'quarterly' THEN v_interval := '3 months'::INTERVAL;
    WHEN 'annual', 'yearly' THEN v_interval := '1 year'::INTERVAL;
    ELSE
      -- Unsupported cadence, return empty
      RETURN;
  END CASE;

  -- Generate dates
  WHILE v_current <= p_until_date LOOP
    expected_date := v_current;
    RETURN NEXT;
    v_current := v_current + v_interval;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_projection_dates TO service_role;

-- ============================================================================
-- 7. HELPER FUNCTION: Find matching projection for snap-to
-- ============================================================================

CREATE OR REPLACE FUNCTION find_matching_projection(
  p_ledger_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_transaction_date DATE,
  p_date_tolerance INTEGER DEFAULT 3
)
RETURNS TABLE (
  projection_id UUID,
  authorizing_instrument_id UUID,
  expected_date DATE,
  amount NUMERIC,
  currency TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pt.id AS projection_id,
    pt.authorizing_instrument_id,
    pt.expected_date,
    pt.amount,
    pt.currency
  FROM projected_transactions pt
  WHERE pt.ledger_id = p_ledger_id
    AND pt.status = 'pending'
    AND pt.amount = p_amount
    AND pt.currency = p_currency
    AND pt.expected_date BETWEEN (p_transaction_date - p_date_tolerance)
                              AND (p_transaction_date + p_date_tolerance)
  ORDER BY ABS(pt.expected_date - p_transaction_date)  -- Closest date first
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION find_matching_projection TO service_role;

-- ============================================================================
-- 8. HELPER FUNCTION: Fulfill projection (snap-to match)
-- ============================================================================

CREATE OR REPLACE FUNCTION fulfill_projection(
  p_projection_id UUID,
  p_transaction_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  -- Update projection status to fulfilled
  UPDATE projected_transactions
  SET status = 'fulfilled',
      matched_transaction_id = p_transaction_id
  WHERE id = p_projection_id
    AND status = 'pending'
  RETURNING TRUE INTO v_updated;

  -- Link transaction back to projection
  IF v_updated THEN
    UPDATE transactions
    SET projection_id = p_projection_id
    WHERE id = p_transaction_id;
  END IF;

  RETURN COALESCE(v_updated, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION fulfill_projection TO service_role;

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON TABLE projected_transactions IS
  'Shadow Ledger: Deterministic future projections (ghost entries). NEVER affects balances or entries.';

COMMENT ON COLUMN projected_transactions.expected_date IS
  'Projected date when the obligation is expected to occur';

COMMENT ON COLUMN projected_transactions.status IS
  'pending: awaiting match, fulfilled: matched to real tx, expired: instrument invalidated';

COMMENT ON COLUMN projected_transactions.matched_transaction_id IS
  'Links to the real transaction when snap-to matching occurs';

COMMENT ON COLUMN transactions.projection_id IS
  'Links back to the projected_transaction that was fulfilled by this transaction';
