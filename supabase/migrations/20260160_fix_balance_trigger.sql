-- Migration: Fix Balance Trigger for Debit-Normal Accounts
-- ============================================================================
-- PROBLEM: The update_account_balance() trigger only treats 3 account types
-- as debit-normal (cash, processing_fees, refund_reserve), but accounts_receivable
-- and other asset/expense accounts are ALSO debit-normal.
--
-- This caused AR balances to be stored with inverted signs.
-- ============================================================================

-- Drop and recreate the function with correct logic
CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_type TEXT;
  v_is_debit_normal BOOLEAN;
BEGIN
  -- Get the account type
  SELECT account_type INTO v_account_type
  FROM accounts
  WHERE id = NEW.account_id;
  
  -- Determine if this is a debit-normal or credit-normal account
  -- DEBIT-NORMAL accounts: Debits INCREASE balance, Credits DECREASE balance
  --   - Assets: cash, accounts_receivable, inventory, prepaid_expense, etc.
  --   - Expenses: expense, processing_fees, cost_of_goods_sold, etc.
  -- CREDIT-NORMAL accounts: Credits INCREASE balance, Debits DECREASE balance
  --   - Liabilities: accounts_payable, creator_balance, tax_payable, etc.
  --   - Equity: owner_equity, retained_earnings, etc.
  --   - Revenue: revenue, platform_revenue, income, etc.
  
  v_is_debit_normal := v_account_type IN (
    -- Assets (Debit-Normal)
    'cash',
    'bank',
    'bank_account',
    'petty_cash',
    'undeposited_funds',
    'accounts_receivable',
    'inventory',
    'prepaid_expense',
    'fixed_asset',
    'property',
    'equipment',
    'asset',
    'other_asset',
    
    -- Expenses (Debit-Normal)
    'expense',
    'processing_fees',
    'cost_of_goods_sold',
    'cogs',
    'payroll',
    'rent',
    'utilities',
    'insurance',
    'depreciation',
    'taxes',
    'interest_expense',
    'other_expense',
    'loss',
    
    -- Contra accounts that are debit-normal
    'owner_draw',
    
    -- Reserves that act like assets
    'refund_reserve',
    'tax_reserve',
    'reserve'
  );
  
  -- Apply the correct balance update logic
  IF v_is_debit_normal THEN
    -- Debit-normal: Debits increase, Credits decrease
    IF NEW.entry_type = 'debit' THEN
      UPDATE accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    ELSE
      UPDATE accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    END IF;
  ELSE
    -- Credit-normal: Credits increase, Debits decrease
    IF NEW.entry_type = 'credit' THEN
      UPDATE accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    ELSE
      UPDATE accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    END IF;
  END IF;
  
  -- Update running balance on the entry
  NEW.running_balance := (SELECT balance FROM accounts WHERE id = NEW.account_id);
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX EXISTING DATA: Recalculate all account balances from entries
-- ============================================================================

-- First, reset all account balances to 0
UPDATE accounts SET balance = 0, updated_at = NOW();

-- Then recalculate from entries using correct debit/credit logic
WITH account_types AS (
  SELECT id, account_type,
    CASE WHEN account_type IN (
      'cash', 'bank', 'bank_account', 'petty_cash', 'undeposited_funds',
      'accounts_receivable', 'inventory', 'prepaid_expense', 'fixed_asset',
      'property', 'equipment', 'asset', 'other_asset',
      'expense', 'processing_fees', 'cost_of_goods_sold', 'cogs',
      'payroll', 'rent', 'utilities', 'insurance', 'depreciation',
      'taxes', 'interest_expense', 'other_expense', 'loss',
      'owner_draw', 'refund_reserve', 'tax_reserve', 'reserve'
    ) THEN true ELSE false END as is_debit_normal
  FROM accounts
),
calculated_balances AS (
  SELECT 
    e.account_id,
    at.is_debit_normal,
    SUM(
      CASE 
        WHEN at.is_debit_normal THEN
          CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
        ELSE
          CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
      END
    ) as calculated_balance
  FROM entries e
  JOIN transactions t ON e.transaction_id = t.id
  JOIN account_types at ON e.account_id = at.id
  WHERE t.status = 'completed'
  GROUP BY e.account_id, at.is_debit_normal
)
UPDATE accounts a
SET balance = COALESCE(cb.calculated_balance, 0),
    updated_at = NOW()
FROM calculated_balances cb
WHERE a.id = cb.account_id;

-- ============================================================================
-- VERIFY: Check that balances are now correct
-- ============================================================================

DO $verify$
DECLARE
  v_ar_count INTEGER;
  v_ar_negative INTEGER;
  v_ap_count INTEGER;
  v_ap_positive INTEGER;
BEGIN
  -- AR balances should be positive (money owed TO us)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE balance < 0)
  INTO v_ar_count, v_ar_negative
  FROM accounts WHERE account_type = 'accounts_receivable';
  
  IF v_ar_negative > 0 AND v_ar_count > 0 THEN
    RAISE WARNING 'Some AR accounts still have negative balances: %/%', v_ar_negative, v_ar_count;
  END IF;
  
  -- AP balances should be positive (money owed BY us) 
  -- Note: In our system, AP is credit-normal, so positive = we owe money
  SELECT COUNT(*), COUNT(*) FILTER (WHERE balance > 0)
  INTO v_ap_count, v_ap_positive
  FROM accounts WHERE account_type = 'accounts_payable';
  
  RAISE NOTICE 'Balance recalculation complete.';
  RAISE NOTICE 'AR accounts: %, AP accounts: %', v_ar_count, v_ap_count;
END;
$verify$;
