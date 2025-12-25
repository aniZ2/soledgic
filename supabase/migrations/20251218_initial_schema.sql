-- soledgic: Double-Entry Accounting for Creator Platforms
-- Migration: Initial Schema

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Ledgers: Each customer platform gets one
CREATE TABLE ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  api_key_hash TEXT, -- For secure lookups
  owner_email TEXT NOT NULL,
  webhook_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  settings JSONB DEFAULT '{
    "default_platform_fee_percent": 20,
    "tax_withholding_percent": 0,
    "min_payout_amount": 10.00,
    "payout_schedule": "manual"
  }',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts: Every entity (platform, creator, reserve) gets one
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL CHECK (
    account_type IN (
      'platform_revenue',    -- The platform's cut (e.g., your 20%)
      'creator_balance',     -- Individual creator balances (liability)
      'creator_pool',        -- Aggregate creator liability pool
      'tax_reserve',         -- Tax withholding reserve
      'processing_fees',     -- Payment processor fees
      'refund_reserve',      -- Reserve for potential refunds
      'cash'                 -- Actual bank account balance
    )
  ),
  entity_id TEXT,            -- creator_id, user_id, or NULL for platform accounts
  entity_type TEXT CHECK (entity_type IN ('creator', 'platform', 'reserve', NULL)),
  name TEXT NOT NULL,        -- Human-readable name
  balance NUMERIC(14,2) DEFAULT 0.00,
  currency TEXT DEFAULT 'USD',
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique account per entity per ledger
  UNIQUE(ledger_id, account_type, entity_id)
);

-- Indexes for faster lookups
CREATE INDEX idx_accounts_ledger_type ON accounts(ledger_id, account_type);
CREATE INDEX idx_accounts_entity ON accounts(ledger_id, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_accounts_active ON accounts(ledger_id, is_active) WHERE is_active = true;

-- Transactions: Header for each financial event (IMMUTABLE)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (
    transaction_type IN (
      'sale',           -- Revenue from sale
      'payout',         -- Payment to creator
      'refund',         -- Refund to customer
      'reversal',       -- Correction/reversal of previous transaction
      'fee',            -- Processing fees
      'adjustment',     -- Manual adjustment
      'transfer'        -- Internal transfer between accounts
    )
  ),
  reference_id TEXT,          -- External ID (Stripe payment_intent, etc.)
  reference_type TEXT,        -- 'stripe_payment', 'manual', etc.
  description TEXT,
  amount NUMERIC(14,2) NOT NULL,  -- Total transaction amount
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  reversed_by UUID REFERENCES transactions(id),  -- If reversed, points to reversal tx
  reverses UUID REFERENCES transactions(id),     -- If this is a reversal, points to original
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Transactions are IMMUTABLE - no updated_at
  -- Corrections happen via reversal transactions
  CONSTRAINT no_self_reversal CHECK (id != reverses)
);

-- Indexes for transactions
CREATE INDEX idx_transactions_ledger ON transactions(ledger_id);
CREATE INDEX idx_transactions_type ON transactions(ledger_id, transaction_type);
CREATE INDEX idx_transactions_reference ON transactions(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX idx_transactions_created ON transactions(ledger_id, created_at DESC);
CREATE INDEX idx_transactions_status ON transactions(ledger_id, status);

-- Entries: Individual debit/credit lines (IMMUTABLE)
-- Every transaction has 2+ entries that must sum to zero (double-entry)
CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  running_balance NUMERIC(14,2),  -- Balance after this entry (for audit trail)
  created_at TIMESTAMPTZ DEFAULT NOW()
  
  -- Entries are IMMUTABLE - no updates allowed
);

-- Indexes for entries
CREATE INDEX idx_entries_transaction ON entries(transaction_id);
CREATE INDEX idx_entries_account ON entries(account_id);
CREATE INDEX idx_entries_account_created ON entries(account_id, created_at DESC);

-- ============================================================================
-- PAYOUT MANAGEMENT
-- ============================================================================

