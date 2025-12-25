-- Migration: Force Recreate Invoices Table
-- Drops and recreates invoices table to ensure correct schema

-- Drop existing tables if they exist (to fix schema mismatches)
DROP TABLE IF EXISTS invoice_payments CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;

-- ============================================================================
-- CREATE INVOICES TABLE
-- ============================================================================

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    reference_id TEXT,
    
    -- Customer information
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    customer_id TEXT,
    customer_address JSONB,
    
    -- Line items and amounts (in cents)
    line_items JSONB NOT NULL DEFAULT '[]',
    subtotal BIGINT NOT NULL DEFAULT 0,
    tax_rate DECIMAL(5,4) DEFAULT 0,
    tax_amount BIGINT NOT NULL DEFAULT 0,
    discount_amount BIGINT NOT NULL DEFAULT 0,
    total_amount BIGINT NOT NULL DEFAULT 0,
    amount_paid BIGINT NOT NULL DEFAULT 0,
    amount_due BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    
    -- Status and dates
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'void')),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    
    -- Links
    transaction_id UUID REFERENCES transactions(id),
    
    -- Additional fields
    notes TEXT,
    terms TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT invoices_ledger_invoice_number_unique UNIQUE (ledger_id, invoice_number)
);

-- ============================================================================
-- CREATE INVOICE_PAYMENTS TABLE
-- ============================================================================

CREATE TABLE invoice_payments (
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
-- INDEXES
-- ============================================================================

CREATE INDEX idx_invoices_ledger_id ON invoices(ledger_id);
CREATE INDEX idx_invoices_status ON invoices(ledger_id, status);
CREATE INDEX idx_invoices_customer_id ON invoices(ledger_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_invoices_due_date ON invoices(ledger_id, due_date) WHERE status NOT IN ('paid', 'void');
CREATE INDEX idx_invoices_invoice_number ON invoices(ledger_id, invoice_number);
CREATE INDEX idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "invoices_service_role_full_access" ON invoices
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "invoice_payments_service_role_full_access" ON invoice_payments
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE invoices IS 'Customer invoices for accounts receivable tracking';
COMMENT ON TABLE invoice_payments IS 'Payment records against invoices';
COMMENT ON COLUMN invoices.line_items IS 'JSON array of line items: [{description, quantity, unit_price, amount}]';
COMMENT ON COLUMN invoices.status IS 'Invoice status: draft, sent, viewed, partial, paid, overdue, void';
COMMENT ON COLUMN invoices.transaction_id IS 'AR transaction created when invoice is sent';
