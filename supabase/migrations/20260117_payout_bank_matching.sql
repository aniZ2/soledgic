-- Soledgic: Stripe Payout to Bank Deposit Matching
-- Prevents double-counting when Stripe payout appears in bank feed

-- ============================================================================
-- ADD MATCHING FIELDS TO TRACK PAYOUT ↔ DEPOSIT LINKS
-- ============================================================================

-- Add column to track which bank transaction matches a Stripe payout
ALTER TABLE plaid_transactions 
ADD COLUMN IF NOT EXISTS stripe_payout_id TEXT,
ADD COLUMN IF NOT EXISTS is_stripe_payout BOOLEAN DEFAULT false;

-- Add column to track which bank deposit matches a Stripe payout
ALTER TABLE stripe_transactions 
ADD COLUMN IF NOT EXISTS bank_transaction_id UUID REFERENCES plaid_transactions(id),
ADD COLUMN IF NOT EXISTS bank_matched_at TIMESTAMPTZ;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_plaid_stripe_payout ON plaid_transactions(stripe_payout_id) WHERE stripe_payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_bank_match ON stripe_transactions(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;

-- ============================================================================
-- AUTO-MATCH FUNCTION: Stripe Payout ↔ Bank Deposit
-- ============================================================================
-- This function finds bank deposits that match Stripe payouts by:
-- 1. Amount (exact match)
-- 2. Date (within 3 days of payout arrival_date)
-- 3. Description contains "STRIPE" or payout ID

CREATE OR REPLACE FUNCTION match_stripe_payouts_to_bank(p_ledger_id UUID)
RETURNS TABLE (
  matched INTEGER,
  unmatched_payouts INTEGER,
  unmatched_deposits INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_matched INTEGER := 0;
  v_payout RECORD;
  v_bank_txn RECORD;
BEGIN
  -- Find all Stripe payouts that haven't been matched to a bank deposit
  FOR v_payout IN
    SELECT 
      st.id,
      st.stripe_id,
      ABS(st.amount) as amount, -- Payouts are stored as negative
      st.currency,
      st.raw_data->>'arrival_date' as arrival_date,
      (st.raw_data->>'arrival_date')::date as arrival_date_parsed
    FROM stripe_transactions st
    WHERE st.ledger_id = p_ledger_id
      AND st.stripe_type = 'payout'
      AND st.status = 'paid'
      AND st.bank_transaction_id IS NULL
  LOOP
    -- Find matching bank deposit
    -- Criteria: 
    --   1. Same amount (positive in bank = money coming in)
    --   2. Date within 3 days of arrival_date
    --   3. Not already matched to another payout
    --   4. Description suggests Stripe (optional but helps confidence)
    SELECT pt.* INTO v_bank_txn
    FROM plaid_transactions pt
    WHERE pt.ledger_id = p_ledger_id
      AND ABS(pt.amount - v_payout.amount) < 0.01 -- Exact amount match
      AND pt.amount > 0 -- Deposit (positive)
      AND pt.stripe_payout_id IS NULL -- Not already matched
      AND pt.match_status IN ('unmatched', 'needs_review') -- Available for matching
      AND (
        -- Date within 3 days of arrival
        pt.date::date BETWEEN (v_payout.arrival_date_parsed - 3) AND (v_payout.arrival_date_parsed + 3)
      )
    ORDER BY 
      -- Prefer descriptions that mention Stripe
      CASE WHEN UPPER(pt.description) LIKE '%STRIPE%' THEN 0 ELSE 1 END,
      -- Prefer exact date match
      ABS(pt.date::date - v_payout.arrival_date_parsed)
    LIMIT 1;

    IF v_bank_txn.id IS NOT NULL THEN
      -- Match found! Link them together
      
      -- Update Stripe transaction
      UPDATE stripe_transactions 
      SET 
        bank_transaction_id = v_bank_txn.id,
        bank_matched_at = NOW()
      WHERE id = v_payout.id;

      -- Update bank transaction
      UPDATE plaid_transactions
      SET 
        stripe_payout_id = v_payout.stripe_id,
        is_stripe_payout = true,
        match_status = 'matched',
        matched_transaction_id = (
          SELECT transaction_id FROM stripe_transactions WHERE id = v_payout.id
        ),
        match_confidence = 0.95
      WHERE id = v_bank_txn.id;

      v_matched := v_matched + 1;
    END IF;
  END LOOP;

  -- Count remaining unmatched
  RETURN QUERY
  SELECT 
    v_matched as matched,
    (
      SELECT COUNT(*)::INTEGER FROM stripe_transactions 
      WHERE ledger_id = p_ledger_id 
        AND stripe_type = 'payout' 
        AND status = 'paid'
        AND bank_transaction_id IS NULL
    ) as unmatched_payouts,
    (
      SELECT COUNT(*)::INTEGER FROM plaid_transactions
      WHERE ledger_id = p_ledger_id
        AND amount > 0 -- Deposits
        AND stripe_payout_id IS NULL
        AND match_status IN ('unmatched', 'needs_review')
        AND (
          UPPER(COALESCE(name, '')) LIKE '%STRIPE%'
        )
    ) as unmatched_deposits;
END;
$$;

-- ============================================================================
-- TRIGGER: Auto-match when new bank transactions are imported
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_match_stripe_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process deposits that might be Stripe payouts
  IF NEW.amount > 0 AND (
    UPPER(COALESCE(NEW.name, '')) LIKE '%STRIPE%'
  ) THEN
    -- Try to find a matching Stripe payout
    UPDATE plaid_transactions pt
    SET 
      stripe_payout_id = st.stripe_id,
      is_stripe_payout = true,
      match_status = 'matched',
      matched_transaction_id = st.transaction_id,
      match_confidence = 0.95
    FROM stripe_transactions st
    WHERE pt.id = NEW.id
      AND st.ledger_id = NEW.ledger_id
      AND st.stripe_type = 'payout'
      AND st.status = 'paid'
      AND st.bank_transaction_id IS NULL
      AND ABS(st.amount) BETWEEN (NEW.amount - 0.01) AND (NEW.amount + 0.01)
      AND NEW.date::date BETWEEN 
        ((st.raw_data->>'arrival_date')::date - 3) AND 
        ((st.raw_data->>'arrival_date')::date + 3);

    -- Update the Stripe transaction side
    UPDATE stripe_transactions st
    SET 
      bank_transaction_id = NEW.id,
      bank_matched_at = NOW()
    WHERE st.ledger_id = NEW.ledger_id
      AND st.stripe_type = 'payout'
      AND st.status = 'paid'
      AND st.bank_transaction_id IS NULL
      AND ABS(st.amount) BETWEEN (NEW.amount - 0.01) AND (NEW.amount + 0.01)
      AND NEW.date::date BETWEEN 
        ((st.raw_data->>'arrival_date')::date - 3) AND 
        ((st.raw_data->>'arrival_date')::date + 3)
      AND (
        UPPER(COALESCE(NEW.name, '')) LIKE '%STRIPE%'
      );
  END IF;

  RETURN NEW;
END;
$$;

-- Apply trigger
DROP TRIGGER IF EXISTS trg_match_stripe_payout ON plaid_transactions;
CREATE TRIGGER trg_match_stripe_payout
  AFTER INSERT ON plaid_transactions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_match_stripe_payout();

-- ============================================================================
-- VIEW: Reconciliation Overview
-- ============================================================================

CREATE OR REPLACE VIEW v_payout_reconciliation AS
SELECT
  l.id as ledger_id,
  l.business_name,
  
  -- Stripe side
  st.id as stripe_txn_id,
  st.stripe_id as payout_id,
  ABS(st.amount) as payout_amount,
  st.raw_data->>'arrival_date' as expected_arrival,
  st.created_at as payout_created,
  
  -- Bank side  
  pt.id as bank_txn_id,
  pt.name as bank_description,
  pt.amount as bank_amount,
  pt.date as bank_date,
  
  -- Match status
  CASE 
    WHEN st.bank_transaction_id IS NOT NULL THEN 'matched'
    WHEN st.created_at > NOW() - INTERVAL '3 days' THEN 'pending'
    ELSE 'unmatched'
  END as reconciliation_status,
  
  -- Amount discrepancy (should be 0 if matched correctly)
  CASE 
    WHEN pt.id IS NOT NULL THEN ABS(st.amount) - pt.amount
    ELSE NULL
  END as amount_difference

FROM stripe_transactions st
JOIN ledgers l ON st.ledger_id = l.id
LEFT JOIN plaid_transactions pt ON st.bank_transaction_id = pt.id
WHERE st.stripe_type = 'payout'
  AND st.status = 'paid'
ORDER BY st.created_at DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION match_stripe_payouts_to_bank IS 
  'Auto-matches Stripe payouts to bank deposits to prevent double-counting. 
   Matches by amount (exact) and date (within 3 days of arrival_date).';

COMMENT ON VIEW v_payout_reconciliation IS 
  'Shows all Stripe payouts and their matching bank deposits for reconciliation.';
