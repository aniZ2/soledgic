-- soledgic: Ledger Modes
-- Two initialization paths: 'standard' (freelancers, SMBs) vs 'marketplace' (creator platforms)

-- ============================================================================
-- 1. ADD LEDGER MODE TO LEDGERS TABLE
-- ============================================================================

ALTER TABLE ledgers 
ADD COLUMN IF NOT EXISTS ledger_mode TEXT DEFAULT 'standard' CHECK (
  ledger_mode IN ('standard', 'marketplace')
);

-- Rename platform_name to business_name (more universal)
ALTER TABLE ledgers 
RENAME COLUMN platform_name TO business_name;

-- Update settings JSONB to have mode-specific defaults
COMMENT ON COLUMN ledgers.settings IS 'Mode-specific settings. Standard: {tax_rate, fiscal_year_start}. Marketplace: {default_split_percent, min_payout_amount, payout_schedule}';

-- ============================================================================
-- 2. EXTEND ACCOUNT TYPES FOR STANDARD MODE
-- ============================================================================

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check CHECK (
  account_type IN (
    -- === UNIVERSAL (both modes) ===
    'cash',                  -- Bank/cash accounts
    'tax_reserve',           -- Tax withholding reserve
    'expense',               -- Operating expenses
    'owner_equity',          -- Owner's equity
    'owner_draw',            -- Owner's draws/distributions
    'accounts_payable',      -- Bills owed
    'accounts_receivable',   -- Money owed to you
    'credit_card',           -- Credit card liability
    
    -- === STANDARD MODE (freelancers, SMBs) ===
    'revenue',               -- Sales/service revenue
    'other_income',          -- Interest, misc income
    'cost_of_goods',         -- COGS for product businesses
    'inventory',             -- Inventory asset
    'fixed_asset',           -- Equipment, vehicles, etc.
    'accumulated_depreciation', -- Contra-asset
    'loan_payable',          -- Business loans
    'payroll_liability',     -- Payroll taxes owed
    'sales_tax_payable',     -- Sales tax collected
    
    -- === MARKETPLACE MODE (creator platforms) ===
    'platform_revenue',      -- Platform's cut
    'creator_balance',       -- Individual creator balances (liability)
    'creator_pool',          -- Aggregate creator liability
    'processing_fees',       -- Payment processor fees
    'refund_reserve'         -- Reserve for refunds
  )
);

-- ============================================================================
-- 3. EXTEND ENTITY TYPES
-- ============================================================================

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_entity_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_entity_type_check CHECK (
  entity_type IS NULL OR entity_type IN (
    -- Universal
    'business',              -- The business itself
    'reserve',               -- Reserve accounts
    
    -- Standard mode
    'customer',              -- Customers (for A/R)
    'vendor',                -- Vendors (for A/P)
    'employee',              -- Employees
    
    -- Marketplace mode
    'platform',              -- The platform
    'creator'                -- Creators/payees
  )
);

-- ============================================================================
-- 4. STANDARD MODE: DEFAULT ACCOUNTS
-- ============================================================================

CREATE OR REPLACE FUNCTION initialize_standard_accounts(p_ledger_id UUID)
RETURNS void AS $$
BEGIN
  -- Asset accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'cash', 'business', 'Business Checking'),
    (p_ledger_id, 'accounts_receivable', 'business', 'Accounts Receivable');
  
  -- Liability accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'accounts_payable', 'business', 'Accounts Payable'),
    (p_ledger_id, 'credit_card', 'business', 'Business Credit Card'),
    (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve'),
    (p_ledger_id, 'sales_tax_payable', 'business', 'Sales Tax Payable');
  
  -- Equity accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'owner_equity', 'business', 'Owner''s Equity'),
    (p_ledger_id, 'owner_draw', 'business', 'Owner''s Draws');
  
  -- Revenue accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'revenue', 'business', 'Sales Revenue'),
    (p_ledger_id, 'other_income', 'business', 'Other Income');
  
  -- Expense account
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'expense', 'business', 'Operating Expenses');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. MARKETPLACE MODE: DEFAULT ACCOUNTS (existing logic, refactored)
-- ============================================================================

CREATE OR REPLACE FUNCTION initialize_marketplace_accounts(p_ledger_id UUID)
RETURNS void AS $$
BEGIN
  -- Platform accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'cash', 'platform', 'Cash / Bank'),
    (p_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue'),
    (p_ledger_id, 'processing_fees', 'platform', 'Processing Fees');
  
  -- Creator liability
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'creator_pool', 'platform', 'Creator Liability Pool');
  
  -- Reserves
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Withholding Reserve'),
    (p_ledger_id, 'refund_reserve', 'reserve', 'Refund Reserve');
  
  -- Expense accounts (platforms have expenses too)
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'expense', 'platform', 'Operating Expenses'),
    (p_ledger_id, 'owner_equity', 'platform', 'Owner''s Equity'),
    (p_ledger_id, 'owner_draw', 'platform', 'Owner''s Draws'),
    (p_ledger_id, 'accounts_payable', 'platform', 'Accounts Payable');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. UNIFIED INITIALIZATION (replaces old function)