-- Payouts: Track actual money leaving the system
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id),  -- Creator account being paid
  transaction_id UUID REFERENCES transactions(id),   -- Link to ledger transaction
  
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  -- Payment details
  payment_method TEXT CHECK (payment_method IN ('stripe', 'paypal', 'bank_transfer', 'manual')),
  payment_reference TEXT,  -- External payment ID
  
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  
  -- Timestamps
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payouts_ledger ON payouts(ledger_id);
CREATE INDEX idx_payouts_account ON payouts(account_id);
CREATE INDEX idx_payouts_status ON payouts(ledger_id, status);

-- ============================================================================
-- AUDIT & WEBHOOKS
-- ============================================================================

-- Audit Log: Track all API calls and changes
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID REFERENCES ledgers(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  actor_type TEXT CHECK (actor_type IN ('api', 'system', 'admin')),
  actor_id TEXT,
  ip_address INET,
  request_body JSONB,
  response_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_ledger ON audit_log(ledger_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- Webhook Events: Track webhook deliveries
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  
  -- Delivery tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  
  -- Response info
  response_status INTEGER,
  response_body TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_ledger ON webhook_events(ledger_id);
CREATE INDEX idx_webhook_status ON webhook_events(status) WHERE status = 'pending';

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update account balance after entry
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.entry_type = 'debit' THEN
    UPDATE accounts 
    SET balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_id;
  ELSIF NEW.entry_type = 'credit' THEN
    UPDATE accounts 
    SET balance = balance - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_id;
  END IF;
  
  -- Store running balance
  NEW.running_balance := (SELECT balance FROM accounts WHERE id = NEW.account_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_balance
  BEFORE INSERT ON entries
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

-- Function to validate double-entry (debits = credits)
CREATE OR REPLACE FUNCTION validate_double_entry()
RETURNS TRIGGER AS $$
DECLARE
  total_debits NUMERIC(14,2);
  total_credits NUMERIC(14,2);
BEGIN
  -- Calculate totals for this transaction
  SELECT 
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
  INTO total_debits, total_credits
  FROM entries
  WHERE transaction_id = NEW.transaction_id;
  
  -- For now, just log - we'll validate at commit time
  -- This allows building transactions with multiple inserts
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ledgers_updated
  BEFORE UPDATE ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_payouts_updated
  BEFORE UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- API key based access (ledger isolation)
-- These policies will be used with service role + custom claims

CREATE POLICY "Ledger isolation" ON accounts
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

CREATE POLICY "Ledger isolation" ON transactions
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

CREATE POLICY "Ledger isolation" ON entries
  FOR ALL USING (
    transaction_id IN (
      SELECT id FROM transactions 
      WHERE ledger_id = current_setting('app.current_ledger_id', true)::uuid
    )
  );

CREATE POLICY "Ledger isolation" ON payouts
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- SEED DATA HELPER
-- ============================================================================

-- Function to initialize default accounts for a new ledger
CREATE OR REPLACE FUNCTION initialize_ledger_accounts(p_ledger_id UUID)
RETURNS void AS $$
BEGIN
  -- Platform revenue account
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  VALUES (p_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue');
  
  -- Creator pool (aggregate liability)
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  VALUES (p_ledger_id, 'creator_pool', 'platform', 'Creator Liability Pool');
  
  -- Processing fees
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  VALUES (p_ledger_id, 'processing_fees', 'platform', 'Processing Fees');
  
  -- Tax reserve
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  VALUES (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Withholding Reserve');
  
  -- Refund reserve
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  VALUES (p_ledger_id, 'refund_reserve', 'reserve', 'Refund Reserve');
  
  -- Cash account
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  VALUES (p_ledger_id, 'cash', 'platform', 'Cash / Bank');
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create accounts when ledger is created
CREATE OR REPLACE FUNCTION auto_create_ledger_accounts()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM initialize_ledger_accounts(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_ledger_accounts
  AFTER INSERT ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_ledger_accounts();
