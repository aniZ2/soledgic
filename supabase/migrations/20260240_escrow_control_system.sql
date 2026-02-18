-- Soledgic: Escrow Control System
-- Implements "Manual Override" model where all funds are held until explicitly released
-- Supports processor Custom accounts for ventures and creators

-- ============================================================================
-- 1. ADD RELEASE STATUS TO ENTRIES
-- ============================================================================

-- Add release tracking to entries table
ALTER TABLE entries 
  ADD COLUMN IF NOT EXISTS release_status TEXT DEFAULT 'held' 
    CHECK (release_status IN ('held', 'pending_release', 'released', 'voided')),
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_by UUID,
  ADD COLUMN IF NOT EXISTS release_idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS release_transfer_id TEXT,  -- processor transfer ID once released
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,          -- Why funds are held (dispute_window, manual_review, etc.)
  ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ;    -- Auto-release date (e.g., after dispute window)

-- Index for finding held funds ready for release
CREATE INDEX IF NOT EXISTS idx_entries_held_status 
  ON entries(release_status, hold_until) 
  WHERE release_status = 'held';

-- Index for admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_entries_release_pending
  ON entries(release_status, created_at DESC)
  WHERE release_status IN ('held', 'pending_release');

-- ============================================================================
-- 2. processor CONNECTED ACCOUNTS TABLE
-- ============================================================================

-- Track processor Custom accounts for ventures and creators
CREATE TABLE IF NOT EXISTS processor_connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Account ownership
  entity_type TEXT NOT NULL CHECK (entity_type IN ('venture', 'creator')),
  entity_id TEXT NOT NULL,  -- venture_id or creator_id
  entity_name TEXT,
  
  -- processor details
  processor_account_id TEXT NOT NULL,  -- acct_xxx
  processor_account_type TEXT DEFAULT 'custom' CHECK (processor_account_type IN ('custom', 'express', 'standard')),
  
  -- Account status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'restricted', 'disabled')),
  charges_enabled BOOLEAN DEFAULT false,
  payouts_enabled BOOLEAN DEFAULT false,
  details_submitted BOOLEAN DEFAULT false,
  
  -- Control settings
  auto_payout_enabled BOOLEAN DEFAULT false,  -- We want this FALSE for escrow control
  payout_schedule JSONB DEFAULT '{"interval": "manual"}',
  
  -- Verification
  requirements_current JSONB,      -- Current verification requirements
  requirements_pending JSONB,      -- Pending verification requirements
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique processor account per entity
  UNIQUE(ledger_id, entity_type, entity_id),
  UNIQUE(processor_account_id)
);

CREATE INDEX IF NOT EXISTS idx_processor_accounts_ledger ON processor_connected_accounts(ledger_id);
CREATE INDEX IF NOT EXISTS idx_processor_accounts_entity ON processor_connected_accounts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_processor_accounts_processor_id ON processor_connected_accounts(processor_account_id);

-- ============================================================================
-- 3. RELEASE QUEUE TABLE
-- ============================================================================

-- Track release requests and their execution
CREATE TABLE IF NOT EXISTS release_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- What we're releasing
  entry_id UUID NOT NULL REFERENCES entries(id),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  
  -- Who receives the release
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('venture', 'creator')),
  recipient_id TEXT NOT NULL,
  recipient_processor_account_id TEXT,  -- Target processor Custom account
  
  -- Amount details
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  -- Release control
  release_type TEXT DEFAULT 'manual' CHECK (release_type IN ('manual', 'auto', 'scheduled')),
  scheduled_for TIMESTAMPTZ,
  
  -- Execution status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  
  -- processor execution
  processor_transfer_id TEXT,
  processor_error TEXT,
  
  -- Audit
  requested_by UUID,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  
  -- Idempotency
  idempotency_key TEXT UNIQUE NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_release_queue_pending 
  ON release_queue(status, scheduled_for) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_release_queue_ledger 
  ON release_queue(ledger_id, status);

-- ============================================================================
-- 4. VENTURE CONFIGURATION
-- ============================================================================

