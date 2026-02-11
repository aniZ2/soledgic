-- soledgic: Final Features Migration
-- Adjustment Journals, Transfers, Recurring Expenses, Receipt Rules, Tax Buckets

-- ============================================================================
-- ADJUSTMENT JOURNALS (CPA-style correcting entries)
-- ============================================================================

CREATE TABLE adjustment_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id),  -- The adjustment transaction
  
  -- What it adjusts
  original_transaction_id UUID REFERENCES transactions(id),  -- If correcting specific tx
  adjustment_type TEXT NOT NULL CHECK (
    adjustment_type IN (
      'correction',        -- Fix an error
      'reclassification',  -- Move between accounts/categories
      'accrual',          -- Accrued expense/revenue
      'deferral',         -- Deferred expense/revenue
      'depreciation',     -- Depreciation entry
      'write_off',        -- Bad debt, abandoned asset
      'year_end',         -- Year-end adjustments
      'opening_balance',  -- Set opening balances
      'other'
    )
  ),
  
  -- Required documentation
  reason TEXT NOT NULL,
  supporting_documentation TEXT,  -- Description of docs
  
  -- Who and when
  prepared_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  
  -- Period
  adjustment_date DATE NOT NULL,
  affects_period_start DATE,
  affects_period_end DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_adjustments_ledger ON adjustment_journals(ledger_id);
CREATE INDEX idx_adjustments_date ON adjustment_journals(ledger_id, adjustment_date);
CREATE INDEX idx_adjustments_original ON adjustment_journals(original_transaction_id) 
  WHERE original_transaction_id IS NOT NULL;

ALTER TABLE adjustment_journals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON adjustment_journals
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- INTERNAL TRANSFERS
-- ============================================================================

CREATE TABLE internal_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  
  -- From/To
  from_account_id UUID NOT NULL REFERENCES accounts(id),
  to_account_id UUID NOT NULL REFERENCES accounts(id),
  
  -- Details
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  -- Purpose
  transfer_type TEXT NOT NULL CHECK (
    transfer_type IN (
      'tax_reserve',       -- Set aside for taxes
      'payout_reserve',    -- Set aside for creator payouts
      'owner_draw',        -- Owner taking money out
      'owner_contribution',-- Owner putting money in
      'operating',         -- Between operating accounts
      'savings',           -- Move to savings
      'investment',        -- Investment account
      'other'
    )
  ),
  
  description TEXT,
  
  -- Scheduling
  scheduled_date DATE,
  executed_at TIMESTAMPTZ,
  
  -- Recurring
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,  -- 'monthly', 'quarterly', etc.
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transfers_ledger ON internal_transfers(ledger_id);
CREATE INDEX idx_transfers_date ON internal_transfers(ledger_id, executed_at);

ALTER TABLE internal_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON internal_transfers
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- RECURRING EXPENSES
-- ============================================================================

-- Add recurring fields to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS recurrence_interval TEXT CHECK (
  recurrence_interval IS NULL OR 
  recurrence_interval IN ('weekly', 'monthly', 'quarterly', 'annual')
);

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS recurrence_day INTEGER;  -- Day of month/week

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS recurring_parent_id UUID REFERENCES transactions(id);

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS next_occurrence_date DATE;

