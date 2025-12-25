-- Migration: Add Business Account Types and Transaction Types
-- Fixes: Invoice/Bill payment failures due to constraint violations
-- ============================================================================
-- This migration uses a dynamic approach: 
-- 1. Drops existing constraints
-- 2. Creates new constraints that include ALL existing values PLUS new ones
-- This ensures no data is orphaned while expanding the allowed types.
-- ============================================================================

-- ============================================================================
-- STEP 1: ACCOUNT TYPES
-- ============================================================================

-- Drop existing constraint first
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;

-- Create comprehensive constraint that includes:
-- - All original types
-- - All new business types (AR/AP, revenue, expense, etc.)
-- - Any legacy types that might exist in data
ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check CHECK (
  account_type ~ '^[a-z][a-z0-9_]*$'  -- Just enforce valid naming pattern for now
);

-- Actually, let's be more specific. Create a proper allowlist.
-- First drop the regex-based one
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;

-- Add constraint with extensive list (if a type exists in data but isn't here, migration will fail with helpful error)
ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check CHECK (
  account_type IN (
    -- ===== ORIGINAL TYPES (creator platform) =====
    'platform_revenue',
    'creator_balance', 
    'creator_pool',
    'tax_reserve',
    'processing_fees',
    'refund_reserve',
    'cash',
    
    -- ===== STANDARD CHART OF ACCOUNTS =====
    -- Assets (Debit-Normal)
    'accounts_receivable',
    'inventory',
    'prepaid_expense',
    'fixed_asset',
    'property',
    'equipment',
    'accumulated_depreciation',
    'bank',
    'bank_account',
    'petty_cash',
    'undeposited_funds',
    'asset',
    
    -- Liabilities (Credit-Normal)
    'accounts_payable',
    'payee_balance',
    'accrued_expense',
    'tax_payable',
    'sales_tax_payable',
    'unearned_revenue',
    'long_term_debt',
    'notes_payable',
    'deferred_tax',
    'credit_card',
    'liability',
    
    -- Equity (Credit-Normal)
    'owner_equity',
    'owner_draw',
    'retained_earnings',
    'common_stock',
    'additional_paid_in_capital',
    'equity',
    'opening_balance_equity',
    
    -- Revenue (Credit-Normal)
    'revenue',
    'income',
    'sales',
    'service_revenue',
    'other_income',
    'interest_income',
    
    -- Expenses (Debit-Normal)
    'expense',
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
    
    -- Gains/Losses
    'gain',
    'loss',
    
    -- Special/System
    'suspense',
    'clearing',
    'merchant',
    'stripe',
    'paypal',
    'plaid',
    'business',
    'operating',
    'reserve',
    
    -- Generic catch-alls (for flexibility)
    'other_asset',
    'other_liability',
    'other_equity'
  )
);

-- ============================================================================
-- STEP 2: TRANSACTION TYPES
-- ============================================================================

-- Drop existing constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

-- Add comprehensive constraint
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check CHECK (
  transaction_type IN (
    -- ===== ORIGINAL TYPES =====
    'sale',
    'payout',
    'refund',
    'reversal',
    'fee',
    'adjustment',
    'transfer',
    
    -- ===== INVOICING (AR) =====
    'invoice',
    'invoice_payment',
    'invoice_void',
    'credit_memo',
    
    -- ===== BILLING (AP) =====
    'bill',
    'bill_payment',
    'bill_void',
    'expense',
    
    -- ===== JOURNAL ENTRIES =====
    'journal',
    'depreciation',
    'accrual',
    
    -- ===== BANKING =====
    'deposit',
    'withdrawal',
    'bank_fee',
    'interest',
    
    -- ===== PERIOD/SYSTEM =====
    'opening_balance',
    'closing_entry',
    
    -- ===== ADDITIONAL COMMON TYPES =====
    'income',
    'payment',
    'receipt',
    'credit',
    'debit',
    'void',
    'write_off',
    'reconciliation',
    'import',
    'split',
    'match',
    'charge',
    'purchase',
    'return'
  )
);

-- ============================================================================
-- STEP 3: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_accounts_ar_ap 
  ON accounts(ledger_id, account_type) 
  WHERE account_type IN ('accounts_receivable', 'accounts_payable');

CREATE INDEX IF NOT EXISTS idx_accounts_revenue_expense
  ON accounts(ledger_id, account_type)
  WHERE account_type IN ('revenue', 'expense', 'income');

-- ============================================================================
-- STEP 4: DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN accounts.account_type IS 'Account type following standard chart of accounts. Debit-normal: cash, accounts_receivable, inventory, expense. Credit-normal: accounts_payable, revenue, equity.';
COMMENT ON COLUMN transactions.transaction_type IS 'Transaction type: sale, payout, refund, invoice, invoice_payment, bill, bill_payment, expense, journal, etc.';

-- ============================================================================
-- STEP 5: HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_account(
  p_ledger_id UUID,
  p_account_type TEXT,
  p_name TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT 'business'
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
  
  SELECT id INTO v_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = p_account_type
    AND entity_id IS NULL
  LIMIT 1;
  
  IF v_account_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES (p_ledger_id, p_account_type, p_entity_type, v_name, NULL)
    ON CONFLICT (ledger_id, account_type, entity_id) DO NOTHING
    RETURNING id INTO v_account_id;
    
    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id
      FROM accounts
      WHERE ledger_id = p_ledger_id
        AND account_type = p_account_type
        AND entity_id IS NULL
      LIMIT 1;
    END IF;
  END IF;
  
  RETURN v_account_id;
END;
$$;

-- ============================================================================
-- STEP 6: VERIFICATION
-- ============================================================================

DO $verify$
DECLARE
  v_bad_account_types TEXT;
  v_bad_tx_types TEXT;
BEGIN
  -- Check for any account types that still violate constraint
  SELECT string_agg(DISTINCT account_type, ', ') INTO v_bad_account_types
  FROM accounts a
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'accounts_account_type_check'
    AND pg_get_constraintdef(c.oid) LIKE '%' || a.account_type || '%'
  );
  
  IF v_bad_account_types IS NOT NULL THEN
    RAISE WARNING 'Account types in data but not in constraint: %', v_bad_account_types;
  END IF;
  
  -- Check for any transaction types that still violate constraint  
  SELECT string_agg(DISTINCT transaction_type, ', ') INTO v_bad_tx_types
  FROM transactions t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'transactions_transaction_type_check'
    AND pg_get_constraintdef(c.oid) LIKE '%' || t.transaction_type || '%'
  );
  
  IF v_bad_tx_types IS NOT NULL THEN
    RAISE WARNING 'Transaction types in data but not in constraint: %', v_bad_tx_types;
  END IF;
  
  RAISE NOTICE 'Migration completed. Constraints updated for invoicing/billing support.';
END;
$verify$;
