-- Soledgic: Auto-Email and Payout Rails Schema
-- Adds email configuration, email logging, and payout rail configuration

-- ============================================================================
-- EMAIL CONFIGURATION ON LEDGERS
-- ============================================================================

ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS email_config JSONB DEFAULT NULL;
-- email_config structure:
-- {
--   "enabled": true,
--   "send_day": 1,
--   "from_name": "Booklyverse",
--   "from_email": "statements@booklyverse.com",
--   "subject_template": "Your {{month}} {{year}} Earnings Statement",
--   "body_template": "Hi {{creator_name}},\n\nPlease find attached...",
--   "cc_admin": false,
--   "admin_email": "finance@company.com"
-- }

COMMENT ON COLUMN ledgers.email_config IS 'Auto-email configuration for monthly statements';

-- ============================================================================
-- PAYOUT RAILS CONFIGURATION ON LEDGERS
-- ============================================================================

ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS payout_rails JSONB DEFAULT '[]'::jsonb;
-- payout_rails structure:
-- [
--   {
--     "rail": "processor_connect",
--     "enabled": true,
--     "credentials": { "secret_key": "sk_..." },
--     "settings": {}
--   },
--   {
--     "rail": "manual",
--     "enabled": true,
--     "settings": {
--       "company_name": "BOOKLYVERSE",
--       "company_id": "1234567890",
--       "originating_dfi": "12345678"
--     }
--   }
-- ]

COMMENT ON COLUMN ledgers.payout_rails IS 'Configured payment rails for executing payouts';

-- ============================================================================
-- EMAIL LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  creator_id TEXT,
  
  -- Email details
  email_type TEXT NOT NULL, -- 'monthly_statement', 'manual_statement', 'payout_notification', etc.
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  message_id TEXT, -- External provider message ID
  error TEXT,
  
  -- Period (for statements)
  period_year INTEGER,
  period_month INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_email_log_ledger ON email_log(ledger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_creator ON email_log(ledger_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_log_period ON email_log(ledger_id, period_year, period_month);

-- ============================================================================
-- PAYOUT EXECUTION LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  
  -- Rail info
  rail TEXT NOT NULL, -- 'processor_connect', 'bank_aggregator_transfer', 'manual', etc.
  external_id TEXT, -- External system's ID for the payout
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'returned')),
  error TEXT,
  
  -- Amounts (for verification)
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Response data
  response_data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_payout_exec_ledger ON payout_executions(ledger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_exec_tx ON payout_executions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payout_exec_external ON payout_executions(rail, external_id);
CREATE INDEX IF NOT EXISTS idx_payout_exec_status ON payout_executions(status) WHERE status IN ('pending', 'processing');

-- ============================================================================
-- CREATOR PAYOUT METHOD (on accounts metadata)
-- ============================================================================

-- The payout_method is stored in accounts.metadata for creator_balance accounts
-- Structure:
-- {
--   "payout_method": {
--     "rail": "processor_connect",
--     "account_id": "acct_xxx", // processor connected account
--     "email": "creator@example.com", // Optional payout contact
--     "bank_account": {
--       "routing_number": "123456789",
--       "account_number": "987654321",
--       "account_type": "checking"
--     },
--     "wallet_address": "0x..." // For crypto
--   }
-- }

-- ============================================================================
-- CRON JOB CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS cron_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE, -- NULL for system-wide jobs
  
  job_name TEXT NOT NULL,
  job_type TEXT NOT NULL, -- 'send_statements', 'sync_bank_feed', 'reconcile', etc.
  
  -- Schedule (cron format)
  schedule TEXT NOT NULL, -- '0 9 1 * *' (9 AM on 1st of month)
  timezone TEXT DEFAULT 'UTC',
  
  -- Status
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  next_run_at TIMESTAMPTZ,
  
  -- Configuration
  config JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, job_name)
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_next ON cron_jobs(next_run_at) WHERE enabled = true;

-- Insert default cron job for monthly statements
INSERT INTO cron_jobs (job_name, job_type, schedule, config)
VALUES (
  'monthly_statements',
  'send_statements',
  '0 9 1 * *', -- 9 AM UTC on 1st of each month
  '{"action": "send_monthly_statements"}'::jsonb
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- HELPER FUNCTION: Get creators needing statements
-- ============================================================================

CREATE OR REPLACE FUNCTION get_creators_for_statements(
  p_ledger_id UUID,
  p_year INTEGER,
  p_month INTEGER
) RETURNS TABLE (
  creator_id TEXT,
  creator_name TEXT,
  email TEXT,
  total_earnings NUMERIC,
  total_payouts NUMERIC,
  balance NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.entity_id as creator_id,
    a.name as creator_name,
    (a.metadata->>'email')::TEXT as email,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) as total_earnings,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) as total_payouts,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END), 0) as balance
  FROM accounts a
  LEFT JOIN entries e ON e.account_id = a.id
  LEFT JOIN transactions t ON e.transaction_id = t.id
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'creator_balance'
    AND a.metadata->>'email' IS NOT NULL
    AND (t.id IS NULL OR (
      t.status NOT IN ('voided', 'reversed')
      AND EXTRACT(YEAR FROM t.created_at) = p_year
      AND EXTRACT(MONTH FROM t.created_at) = p_month
    ))
  GROUP BY a.id, a.entity_id, a.name, a.metadata
  HAVING COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE email_log IS 'Log of all emails sent by the system';
COMMENT ON TABLE payout_executions IS 'Record of payout executions across different payment rails';
COMMENT ON TABLE cron_jobs IS 'Scheduled jobs configuration';
