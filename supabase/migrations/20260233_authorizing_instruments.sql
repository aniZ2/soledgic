-- Soledgic: Authorizing Instruments
-- Migration: Add ledger-native financial authorization validation
--
-- Authorizing Instruments are NOT contracts in the CLM sense.
-- They are structured, ledger-adjacent representations of financial intent that:
--   - explain why money moved
--   - validate whether a transaction was authorized
--   - support reconciliation-by-proof
--
-- They are subordinate to the ledger, never move money, and are immutable once created.

-- ============================================================================
-- AUTHORIZING INSTRUMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS authorizing_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,

  -- External reference (e.g., PO number, contract ID from external system)
  external_ref TEXT NOT NULL,

  -- Deterministic fingerprint of the extracted terms (for deduplication and integrity)
  fingerprint TEXT NOT NULL,

  -- Extracted terms - ONLY financial authorization data
  -- This is NOT a full contract - just the authorization-relevant fields
  extracted_terms JSONB NOT NULL DEFAULT '{}',
  -- Schema: {
  --   "amount": number (in cents),
  --   "currency": string (e.g., "USD"),
  --   "cadence": string | null (e.g., "monthly", "one_time", "annual"),
  --   "counterparty_name": string
  -- }

  -- Immutable timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Instruments are IMMUTABLE - no updated_at
  -- To "change" an instrument, invalidate it and create a new one

  -- Ensure unique fingerprint per ledger (prevents duplicate registrations)
  CONSTRAINT unique_instrument_fingerprint UNIQUE (ledger_id, fingerprint),

  -- Ensure external_ref is unique per ledger
  CONSTRAINT unique_external_ref_per_ledger UNIQUE (ledger_id, external_ref)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_authorizing_instruments_ledger
  ON authorizing_instruments(ledger_id);
CREATE INDEX IF NOT EXISTS idx_authorizing_instruments_external_ref
  ON authorizing_instruments(ledger_id, external_ref);
CREATE INDEX IF NOT EXISTS idx_authorizing_instruments_fingerprint
  ON authorizing_instruments(ledger_id, fingerprint);

-- ============================================================================
-- ADD FK TO TRANSACTIONS (optional linkage)
-- ============================================================================

-- Add column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions'
    AND column_name = 'authorizing_instrument_id'
  ) THEN
    ALTER TABLE transactions
    ADD COLUMN authorizing_instrument_id UUID REFERENCES authorizing_instruments(id);
  END IF;
END $$;

-- Index for finding transactions by instrument
CREATE INDEX IF NOT EXISTS idx_transactions_authorizing_instrument
  ON transactions(authorizing_instrument_id)
  WHERE authorizing_instrument_id IS NOT NULL;

-- ============================================================================
-- IMMUTABILITY ENFORCEMENT
-- ============================================================================

-- Prevent updates to authorizing_instruments
CREATE OR REPLACE FUNCTION prevent_instrument_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Authorizing instruments are immutable. Create a new instrument instead.';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS enforce_instrument_immutability ON authorizing_instruments;
CREATE TRIGGER enforce_instrument_immutability
  BEFORE UPDATE ON authorizing_instruments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_instrument_update();

-- Prevent deletion of instruments that are linked to transactions
CREATE OR REPLACE FUNCTION prevent_linked_instrument_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE authorizing_instrument_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Cannot delete authorizing instrument that is linked to transactions';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_instrument_delete_if_linked ON authorizing_instruments;
CREATE TRIGGER prevent_instrument_delete_if_linked
  BEFORE DELETE ON authorizing_instruments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_linked_instrument_delete();

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE authorizing_instruments ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS authorizing_instruments_service_all ON authorizing_instruments;
CREATE POLICY authorizing_instruments_service_all ON authorizing_instruments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can only see instruments in their ledgers
-- (via organization membership)
DROP POLICY IF EXISTS authorizing_instruments_user_select ON authorizing_instruments;
CREATE POLICY authorizing_instruments_user_select ON authorizing_instruments
  FOR SELECT
  TO authenticated
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Users can insert instruments for their ledgers
DROP POLICY IF EXISTS authorizing_instruments_user_insert ON authorizing_instruments;
CREATE POLICY authorizing_instruments_user_insert ON authorizing_instruments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- HELPER FUNCTION: Generate deterministic fingerprint
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_instrument_fingerprint(
  p_external_ref TEXT,
  p_amount BIGINT,
  p_currency TEXT,
  p_cadence TEXT,
  p_counterparty_name TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical TEXT;
BEGIN
  -- Create canonical string representation for consistent hashing
  v_canonical := COALESCE(p_external_ref, '') || '|' ||
                 COALESCE(p_amount::TEXT, '0') || '|' ||
                 COALESCE(UPPER(p_currency), 'USD') || '|' ||
                 COALESCE(LOWER(p_cadence), 'one_time') || '|' ||
                 COALESCE(LOWER(TRIM(p_counterparty_name)), '');

  -- Return SHA-256 hash
  RETURN encode(extensions.digest(v_canonical, 'sha256'), 'hex');
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION generate_instrument_fingerprint TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE authorizing_instruments IS
  'Ledger-adjacent representations of financial authorization. Subordinate to the ledger, immutable, used for validation and audit.';

COMMENT ON COLUMN authorizing_instruments.external_ref IS
  'External reference ID (PO number, contract ID from another system)';

COMMENT ON COLUMN authorizing_instruments.fingerprint IS
  'Deterministic SHA-256 hash of extracted terms for deduplication';

COMMENT ON COLUMN authorizing_instruments.extracted_terms IS
  'Financial authorization terms: amount (cents), currency, cadence, counterparty_name';