-- Track recurring expense templates
CREATE TABLE recurring_expense_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Template details
  name TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  category_id UUID REFERENCES expense_categories(id),
  
  -- Amount
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  is_variable_amount BOOLEAN DEFAULT false,  -- True if amount changes
  
  -- Schedule
  recurrence_interval TEXT NOT NULL CHECK (
    recurrence_interval IN ('weekly', 'monthly', 'quarterly', 'annual')
  ),
  recurrence_day INTEGER,  -- Day of month (1-31) or day of week (1-7)
  start_date DATE NOT NULL,
  end_date DATE,  -- NULL = no end
  
  -- Auto-create
  auto_create BOOLEAN DEFAULT false,  -- Auto-create transactions
  business_purpose TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_created_date DATE,
  next_due_date DATE,
  
  -- Stats
  total_occurrences INTEGER DEFAULT 0,
  total_amount_spent NUMERIC(14,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recurring_templates_ledger ON recurring_expense_templates(ledger_id);
CREATE INDEX idx_recurring_templates_next ON recurring_expense_templates(next_due_date) 
  WHERE is_active = true;

ALTER TABLE recurring_expense_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON recurring_expense_templates
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- RECEIPT ENFORCEMENT RULES
-- ============================================================================

CREATE TABLE receipt_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Rule targeting
  category_id UUID REFERENCES expense_categories(id),  -- NULL = all categories
  
  -- Conditions
  min_amount NUMERIC(14,2),           -- Require receipt above this amount
  always_required BOOLEAN DEFAULT false,  -- Always require regardless of amount
  
  -- Rule details
  rule_name TEXT NOT NULL,
  description TEXT,
  
  -- Enforcement
  enforcement_level TEXT DEFAULT 'warn' CHECK (
    enforcement_level IN ('none', 'warn', 'soft_block', 'hard_block')
  ),
  
  -- IRS basis
  irs_requirement BOOLEAN DEFAULT false,  -- Based on IRS rules
  irs_reference TEXT,  -- e.g., "Publication 463"
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_receipt_rules_ledger ON receipt_rules(ledger_id);
CREATE INDEX idx_receipt_rules_category ON receipt_rules(category_id);

ALTER TABLE receipt_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON receipt_rules
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- TAX BUCKETS / RESERVES
-- ============================================================================

CREATE TABLE tax_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),  -- Linked reserve account
  
  -- Bucket type
  bucket_type TEXT NOT NULL CHECK (
    bucket_type IN (
      'federal_income',
      'state_income', 
      'self_employment',
      'sales_tax',
      'quarterly_estimated',
      'other'
    )
  ),
  
  -- Configuration
  name TEXT NOT NULL,
  target_percentage NUMERIC(5,2),  -- e.g., 25% of profit
  target_amount NUMERIC(14,2),     -- Or fixed amount
  
  -- For state taxes
  state_code TEXT,  -- 'CA', 'NY', etc.
  
  -- Current status
  current_balance NUMERIC(14,2) DEFAULT 0,
  ytd_contributed NUMERIC(14,2) DEFAULT 0,
  ytd_paid_out NUMERIC(14,2) DEFAULT 0,
  
  -- Quarterly tracking
  q1_estimated NUMERIC(14,2) DEFAULT 0,
  q1_paid NUMERIC(14,2) DEFAULT 0,
  q2_estimated NUMERIC(14,2) DEFAULT 0,
  q2_paid NUMERIC(14,2) DEFAULT 0,
  q3_estimated NUMERIC(14,2) DEFAULT 0,
  q3_paid NUMERIC(14,2) DEFAULT 0,
  q4_estimated NUMERIC(14,2) DEFAULT 0,
  q4_paid NUMERIC(14,2) DEFAULT 0,
  
  -- Due dates
  next_payment_due DATE,
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tax_buckets_ledger ON tax_buckets(ledger_id);

ALTER TABLE tax_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON tax_buckets
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- CONTRACTOR / 1099 TRACKING
-- ============================================================================

CREATE TABLE contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Basic info (no SSN - that's in their system or Stripe)
  name TEXT NOT NULL,
  email TEXT,
  company_name TEXT,
  
  -- External references
  stripe_account_id TEXT,
  
  -- W-9 status (we track status, not the actual W-9)
  w9_status TEXT DEFAULT 'not_requested' CHECK (
    w9_status IN ('not_requested', 'requested', 'received', 'verified', 'expired')
  ),
  w9_received_date DATE,
  w9_expires_date DATE,
  
  -- Address (for 1099, not payment)
  address_on_file BOOLEAN DEFAULT false,
  
  -- Payment tracking
  ytd_payments NUMERIC(14,2) DEFAULT 0,
  lifetime_payments NUMERIC(14,2) DEFAULT 0,
  
  -- 1099 threshold tracking
  needs_1099 BOOLEAN DEFAULT false,  -- Set true when >= $600
  last_1099_year INTEGER,
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, email)
);

