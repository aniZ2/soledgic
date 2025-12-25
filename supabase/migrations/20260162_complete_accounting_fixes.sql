-- Migration: Complete Accounting Integrity Fixes (Continuation)
-- ============================================================================
-- This migration continues from 20260161 which partially completed.
-- It consolidates ALL remaining duplicate accounts and adds the constraint.
-- ============================================================================

-- ============================================================================
-- PART 1: Clean up ALL remaining duplicate accounts
-- ============================================================================

CREATE OR REPLACE FUNCTION consolidate_all_duplicate_accounts()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_primary_id UUID;
  v_duplicate_ids UUID[];
BEGIN
  -- For each ledger, for each account type that has duplicates (where entity_id IS NULL)
  FOR r IN 
    SELECT ledger_id, account_type, COUNT(*) as cnt
    FROM accounts
    WHERE entity_id IS NULL
    GROUP BY ledger_id, account_type
    HAVING COUNT(*) > 1
  LOOP
    -- Find the account with the most entries (or oldest if no entries)
    SELECT a.id INTO v_primary_id
    FROM accounts a
    LEFT JOIN entries e ON e.account_id = a.id
    WHERE a.ledger_id = r.ledger_id 
      AND a.account_type = r.account_type
      AND a.entity_id IS NULL
    GROUP BY a.id, a.created_at
    ORDER BY COUNT(e.id) DESC, a.created_at ASC
    LIMIT 1;
    
    IF v_primary_id IS NOT NULL THEN
      -- Get list of duplicate account IDs
      SELECT array_agg(id) INTO v_duplicate_ids
      FROM accounts 
      WHERE ledger_id = r.ledger_id 
        AND account_type = r.account_type 
        AND entity_id IS NULL
        AND id != v_primary_id;
      
      IF v_duplicate_ids IS NOT NULL AND array_length(v_duplicate_ids, 1) > 0 THEN
        -- Update all entries pointing to duplicate accounts to point to primary
        UPDATE entries 
        SET account_id = v_primary_id
        WHERE account_id = ANY(v_duplicate_ids);
        
        -- Update tax_buckets references
        UPDATE tax_buckets 
        SET account_id = v_primary_id
        WHERE account_id = ANY(v_duplicate_ids);
        
        -- Update any other tables that might reference accounts
        -- payouts table
        UPDATE payouts 
        SET account_id = v_primary_id
        WHERE account_id = ANY(v_duplicate_ids);
        
        -- Delete the duplicate accounts
        DELETE FROM accounts 
        WHERE id = ANY(v_duplicate_ids);
          
        RAISE NOTICE 'Consolidated % % accounts for ledger %', r.cnt, r.account_type, r.ledger_id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Run the consolidation
SELECT consolidate_all_duplicate_accounts();

-- Drop the function after use
DROP FUNCTION consolidate_all_duplicate_accounts();

-- ============================================================================
-- PART 2: Verify no more duplicates exist
-- ============================================================================

DO $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT ledger_id, account_type
    FROM accounts
    WHERE entity_id IS NULL
    GROUP BY ledger_id, account_type
    HAVING COUNT(*) > 1
  ) dups;
  
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Still have % duplicate account type combinations!', v_dup_count;
  END IF;
  
  RAISE NOTICE 'No duplicate accounts remain - safe to add constraint';
END;
$$;

-- ============================================================================
-- PART 3: Add unique constraint to prevent future duplicates
-- ============================================================================

-- Drop if exists (from failed previous attempt)
DROP INDEX IF EXISTS unique_ledger_account_type_no_entity;

-- Add partial unique constraint for accounts without entity_id
CREATE UNIQUE INDEX unique_ledger_account_type_no_entity 
ON accounts (ledger_id, account_type) 
WHERE entity_id IS NULL;

-- ============================================================================
-- PART 4: Create/update the safe_void_invoice function
-- ============================================================================