-- ============================================================================

-- Drop old function first
DROP FUNCTION IF EXISTS initialize_ledger_accounts(UUID);

CREATE OR REPLACE FUNCTION initialize_ledger_accounts(p_ledger_id UUID)
RETURNS void AS $$
DECLARE
  v_mode TEXT;
BEGIN
  -- Get ledger mode
  SELECT ledger_mode INTO v_mode
  FROM ledgers
  WHERE id = p_ledger_id;
  
  -- Initialize based on mode
  IF v_mode = 'marketplace' THEN
    PERFORM initialize_marketplace_accounts(p_ledger_id);
  ELSE
    -- Default to standard
    PERFORM initialize_standard_accounts(p_ledger_id);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. UPDATE AUTO-CREATE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_ledger_accounts()
RETURNS TRIGGER AS $$
BEGIN
  -- Initialize accounts based on mode
  PERFORM initialize_ledger_accounts(NEW.id);
  
  -- Initialize expense categories (both modes need this)
  PERFORM initialize_expense_categories(NEW.id);
  
  -- Initialize expense accounts (both modes)
  PERFORM initialize_expense_accounts(NEW.id);
  
  -- Initialize receipt rules (both modes)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'initialize_receipt_rules') THEN
    PERFORM initialize_receipt_rules(NEW.id);
  END IF;
  
  -- Initialize tax buckets (both modes)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'initialize_tax_buckets') THEN
    PERFORM initialize_tax_buckets(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. MODE-SPECIFIC DEFAULT SETTINGS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_default_settings(p_mode TEXT)
RETURNS JSONB AS $$
BEGIN
  IF p_mode = 'marketplace' THEN
    RETURN '{
      "default_split_percent": 80,
      "platform_fee_percent": 20,
      "min_payout_amount": 10.00,
      "payout_schedule": "manual",
      "tax_withholding_percent": 0,
      "auto_create_creator_accounts": true
    }'::jsonb;
  ELSE
    -- Standard mode
    RETURN '{
      "fiscal_year_start": "01-01",
      "default_tax_rate": 25,
      "track_sales_tax": false,
      "sales_tax_rate": 0,
      "invoice_prefix": "INV-",
      "invoice_next_number": 1001
    }'::jsonb;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to set default settings based on mode
CREATE OR REPLACE FUNCTION set_default_settings()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set if settings is empty or default
  IF NEW.settings IS NULL OR NEW.settings = '{}'::jsonb OR NEW.settings = '{
    "default_platform_fee_percent": 20,
    "tax_withholding_percent": 0,
    "min_payout_amount": 10.00,
    "payout_schedule": "manual"
  }'::jsonb THEN
    NEW.settings := get_default_settings(NEW.ledger_mode);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_default_settings ON ledgers;
CREATE TRIGGER trigger_set_default_settings
  BEFORE INSERT ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION set_default_settings();

-- ============================================================================
-- 9. EXTEND TRANSACTION TYPES FOR STANDARD MODE
-- ============================================================================

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check CHECK (
  transaction_type IN (
    -- === UNIVERSAL ===
    'adjustment',            -- Manual adjustment
    'transfer',              -- Internal transfer
    'reversal',              -- Correction/reversal
    'expense',               -- Expense payment
    'owner_contribution',    -- Owner putting money in
    'owner_draw',            -- Owner taking money out
    'bill_payment',          -- Pay a bill
    
    -- === STANDARD MODE ===
    'income',                -- Revenue received
    'invoice',               -- Invoice issued (A/R)
    'invoice_payment',       -- Payment received on invoice
    'bill',                  -- Bill received (A/P)
    'sales_tax_payment',     -- Sales tax remittance
    'loan_payment',          -- Loan payment
    'payroll',               -- Payroll run
    
    -- === MARKETPLACE MODE ===
    'sale',                  -- Sale with creator split
    'payout',                -- Payment to creator
    'refund',                -- Refund to customer
    'fee'                    -- Processing fee
  )
);

-- ============================================================================
-- 10. HELPER: CHECK LEDGER MODE
-- ============================================================================

CREATE OR REPLACE FUNCTION is_marketplace_ledger(p_ledger_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_mode TEXT;
BEGIN
  SELECT ledger_mode INTO v_mode
  FROM ledgers
  WHERE id = p_ledger_id;
  
  RETURN v_mode = 'marketplace';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION is_standard_ledger(p_ledger_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_mode TEXT;
BEGIN
  SELECT ledger_mode INTO v_mode
  FROM ledgers
  WHERE id = p_ledger_id;
  
  RETURN v_mode = 'standard' OR v_mode IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. MIGRATE EXISTING LEDGERS
-- ============================================================================

-- Set existing ledgers to marketplace mode (they were created with old schema)
UPDATE ledgers 
SET ledger_mode = 'marketplace'
WHERE ledger_mode IS NULL;

-- ============================================================================
-- 12. ADD INDEX FOR MODE QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ledgers_mode ON ledgers(ledger_mode);
