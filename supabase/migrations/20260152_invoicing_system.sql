-- Migration: Fix Invoicing System
-- Adds missing columns and creates invoice_payments table
-- Security: RLS enabled, proper constraints, audit logging

-- ============================================================================
-- ADD MISSING COLUMNS TO EXISTING INVOICES TABLE
-- ============================================================================

-- Add columns that might be missing from existing invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_address JSONB;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal BIGINT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,4) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount BIGINT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount BIGINT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount BIGINT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid BIGINT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_due BIGINT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add status check constraint if not exists (may need to drop and recreate)
DO $$
BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_status_check 
    CHECK (status IN ('draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'void'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- INVOICE PAYMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id),
    
    -- Payment details (amount in cents)
    amount BIGINT NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT,
    reference_id TEXT,
    notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES (only create if column exists)
-- ============================================================================

DO $$
BEGIN
  -- Only create indexes if ledger_id column exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'ledger_id') THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_ledger_id ON invoices(ledger_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(ledger_id, status);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(ledger_id, customer_id) WHERE customer_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(ledger_id, due_date) WHERE status NOT IN ('paid', 'void');
    CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(ledger_id, invoice_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "invoices_service_role_full_access" ON invoices;
DROP POLICY IF EXISTS "invoice_payments_service_role_full_access" ON invoice_payments;

-- Invoices policies - service role has full access
CREATE POLICY "invoices_service_role_full_access" ON invoices
    FOR ALL
    USING (auth.role() = 'service_role');

-- Invoice payments policies - service role has full access  
CREATE POLICY "invoice_payments_service_role_full_access" ON invoice_payments
    FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================================
-- UNIQUE CONSTRAINT
-- ============================================================================

DO $$
BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_ledger_invoice_number_unique 
    UNIQUE (ledger_id, invoice_number);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE invoices IS 'Customer invoices for accounts receivable tracking';
COMMENT ON TABLE invoice_payments IS 'Payment records against invoices';

COMMENT ON COLUMN invoices.line_items IS 'JSON array of line items: [{description, quantity, unit_price, amount}]';
COMMENT ON COLUMN invoices.status IS 'Invoice status: draft, sent, viewed, partial, paid, overdue, void';
COMMENT ON COLUMN invoices.transaction_id IS 'AR transaction created when invoice is sent';