CREATE OR REPLACE FUNCTION safe_void_invoice(
  p_invoice_id UUID,
  p_ledger_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  reversal_transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_reversal_tx_id UUID;
  v_amount_to_reverse NUMERIC;
BEGIN
  -- Lock the invoice row to prevent concurrent modifications
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND ledger_id = p_ledger_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invoice not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Check if already void
  IF v_invoice.status = 'void' THEN
    RETURN QUERY SELECT false, 'Invoice is already void'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Cannot void fully paid invoices
  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT false, 'Cannot void a fully paid invoice. Issue a credit memo instead.'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Get AR and Revenue accounts
  SELECT id INTO v_ar_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'accounts_receivable' AND entity_id IS NULL
  LIMIT 1;
  
  SELECT id INTO v_revenue_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'revenue' AND entity_id IS NULL
  LIMIT 1;
  
  -- Calculate amount to reverse (unpaid portion)
  v_amount_to_reverse := v_invoice.amount_due / 100.0;
  
  -- Create reversal transaction if there's an amount to reverse
  IF v_amount_to_reverse > 0 AND v_ar_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
    INSERT INTO transactions (
      ledger_id, transaction_type, reference_id, reference_type,
      description, amount, currency, status, metadata
    ) VALUES (
      p_ledger_id, 'invoice_void', 'VOID-' || v_invoice.invoice_number, 'void',
      'Void: Invoice ' || v_invoice.invoice_number, v_amount_to_reverse,
      v_invoice.currency, 'completed',
      jsonb_build_object(
        'original_invoice_id', v_invoice.id,
        'original_transaction_id', v_invoice.transaction_id,
        'reason', COALESCE(p_reason, 'Voided by user')
      )
    )
    RETURNING id INTO v_reversal_tx_id;
    
    -- Create reversal entries: Credit AR, Debit Revenue
    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES 
      (v_reversal_tx_id, v_ar_account_id, 'credit', v_amount_to_reverse),
      (v_reversal_tx_id, v_revenue_account_id, 'debit', v_amount_to_reverse);
  END IF;
  
  -- Update invoice status atomically
  UPDATE invoices
  SET status = 'void',
      voided_at = NOW(),
      void_reason = p_reason
  WHERE id = p_invoice_id;
  
  RETURN QUERY SELECT true, 'Invoice voided successfully'::TEXT, v_reversal_tx_id;
END;
$$;

-- ============================================================================
-- PART 5: Recalculate all account balances from entries
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_all_balances()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Reset all balances
  UPDATE accounts SET balance = 0;
  
  -- Recalculate from entries
  WITH balance_calc AS (
    SELECT 
      e.account_id,
      a.account_type,
      SUM(
        CASE 
          -- Debit-normal accounts: debits increase, credits decrease
          WHEN a.account_type IN (
            'cash', 'bank', 'bank_account', 'petty_cash', 'undeposited_funds',
            'accounts_receivable', 'inventory', 'prepaid_expense', 'fixed_asset',
            'property', 'equipment', 'asset', 'other_asset',
            'expense', 'processing_fees', 'cost_of_goods_sold', 'cogs',
            'payroll', 'rent', 'utilities', 'insurance', 'depreciation',
            'taxes', 'interest_expense', 'other_expense', 'loss',
            'owner_draw', 'refund_reserve', 'tax_reserve', 'reserve'
          ) THEN
            CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
          -- Credit-normal accounts: credits increase, debits decrease
          ELSE
            CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
        END
      ) as calculated_balance
    FROM entries e
    JOIN accounts a ON e.account_id = a.id
    JOIN transactions t ON e.transaction_id = t.id
    WHERE t.status = 'completed'
    GROUP BY e.account_id, a.account_type
  )
  UPDATE accounts a
  SET balance = COALESCE(bc.calculated_balance, 0),
      updated_at = NOW()
  FROM balance_calc bc
  WHERE a.id = bc.account_id;
  
  RAISE NOTICE 'All account balances recalculated from entries';
END;
$$;

-- Run the recalculation
SELECT recalculate_all_balances();

-- ============================================================================
-- PART 6: Verify ledger balance
-- ============================================================================

DO $$
DECLARE
  v_ledger RECORD;
  v_debits NUMERIC;
  v_credits NUMERIC;
BEGIN
  FOR v_ledger IN SELECT DISTINCT ledger_id FROM transactions LOOP
    SELECT 
      COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)
    INTO v_debits, v_credits
    FROM entries e
    JOIN transactions t ON e.transaction_id = t.id
    WHERE t.ledger_id = v_ledger.ledger_id AND t.status = 'completed';
    
    IF ABS(v_debits - v_credits) > 0.01 THEN
      RAISE WARNING 'Ledger % is unbalanced: debits=%, credits=%, diff=%', 
        v_ledger.ledger_id, v_debits, v_credits, v_debits - v_credits;
    ELSE
      RAISE NOTICE 'Ledger % is balanced: debits=credits=%', v_ledger.ledger_id, v_debits;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 7: Add get_or_create_account helper
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_ledger_account(
  p_ledger_id UUID,
  p_account_type TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_name TEXT;
BEGIN
  v_name := COALESCE(p_name, INITCAP(REPLACE(p_account_type, '_', ' ')));
  
  -- Try to find existing account
  SELECT id INTO v_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = p_account_type
    AND entity_id IS NULL
  LIMIT 1;
  
  -- Create if not exists (with ON CONFLICT for the unique index)
  IF v_account_id IS NULL THEN
    BEGIN
      INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
      VALUES (p_ledger_id, p_account_type, 'business', v_name, NULL)
      RETURNING id INTO v_account_id;
    EXCEPTION WHEN unique_violation THEN
      -- Race condition: another process created it, fetch it
      SELECT id INTO v_account_id
      FROM accounts
      WHERE ledger_id = p_ledger_id
        AND account_type = p_account_type
        AND entity_id IS NULL
      LIMIT 1;
    END;
  END IF;
  
  RETURN v_account_id;
END;
$$;

COMMENT ON FUNCTION get_or_create_ledger_account IS 
'Gets or creates a ledger account of the specified type. Thread-safe with unique constraint handling.';
