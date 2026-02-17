-- Soledgic: processor Payout to Bank Deposit Matching
-- Prevents double-counting when processor payout appears in bank feed

-- ============================================================================
-- ADD MATCHING FIELDS TO TRACK PAYOUT ↔ DEPOSIT LINKS
-- ============================================================================

-- Add column to track which bank transaction matches a processor payout
ALTER TABLE bank_aggregator_transactions 
ADD COLUMN IF NOT EXISTS processor_payout_id TEXT,
ADD COLUMN IF NOT EXISTS is_processor_payout BOOLEAN DEFAULT false;

-- Add column to track which bank deposit matches a processor payout
ALTER TABLE processor_transactions 
ADD COLUMN IF NOT EXISTS bank_transaction_id UUID REFERENCES bank_aggregator_transactions(id),
ADD COLUMN IF NOT EXISTS bank_matched_at TIMESTAMPTZ;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_bank_aggregator_processor_payout ON bank_aggregator_transactions(processor_payout_id) WHERE processor_payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_processor_bank_match ON processor_transactions(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;

-- ============================================================================
-- AUTO-MATCH FUNCTION: processor Payout ↔ Bank Deposit
-- ============================================================================
-- This function finds bank deposits that match processor payouts by:
-- 1. Amount (exact match)
-- 2. Date (within 3 days of payout arrival_date)
-- 3. Description contains "processor" or payout ID

CREATE OR REPLACE FUNCTION match_processor_payouts_to_bank(p_ledger_id UUID)
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
  -- Find all processor payouts that haven't been matched to a bank deposit
  FOR v_payout IN
    SELECT 
      st.id,
      st.processor_id,
      ABS(st.amount) as amount, -- Payouts are stored as negative
      st.currency,
      st.raw_data->>'arrival_date' as arrival_date,
      (st.raw_data->>'arrival_date')::date as arrival_date_parsed
    FROM processor_transactions st
    WHERE st.ledger_id = p_ledger_id
      AND st.processor_type = 'payout'
      AND st.status = 'paid'
      AND st.bank_transaction_id IS NULL
  LOOP
    -- Find matching bank deposit
    -- Criteria: 
    --   1. Same amount (positive in bank = money coming in)
    --   2. Date within 3 days of arrival_date
    --   3. Not already matched to another payout
    --   4. Description suggests processor (optional but helps confidence)
    SELECT pt.* INTO v_bank_txn
    FROM bank_aggregator_transactions pt
    WHERE pt.ledger_id = p_ledger_id
      AND ABS(pt.amount - v_payout.amount) < 0.01 -- Exact amount match
      AND pt.amount > 0 -- Deposit (positive)
      AND pt.processor_payout_id IS NULL -- Not already matched
      AND pt.match_status IN ('unmatched', 'needs_review') -- Available for matching
      AND (
        -- Date within 3 days of arrival
        pt.date::date BETWEEN (v_payout.arrival_date_parsed - 3) AND (v_payout.arrival_date_parsed + 3)
      )
    ORDER BY 
      -- Prefer descriptions that mention processor
      CASE WHEN UPPER(pt.description) LIKE '%processor%' THEN 0 ELSE 1 END,
      -- Prefer exact date match
      ABS(pt.date::date - v_payout.arrival_date_parsed)
    LIMIT 1;

    IF v_bank_txn.id IS NOT NULL THEN
      -- Match found! Link them together
      
      -- Update processor transaction
      UPDATE processor_transactions 
      SET 
        bank_transaction_id = v_bank_txn.id,
        bank_matched_at = NOW()
      WHERE id = v_payout.id;

      -- Update bank transaction
      UPDATE bank_aggregator_transactions
      SET 
        processor_payout_id = v_payout.processor_id,
        is_processor_payout = true,
        match_status = 'matched',
        matched_transaction_id = (
          SELECT transaction_id FROM processor_transactions WHERE id = v_payout.id
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
      SELECT COUNT(*)::INTEGER FROM processor_transactions 
      WHERE ledger_id = p_ledger_id 
        AND processor_type = 'payout' 
        AND status = 'paid'
        AND bank_transaction_id IS NULL
    ) as unmatched_payouts,
    (
      SELECT COUNT(*)::INTEGER FROM bank_aggregator_transactions
      WHERE ledger_id = p_ledger_id
        AND amount > 0 -- Deposits
        AND processor_payout_id IS NULL
        AND match_status IN ('unmatched', 'needs_review')
        AND (
          UPPER(COALESCE(name, '')) LIKE '%processor%'
        )
    ) as unmatched_deposits;
END;
$$;

-- ============================================================================
-- TRIGGER: Auto-match when new bank transactions are imported
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_match_processor_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process deposits that might be processor payouts
  IF NEW.amount > 0 AND (
    UPPER(COALESCE(NEW.name, '')) LIKE '%processor%'
  ) THEN
    -- Try to find a matching processor payout
    UPDATE bank_aggregator_transactions pt
    SET 
      processor_payout_id = st.processor_id,
      is_processor_payout = true,
      match_status = 'matched',
      matched_transaction_id = st.transaction_id,
      match_confidence = 0.95
    FROM processor_transactions st
    WHERE pt.id = NEW.id
      AND st.ledger_id = NEW.ledger_id
      AND st.processor_type = 'payout'
      AND st.status = 'paid'
      AND st.bank_transaction_id IS NULL
      AND ABS(st.amount) BETWEEN (NEW.amount - 0.01) AND (NEW.amount + 0.01)
      AND NEW.date::date BETWEEN 
        ((st.raw_data->>'arrival_date')::date - 3) AND 
        ((st.raw_data->>'arrival_date')::date + 3);

    -- Update the processor transaction side
    UPDATE processor_transactions st
    SET 
      bank_transaction_id = NEW.id,
      bank_matched_at = NOW()
    WHERE st.ledger_id = NEW.ledger_id
      AND st.processor_type = 'payout'
      AND st.status = 'paid'
      AND st.bank_transaction_id IS NULL
      AND ABS(st.amount) BETWEEN (NEW.amount - 0.01) AND (NEW.amount + 0.01)
      AND NEW.date::date BETWEEN 
        ((st.raw_data->>'arrival_date')::date - 3) AND 
        ((st.raw_data->>'arrival_date')::date + 3)
      AND (
        UPPER(COALESCE(NEW.name, '')) LIKE '%processor%'
      );
  END IF;

  RETURN NEW;
END;
$$;

-- Apply trigger
DROP TRIGGER IF EXISTS trg_match_processor_payout ON bank_aggregator_transactions;
CREATE TRIGGER trg_match_processor_payout
  AFTER INSERT ON bank_aggregator_transactions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_match_processor_payout();

-- ============================================================================
-- VIEW: Reconciliation Overview
-- ============================================================================

CREATE OR REPLACE VIEW v_payout_reconciliation AS
SELECT
  l.id as ledger_id,
  l.business_name,
  
  -- processor side
  st.id as processor_txn_id,
  st.processor_id as payout_id,
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

FROM processor_transactions st
JOIN ledgers l ON st.ledger_id = l.id
LEFT JOIN bank_aggregator_transactions pt ON st.bank_transaction_id = pt.id
WHERE st.processor_type = 'payout'
  AND st.status = 'paid'
ORDER BY st.created_at DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION match_processor_payouts_to_bank IS 
  'Auto-matches processor payouts to bank deposits to prevent double-counting. 
   Matches by amount (exact) and date (within 3 days of arrival_date).';

COMMENT ON VIEW v_payout_reconciliation IS 
  'Shows all processor payouts and their matching bank deposits for reconciliation.';
