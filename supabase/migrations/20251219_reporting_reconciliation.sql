-- soledgic: Reporting & Reconciliation Schema (No PII)
-- Migration: Audit & Reconciliation Extensions

-- ============================================================================
-- PAYOUT SUMMARIES (No PII - just aggregates)
-- ============================================================================

-- Annual payout summaries per creator (for internal reconciliation only)
CREATE TABLE creator_payout_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  tax_year INTEGER NOT NULL,
  
  -- Earnings (from soledgic ledger)
  gross_earnings NUMERIC(14,2) DEFAULT 0,
  refunds_issued NUMERIC(14,2) DEFAULT 0,
  net_earnings NUMERIC(14,2) DEFAULT 0,
  
  -- Payouts (reconciled with Stripe)
  total_paid_out NUMERIC(14,2) DEFAULT 0,
  payout_count INTEGER DEFAULT 0,
  
  -- External reference
  stripe_account_id TEXT,  -- Stripe Connected Account ID (not PII)
  
  -- Reconciliation status
  reconciled_with_stripe BOOLEAN DEFAULT false,
  last_reconciled_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, entity_id, tax_year)
);

CREATE INDEX idx_payout_summaries_year ON creator_payout_summaries(ledger_id, tax_year);

ALTER TABLE creator_payout_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON creator_payout_summaries
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- RECONCILIATION
-- ============================================================================

-- Track external payment reconciliation (e.g., Stripe payouts)
CREATE TABLE reconciliation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Expected vs Actual
  expected_revenue NUMERIC(14,2) NOT NULL,
  actual_deposits NUMERIC(14,2) NOT NULL,
  expected_payouts NUMERIC(14,2) NOT NULL,
  actual_payouts NUMERIC(14,2) NOT NULL,
  
  -- Differences (computed)
  revenue_difference NUMERIC(14,2) GENERATED ALWAYS AS (actual_deposits - expected_revenue) STORED,
  payout_difference NUMERIC(14,2) GENERATED ALWAYS AS (actual_payouts - expected_payouts) STORED,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'matched', 'discrepancy', 'resolved')
  ),
  
  -- Resolution
  discrepancy_notes TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  
  -- External references (Stripe payout IDs, etc.)
  external_report_ids JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reconciliation_period ON reconciliation_records(ledger_id, period_start, period_end);
CREATE INDEX idx_reconciliation_status ON reconciliation_records(ledger_id, status);

ALTER TABLE reconciliation_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON reconciliation_records
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- REPORT EXPORTS
-- ============================================================================

-- Track generated reports for audit trail
CREATE TABLE report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  report_type TEXT NOT NULL CHECK (
    report_type IN (
      'transaction_detail',
      'creator_earnings',
      'platform_revenue',
      'payout_summary',
      'reconciliation',
      'audit_log'
    )
  ),
  
  -- Parameters used
  parameters JSONB NOT NULL,
  period_start DATE,
  period_end DATE,
  
  -- Output
  format TEXT CHECK (format IN ('csv', 'json')),
  file_hash TEXT,  -- SHA256 for integrity
  row_count INTEGER,
  
  -- Requestor
  requested_by TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_ledger ON report_exports(ledger_id);
CREATE INDEX idx_reports_type ON report_exports(ledger_id, report_type);

ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON report_exports
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- STRIPE REFERENCES (for reconciliation, no PII)
-- ============================================================================

-- Link soledgic creators to Stripe Connected Accounts
CREATE TABLE stripe_account_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  
  -- Stripe identifiers (not PII)
  stripe_account_id TEXT NOT NULL,  -- acct_xxx
  stripe_account_type TEXT CHECK (stripe_account_type IN ('express', 'standard', 'custom')),
  
  -- Status
  payouts_enabled BOOLEAN DEFAULT false,
  charges_enabled BOOLEAN DEFAULT false,
  
  -- Metadata
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, entity_id),
  UNIQUE(ledger_id, stripe_account_id)
);

CREATE INDEX idx_stripe_links_ledger ON stripe_account_links(ledger_id);

ALTER TABLE stripe_account_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON stripe_account_links
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

CREATE TRIGGER trigger_payout_summaries_updated
  BEFORE UPDATE ON creator_payout_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_reconciliation_updated
  BEFORE UPDATE ON reconciliation_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_stripe_links_updated
  BEFORE UPDATE ON stripe_account_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