CREATE INDEX idx_contractors_ledger ON contractors(ledger_id);
CREATE INDEX idx_contractors_1099 ON contractors(ledger_id, needs_1099) WHERE needs_1099 = true;

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON contractors
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- Contractor payments (links transactions to contractors)
CREATE TABLE contractor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id),
  
  -- Payment details
  amount NUMERIC(14,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT,
  payment_reference TEXT,
  
  -- For 1099
  tax_year INTEGER NOT NULL,
  included_in_1099 BOOLEAN DEFAULT false,
  
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contractor_payments_contractor ON contractor_payments(contractor_id);
CREATE INDEX idx_contractor_payments_year ON contractor_payments(ledger_id, tax_year);

ALTER TABLE contractor_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON contractor_payments
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- BUDGET ENVELOPES
-- ============================================================================

CREATE TABLE budget_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- What it covers
  name TEXT NOT NULL,
  category_id UUID REFERENCES expense_categories(id),  -- NULL = all expenses
  
  -- Budget
  budget_amount NUMERIC(14,2) NOT NULL,
  budget_period TEXT NOT NULL CHECK (
    budget_period IN ('weekly', 'monthly', 'quarterly', 'annual')
  ),
  
  -- Rollover
  allow_rollover BOOLEAN DEFAULT false,
  rollover_amount NUMERIC(14,2) DEFAULT 0,
  
  -- Current period tracking
  current_period_start DATE,
  current_period_spent NUMERIC(14,2) DEFAULT 0,
  current_period_remaining NUMERIC(14,2),
  
  -- Alerts
  alert_at_percentage INTEGER DEFAULT 80,  -- Alert at 80% spent
  alert_email TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_budgets_ledger ON budget_envelopes(ledger_id);
CREATE INDEX idx_budgets_category ON budget_envelopes(category_id);

ALTER TABLE budget_envelopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON budget_envelopes
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- RUNWAY / FORECASTING
-- ============================================================================

CREATE TABLE runway_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Snapshot date
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Current state
  cash_balance NUMERIC(14,2) NOT NULL,
  accounts_receivable NUMERIC(14,2) DEFAULT 0,
  accounts_payable NUMERIC(14,2) DEFAULT 0,
  
  -- Averages (trailing 3 months)
  avg_monthly_revenue NUMERIC(14,2),
  avg_monthly_expenses NUMERIC(14,2),
  avg_monthly_burn NUMERIC(14,2),  -- expenses - revenue if negative
  
  -- Runway calculation
  runway_months NUMERIC(5,1),  -- How many months until cash = 0
  
  -- Projections
  projected_cash_3mo NUMERIC(14,2),
  projected_cash_6mo NUMERIC(14,2),
  projected_cash_12mo NUMERIC(14,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_runway_ledger ON runway_snapshots(ledger_id);
CREATE INDEX idx_runway_date ON runway_snapshots(ledger_id, snapshot_date DESC);

ALTER TABLE runway_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON runway_snapshots
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Calculate runway
CREATE OR REPLACE FUNCTION calculate_runway(p_ledger_id UUID)
RETURNS TABLE (
  cash_balance NUMERIC(14,2),
  avg_monthly_revenue NUMERIC(14,2),
  avg_monthly_expenses NUMERIC(14,2),
  avg_monthly_burn NUMERIC(14,2),
  runway_months NUMERIC(5,1)
) AS $$
DECLARE
  v_cash NUMERIC(14,2);
  v_revenue NUMERIC(14,2);
  v_expenses NUMERIC(14,2);
  v_burn NUMERIC(14,2);
  v_runway NUMERIC(5,1);
BEGIN
  -- Get cash balance
  SELECT COALESCE(SUM(balance), 0) INTO v_cash
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'cash';
  
  -- Get 3-month average revenue
  SELECT COALESCE(AVG(monthly_total), 0) INTO v_revenue
  FROM (
    SELECT DATE_TRUNC('month', created_at) as month, SUM(amount) as monthly_total
    FROM transactions
    WHERE ledger_id = p_ledger_id
      AND transaction_type = 'sale'
      AND status = 'completed'
      AND created_at >= NOW() - INTERVAL '3 months'
    GROUP BY DATE_TRUNC('month', created_at)
  ) monthly;
  
  -- Get 3-month average expenses
  SELECT COALESCE(AVG(monthly_total), 0) INTO v_expenses
  FROM (
    SELECT DATE_TRUNC('month', created_at) as month, SUM(amount) as monthly_total
    FROM transactions
    WHERE ledger_id = p_ledger_id
      AND transaction_type = 'expense'
      AND status = 'completed'
      AND created_at >= NOW() - INTERVAL '3 months'
    GROUP BY DATE_TRUNC('month', created_at)
  ) monthly;
  
  -- Calculate burn rate
  v_burn := v_expenses - v_revenue;
  
  -- Calculate runway
  IF v_burn > 0 THEN
    v_runway := v_cash / v_burn;
  ELSE
    v_runway := 999;  -- Infinite runway (profitable)
  END IF;
  
  RETURN QUERY SELECT v_cash, v_revenue, v_expenses, v_burn, v_runway;
END;
$$ LANGUAGE plpgsql;

-- Update contractor YTD when payment recorded
CREATE OR REPLACE FUNCTION update_contractor_ytd()
RETURNS TRIGGER AS $$
BEGIN
  -- Update contractor totals
  UPDATE contractors
  SET 
    ytd_payments = (
      SELECT COALESCE(SUM(amount), 0)
      FROM contractor_payments
      WHERE contractor_id = NEW.contractor_id
        AND tax_year = EXTRACT(YEAR FROM CURRENT_DATE)
    ),
    lifetime_payments = lifetime_payments + NEW.amount,
    needs_1099 = (
      SELECT COALESCE(SUM(amount), 0) >= 600
      FROM contractor_payments
      WHERE contractor_id = NEW.contractor_id
        AND tax_year = EXTRACT(YEAR FROM CURRENT_DATE)
    ),
    updated_at = NOW()
  WHERE id = NEW.contractor_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_contractor_payment_ytd
  AFTER INSERT ON contractor_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_contractor_ytd();

-- ============================================================================
-- SEED: Default receipt rules
-- ============================================================================

CREATE OR REPLACE FUNCTION initialize_receipt_rules(p_ledger_id UUID)
RETURNS void AS $$
BEGIN
  -- IRS: Meals always need receipts
  INSERT INTO receipt_rules (ledger_id, category_id, rule_name, always_required, irs_requirement, irs_reference, enforcement_level)
  SELECT p_ledger_id, id, 'Meals require receipts', true, true, 'Publication 463', 'warn'
  FROM expense_categories WHERE ledger_id = p_ledger_id AND code = 'meals';
  
  -- IRS: Travel always needs receipts
  INSERT INTO receipt_rules (ledger_id, category_id, rule_name, always_required, irs_requirement, irs_reference, enforcement_level)
  SELECT p_ledger_id, id, 'Travel requires receipts', true, true, 'Publication 463', 'warn'
  FROM expense_categories WHERE ledger_id = p_ledger_id AND code = 'travel';
  
  -- IRS: Lodging always needs receipts
  INSERT INTO receipt_rules (ledger_id, category_id, rule_name, always_required, irs_requirement, irs_reference, enforcement_level)
  SELECT p_ledger_id, id, 'Lodging requires receipts', true, true, 'Publication 463', 'warn'
  FROM expense_categories WHERE ledger_id = p_ledger_id AND code = 'lodging';
  
  -- General: Anything over $75 needs receipt
  INSERT INTO receipt_rules (ledger_id, rule_name, min_amount, irs_requirement, irs_reference, enforcement_level)
  VALUES (p_ledger_id, 'Expenses over $75 require receipts', 75, true, 'Publication 463', 'warn');
  
  -- Vehicle expenses
  INSERT INTO receipt_rules (ledger_id, category_id, rule_name, always_required, enforcement_level)
  SELECT p_ledger_id, id, 'Vehicle expenses require receipts', true, 'warn'
  FROM expense_categories WHERE ledger_id = p_ledger_id AND code = 'vehicle';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED: Default tax buckets
-- ============================================================================

CREATE OR REPLACE FUNCTION initialize_tax_buckets(p_ledger_id UUID)
RETURNS void AS $$
DECLARE
  v_tax_reserve_account UUID;
BEGIN
  -- Get or create tax reserve account
  SELECT id INTO v_tax_reserve_account
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'tax_reserve';
  
  -- Federal income tax (25% estimate)
  INSERT INTO tax_buckets (ledger_id, account_id, bucket_type, name, target_percentage)
  VALUES (p_ledger_id, v_tax_reserve_account, 'federal_income', 'Federal Income Tax', 25);
  
  -- Self-employment tax (15.3%)
  INSERT INTO tax_buckets (ledger_id, account_id, bucket_type, name, target_percentage)
  VALUES (p_ledger_id, v_tax_reserve_account, 'self_employment', 'Self-Employment Tax', 15.3);
  
  -- Quarterly estimated
  INSERT INTO tax_buckets (ledger_id, account_id, bucket_type, name, target_percentage)
  VALUES (p_ledger_id, v_tax_reserve_account, 'quarterly_estimated', 'Quarterly Estimated Taxes', 30);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

CREATE TRIGGER trigger_recurring_templates_updated
  BEFORE UPDATE ON recurring_expense_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_receipt_rules_updated
  BEFORE UPDATE ON receipt_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_tax_buckets_updated
  BEFORE UPDATE ON tax_buckets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_contractors_updated
  BEFORE UPDATE ON contractors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_budgets_updated
  BEFORE UPDATE ON budget_envelopes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
