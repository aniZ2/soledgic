-- Migration: Repair Invoicing System
-- Fixes the partially applied 20260152 migration
-- This adds missing columns and indexes to existing invoices table

-- ============================================================================
-- ADD MISSING COLUMNS TO EXISTING INVOICES TABLE
-- ============================================================================

-- The invoices table exists but may have different columns
-- Add columns that might be missing
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

-- ============================================================================
-- INVOICE PAYMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT,
    reference_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES (conditional creation)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_ledger_id ON invoices(ledger_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(ledger_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(ledger_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "invoices_service_role_full_access" ON invoices;
DROP POLICY IF EXISTS "invoice_payments_service_role_full_access" ON invoice_payments;

-- Service role has full access
CREATE POLICY "invoices_service_role_full_access" ON invoices
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "invoice_payments_service_role_full_access" ON invoice_payments
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- MARK 20260152 AS APPLIED (if not already)
-- ============================================================================
-- This migration is a repair - it ensures the invoicing system is properly set up
-- regardless of whether 20260152 was partially applied or not

INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260152')
ON CONFLICT (version) DO NOTHING;