-- Configure ventures (Booklyverse, MTF Prop, etc.)
CREATE TABLE IF NOT EXISTS ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Identity
  venture_id TEXT NOT NULL,  -- 'booklyverse', 'mtf_prop', etc.
  name TEXT NOT NULL,
  
  -- processor Custom account
  processor_account_id TEXT,
  
  -- Release policy
  release_policy TEXT DEFAULT 'manual' CHECK (release_policy IN ('manual', 'auto_after_window', 'instant')),
  dispute_window_days INTEGER DEFAULT 7,  -- Days to hold before auto-release
  min_release_amount NUMERIC(14,2) DEFAULT 0,
  
  -- Revenue split defaults
  default_creator_percent NUMERIC(5,2) DEFAULT 80.00,
  default_platform_percent NUMERIC(5,2) DEFAULT 20.00,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, venture_id)
);

-- ============================================================================
-- 5. FUNCTIONS FOR ESCROW CONTROL
-- ============================================================================

-- Function to mark entries as held (called after payment webhook)
CREATE OR REPLACE FUNCTION mark_entry_held(
  p_entry_id UUID,
  p_hold_reason TEXT DEFAULT 'dispute_window',
  p_hold_days INTEGER DEFAULT 7
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE entries
  SET 
    release_status = 'held',
    hold_reason = p_hold_reason,
    hold_until = NOW() + (p_hold_days || ' days')::INTERVAL
  WHERE id = p_entry_id
    AND release_status = 'held';  -- Only if not already processed
END;
$$;

-- Function to release funds (called by admin or auto-release job)
CREATE OR REPLACE FUNCTION request_release(
  p_entry_id UUID,
  p_requested_by UUID DEFAULT NULL,
  p_release_type TEXT DEFAULT 'manual'
)
RETURNS UUID  -- Returns release_queue.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_transaction RECORD;
  v_recipient_account RECORD;
  v_release_id UUID;
  v_idempotency_key TEXT;
BEGIN
  -- Get entry details
  SELECT e.*, a.entity_id, a.entity_type, a.ledger_id
  INTO v_entry
  FROM entries e
  JOIN accounts a ON e.account_id = a.id
  WHERE e.id = p_entry_id
    AND e.release_status = 'held'
    AND e.entry_type = 'credit';  -- Only release credits (money owed to someone)
  
  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'Entry not found, not held, or not a credit: %', p_entry_id;
  END IF;
  
  -- Get transaction
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = v_entry.transaction_id;
  
  -- Find recipient's processor account
  SELECT * INTO v_recipient_account
  FROM processor_connected_accounts
  WHERE ledger_id = v_entry.ledger_id
    AND entity_id = v_entry.entity_id
    AND status = 'active';
  
  -- Generate idempotency key
  v_idempotency_key := 'release_' || p_entry_id::TEXT || '_' || extract(epoch from now())::TEXT;
  
  -- Create release request
  INSERT INTO release_queue (
    ledger_id,
    entry_id,
    transaction_id,
    recipient_type,
    recipient_id,
    recipient_processor_account_id,
    amount,
    currency,
    release_type,
    requested_by,
    idempotency_key
  ) VALUES (
    v_entry.ledger_id,
    p_entry_id,
    v_entry.transaction_id,
    v_entry.entity_type,
    v_entry.entity_id,
    v_recipient_account.processor_account_id,
    v_entry.amount,
    'USD',
    p_release_type,
    p_requested_by,
    v_idempotency_key
  )
  RETURNING id INTO v_release_id;
  
  -- Mark entry as pending release
  UPDATE entries
  SET 
    release_status = 'pending_release',
    release_idempotency_key = v_idempotency_key
  WHERE id = p_entry_id;
  
  RETURN v_release_id;
END;
$$;

-- Function to complete release (called after processor transfer succeeds)
CREATE OR REPLACE FUNCTION complete_release(
  p_release_id UUID,
  p_processor_transfer_id TEXT,
  p_approved_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_release RECORD;
BEGIN
  -- Get release request
  SELECT * INTO v_release
  FROM release_queue
  WHERE id = p_release_id
    AND status IN ('pending', 'processing');
  
  IF v_release IS NULL THEN
    RAISE EXCEPTION 'Release request not found or already processed: %', p_release_id;
  END IF;
  
  -- Update release queue
  UPDATE release_queue
  SET 
    status = 'completed',
    processor_transfer_id = p_processor_transfer_id,
    approved_by = COALESCE(p_approved_by, approved_by),
    approved_at = COALESCE(approved_at, NOW()),
    executed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_release_id;
  
  -- Update entry
  UPDATE entries
  SET 
    release_status = 'released',
    released_at = NOW(),
    released_by = p_approved_by,
    release_transfer_id = p_processor_transfer_id
  WHERE id = v_release.entry_id;
END;
$$;

-- Function to get held funds summary (for admin dashboard)
CREATE OR REPLACE FUNCTION get_held_funds_summary(p_ledger_id UUID)
RETURNS TABLE (
  venture_id TEXT,
  venture_name TEXT,
  recipient_type TEXT,
  recipient_id TEXT,
  recipient_name TEXT,
  total_held NUMERIC(14,2),
  oldest_hold TIMESTAMPTZ,
  ready_for_release NUMERIC(14,2),
  entry_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.metadata->>'venture_id' as venture_id,
    v.name as venture_name,
    a.entity_type as recipient_type,
    a.entity_id as recipient_id,
    a.name as recipient_name,
    SUM(e.amount) as total_held,
    MIN(e.created_at) as oldest_hold,
    SUM(CASE WHEN e.hold_until <= NOW() THEN e.amount ELSE 0 END) as ready_for_release,
    COUNT(*) as entry_count
  FROM entries e
  JOIN accounts a ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id
  LEFT JOIN ventures v ON v.ledger_id = a.ledger_id AND v.venture_id = t.metadata->>'venture_id'
  WHERE a.ledger_id = p_ledger_id
    AND e.release_status = 'held'
    AND e.entry_type = 'credit'
  GROUP BY 
    t.metadata->>'venture_id',
    v.name,
    a.entity_type,
    a.entity_id,
    a.name
  ORDER BY total_held DESC;
END;
$$;

-- Function to auto-release funds past dispute window
CREATE OR REPLACE FUNCTION auto_release_ready_funds(p_ledger_id UUID)
RETURNS INTEGER  -- Number of releases queued
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_entry IN
    SELECT e.id
    FROM entries e
    JOIN accounts a ON e.account_id = a.id
    WHERE a.ledger_id = p_ledger_id
      AND e.release_status = 'held'
      AND e.entry_type = 'credit'
      AND e.hold_until <= NOW()
  LOOP
    PERFORM request_release(v_entry.id, NULL, 'auto');
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE processor_connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventures ENABLE ROW LEVEL SECURITY;

-- API key access
CREATE POLICY "processor_accounts_api_key_access" ON processor_connected_accounts
  FOR ALL USING (
    ledger_id IN (
      SELECT id FROM ledgers 
      WHERE api_key_hash = current_setting('request.headers', true)::json->>'x-api-key-hash'
    )
  );

CREATE POLICY "release_queue_api_key_access" ON release_queue
  FOR ALL USING (
    ledger_id IN (
      SELECT id FROM ledgers 
      WHERE api_key_hash = current_setting('request.headers', true)::json->>'x-api-key-hash'
    )
  );

CREATE POLICY "ventures_api_key_access" ON ventures
  FOR ALL USING (
    ledger_id IN (
      SELECT id FROM ledgers 
      WHERE api_key_hash = current_setting('request.headers', true)::json->>'x-api-key-hash'
    )
  );

-- ============================================================================
-- 7. GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION mark_entry_held TO service_role;
GRANT EXECUTE ON FUNCTION request_release TO service_role;
GRANT EXECUTE ON FUNCTION complete_release TO service_role;
GRANT EXECUTE ON FUNCTION get_held_funds_summary TO service_role;
GRANT EXECUTE ON FUNCTION auto_release_ready_funds TO service_role;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON TABLE processor_connected_accounts IS 
  'processor Custom accounts for ventures and creators. Used for controlled fund releases.';

COMMENT ON TABLE release_queue IS 
  'Queue of pending fund releases. Entries wait here until approved and executed via processor Transfer.';

COMMENT ON TABLE ventures IS 
  'Configuration for each venture (Booklyverse, MTF Prop, etc.) including release policies.';

COMMENT ON COLUMN entries.release_status IS 
  'Escrow status: held (in platform), pending_release (queued), released (transferred), voided (cancelled)';

COMMENT ON FUNCTION request_release IS 
  'Queue a held entry for release. Returns release_queue.id. Does NOT execute the transfer.';

COMMENT ON FUNCTION complete_release IS 
  'Mark a release as complete after processor transfer succeeds.';
