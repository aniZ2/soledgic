-- Soledgic: Stripe Custom Connected Accounts
-- Full "Banker Model" infrastructure for controlling fund flow
-- Money: Platform Account → (Transfer) → Connected Account → (Payout) → Bank

-- ============================================================================
-- 1. CONNECTED ACCOUNTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Owner identification
  entity_type TEXT NOT NULL CHECK (entity_type IN ('creator', 'venture', 'merchant')),
  entity_id TEXT NOT NULL,  -- author_id, venture_id, etc.
  
  -- Display
  display_name TEXT,
  email TEXT,
  
  -- Stripe Custom Account
  stripe_account_id TEXT UNIQUE,  -- acct_xxx
  stripe_account_type TEXT DEFAULT 'custom' CHECK (stripe_account_type IN ('custom', 'express', 'standard')),
  
  -- Account Status (synced from Stripe)
  stripe_status TEXT DEFAULT 'pending' CHECK (stripe_status IN (
    'pending',           -- Account created but not yet verified
    'restricted',        -- Missing required info
    'enabled',           -- Fully operational
    'disabled'           -- Manually disabled
  )),
  charges_enabled BOOLEAN DEFAULT false,
  payouts_enabled BOOLEAN DEFAULT false,
  details_submitted BOOLEAN DEFAULT false,
  
  -- CRITICAL: Payout control (this is what makes you the banker)
  payout_schedule JSONB DEFAULT '{"interval": "manual"}',  -- NEVER set to 'daily' or 'weekly'
  payouts_paused BOOLEAN DEFAULT true,  -- Default: YOU control payouts
  
  -- Verification status
  requirements_current JSONB DEFAULT '[]',   -- What they need to provide now
  requirements_past_due JSONB DEFAULT '[]',  -- Overdue requirements
  requirements_pending JSONB DEFAULT '[]',   -- Pending verification
  
  -- Bank account for payouts (we store reference, not details)
  default_bank_account_id TEXT,  -- ba_xxx or bank_xxx
  default_bank_last4 TEXT,       -- Last 4 of account number
  default_bank_name TEXT,        -- Bank name
  
  -- Control flags
  is_active BOOLEAN DEFAULT true,
  can_receive_transfers BOOLEAN DEFAULT false,  -- YOU control this
  can_request_payouts BOOLEAN DEFAULT false,    -- YOU control this
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  -- Ensure one account per entity per ledger
  UNIQUE(ledger_id, entity_type, entity_id)
);

CREATE INDEX idx_connected_accounts_ledger ON connected_accounts(ledger_id);
CREATE INDEX idx_connected_accounts_stripe ON connected_accounts(stripe_account_id);
CREATE INDEX idx_connected_accounts_entity ON connected_accounts(entity_type, entity_id);
CREATE INDEX idx_connected_accounts_status ON connected_accounts(stripe_status) WHERE is_active = true;

-- ============================================================================
-- 2. RELEASE QUEUE (Escrow Control)
-- ============================================================================

CREATE TABLE IF NOT EXISTS escrow_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- What we're releasing
  entry_id UUID NOT NULL REFERENCES entries(id),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  
  -- Who receives the release
  connected_account_id UUID REFERENCES connected_accounts(id),
  recipient_stripe_account TEXT,  -- acct_xxx
  recipient_entity_type TEXT NOT NULL,
  recipient_entity_id TEXT NOT NULL,
  
  -- Amount
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency TEXT DEFAULT 'USD',
  
  -- Release type
  release_type TEXT DEFAULT 'manual' CHECK (release_type IN (
    'manual',      -- Admin clicked release
    'auto',        -- Auto-released after hold period
    'scheduled',   -- Pre-scheduled release
    'rule_based'   -- Released by business rule
  )),
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',     -- Waiting for approval
    'approved',    -- Approved, ready to execute
    'processing',  -- Transfer in progress
    'completed',   -- Transfer successful
    'failed',      -- Transfer failed
    'cancelled'    -- Cancelled before execution
  )),
  
  -- Stripe Transfer details
  stripe_transfer_id TEXT,       -- tr_xxx
  stripe_transfer_group TEXT,    -- For grouping related transfers
  stripe_error_code TEXT,
  stripe_error_message TEXT,
  
  -- Audit trail
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  requested_by UUID,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  executed_at TIMESTAMPTZ,
  
  -- Idempotency
  idempotency_key TEXT UNIQUE NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_escrow_releases_pending ON escrow_releases(status, ledger_id) WHERE status = 'pending';
CREATE INDEX idx_escrow_releases_entry ON escrow_releases(entry_id);
CREATE INDEX idx_escrow_releases_recipient ON escrow_releases(recipient_entity_type, recipient_entity_id);

-- ============================================================================
-- 3. PAYOUT REQUESTS (From Connected Account → Bank)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Who's requesting
  connected_account_id UUID NOT NULL REFERENCES connected_accounts(id),
  recipient_entity_type TEXT NOT NULL,
  recipient_entity_id TEXT NOT NULL,
  
  -- Amount
  requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0),
  approved_amount NUMERIC(14,2),  -- May be less than requested
  currency TEXT DEFAULT 'USD',
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',     -- Waiting for admin review
    'approved',    -- Approved, scheduled for payout
    'processing',  -- Payout in progress
    'completed',   -- Payout successful
    'rejected',    -- Admin rejected
    'failed'       -- Payout failed
  )),
  
  -- Stripe Payout details
  stripe_payout_id TEXT,         -- po_xxx
  stripe_arrival_date DATE,
  stripe_error_code TEXT,
  stripe_error_message TEXT,
  
  -- Review
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  requested_by UUID,  -- Usually the creator themselves
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,   -- Admin who approved/rejected
  rejection_reason TEXT,
  
  -- Execution
  executed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payout_requests_pending ON payout_requests(status, ledger_id) WHERE status = 'pending';
CREATE INDEX idx_payout_requests_account ON payout_requests(connected_account_id);

-- ============================================================================
-- 4. UPDATE ENTRIES TABLE FOR ESCROW
-- ============================================================================

ALTER TABLE entries 
  ADD COLUMN IF NOT EXISTS release_status TEXT DEFAULT 'immediate' 
    CHECK (release_status IN ('immediate', 'held', 'pending_release', 'released', 'voided')),
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_by UUID,
  ADD COLUMN IF NOT EXISTS release_transfer_id TEXT;

-- Set default to 'held' for creator_balance credits
COMMENT ON COLUMN entries.release_status IS 
  'immediate = no hold (platform accounts), held = in escrow, pending_release = queued, released = transferred, voided = cancelled';

CREATE INDEX IF NOT EXISTS idx_entries_held ON entries(release_status, hold_until) 
  WHERE release_status = 'held';

-- ============================================================================
-- 5. FUNCTIONS: CREATE CONNECTED ACCOUNT
-- ============================================================================

-- Record a new connected account (after creating in Stripe)
CREATE OR REPLACE FUNCTION register_connected_account(
  p_ledger_id UUID,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_stripe_account_id TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  INSERT INTO connected_accounts (
    ledger_id,
    entity_type,
    entity_id,
    stripe_account_id,
    display_name,
    email,
    created_by
  ) VALUES (
    p_ledger_id,
    p_entity_type,
    p_entity_id,
    p_stripe_account_id,
    p_display_name,
    p_email,
    p_created_by
  )
  ON CONFLICT (ledger_id, entity_type, entity_id) 
  DO UPDATE SET
    stripe_account_id = EXCLUDED.stripe_account_id,
    display_name = COALESCE(EXCLUDED.display_name, connected_accounts.display_name),
    email = COALESCE(EXCLUDED.email, connected_accounts.email),
    updated_at = NOW()
  RETURNING id INTO v_account_id;
  
  RETURN v_account_id;
END;
$$;

-- ============================================================================
-- 6. FUNCTIONS: SYNC ACCOUNT STATUS FROM STRIPE
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_connected_account_status(
  p_stripe_account_id TEXT,
  p_charges_enabled BOOLEAN,
  p_payouts_enabled BOOLEAN,
  p_details_submitted BOOLEAN,
  p_requirements_current JSONB DEFAULT '[]',
  p_requirements_past_due JSONB DEFAULT '[]',
  p_requirements_pending JSONB DEFAULT '[]'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_status TEXT;
BEGIN
  -- Determine status based on Stripe fields
  IF p_charges_enabled AND p_payouts_enabled THEN
    v_new_status := 'enabled';
  ELSIF p_details_submitted THEN
    v_new_status := 'restricted';
  ELSE
    v_new_status := 'pending';
  END IF;
  
  UPDATE connected_accounts
  SET 
    stripe_status = v_new_status,
    charges_enabled = p_charges_enabled,
    payouts_enabled = p_payouts_enabled,
    details_submitted = p_details_submitted,
    requirements_current = p_requirements_current,
    requirements_past_due = p_requirements_past_due,
    requirements_pending = p_requirements_pending,
    -- Enable transfers/payouts only when fully verified
    can_receive_transfers = (v_new_status = 'enabled'),
    updated_at = NOW()
  WHERE stripe_account_id = p_stripe_account_id;
END;
$$;

-- ============================================================================
-- 7. FUNCTIONS: REQUEST RELEASE (Escrow → Transfer)
-- ============================================================================

CREATE OR REPLACE FUNCTION request_fund_release(
  p_entry_id UUID,
  p_requested_by UUID DEFAULT NULL,
  p_release_type TEXT DEFAULT 'manual'
)
RETURNS UUID  -- Returns escrow_releases.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_account RECORD;
  v_connected_account RECORD;
  v_release_id UUID;
  v_idempotency_key TEXT;
BEGIN
  -- Lock and get entry
  SELECT e.*, a.ledger_id, a.entity_type, a.entity_id, a.name
  INTO v_entry
  FROM entries e
  JOIN accounts a ON e.account_id = a.id
  WHERE e.id = p_entry_id
    AND e.release_status = 'held'
    AND e.entry_type = 'credit'
  FOR UPDATE OF e;
  
  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'Entry % not found, not held, or not a credit', p_entry_id;
  END IF;
  
  -- Get connected account
  SELECT * INTO v_connected_account
  FROM connected_accounts
  WHERE ledger_id = v_entry.ledger_id
    AND entity_type = v_entry.entity_type
    AND entity_id = v_entry.entity_id
    AND is_active = true;
  
  IF v_connected_account IS NULL THEN
    RAISE EXCEPTION 'No active connected account for % %', v_entry.entity_type, v_entry.entity_id;
  END IF;
  
  IF NOT v_connected_account.can_receive_transfers THEN
    RAISE EXCEPTION 'Connected account % cannot receive transfers', v_connected_account.stripe_account_id;
  END IF;
  
  -- Generate idempotency key
  v_idempotency_key := 'release_' || p_entry_id::TEXT || '_' || extract(epoch from now())::BIGINT::TEXT;
  
  -- Create release request
  INSERT INTO escrow_releases (
    ledger_id,
    entry_id,
    transaction_id,
    connected_account_id,
    recipient_stripe_account,
    recipient_entity_type,
    recipient_entity_id,
    amount,
    release_type,
    requested_by,
    idempotency_key
  ) VALUES (
    v_entry.ledger_id,
    p_entry_id,
    v_entry.transaction_id,
    v_connected_account.id,
    v_connected_account.stripe_account_id,
    v_entry.entity_type,
    v_entry.entity_id,
    v_entry.amount,
    p_release_type,
    p_requested_by,
    v_idempotency_key
  )
  RETURNING id INTO v_release_id;
  
  -- Mark entry as pending release
  UPDATE entries
  SET release_status = 'pending_release'
  WHERE id = p_entry_id;
  
  RETURN v_release_id;
END;
$$;

-- ============================================================================
-- 8. FUNCTIONS: COMPLETE RELEASE (After Stripe Transfer succeeds)
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_fund_release(
  p_release_id UUID,
  p_stripe_transfer_id TEXT,
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
  SELECT * INTO v_release
  FROM escrow_releases
  WHERE id = p_release_id
    AND status IN ('pending', 'approved', 'processing');
  
  IF v_release IS NULL THEN
    RAISE EXCEPTION 'Release % not found or already completed', p_release_id;
  END IF;
  
  -- Update release record
  UPDATE escrow_releases
  SET 
    status = 'completed',
    stripe_transfer_id = p_stripe_transfer_id,
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
    release_transfer_id = p_stripe_transfer_id
  WHERE id = v_release.entry_id;
END;
$$;

-- ============================================================================
-- 9. FUNCTIONS: FAIL RELEASE
-- ============================================================================

CREATE OR REPLACE FUNCTION fail_fund_release(
  p_release_id UUID,
  p_error_code TEXT,
  p_error_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id UUID;
BEGIN
  -- Get entry_id and update release
  UPDATE escrow_releases
  SET 
    status = 'failed',
    stripe_error_code = p_error_code,
    stripe_error_message = p_error_message,
    updated_at = NOW()
  WHERE id = p_release_id
  RETURNING entry_id INTO v_entry_id;
  
  -- Revert entry to held
  UPDATE entries
  SET release_status = 'held'
  WHERE id = v_entry_id;
END;
$$;

-- ============================================================================
-- 10. FUNCTIONS: GET HELD FUNDS DASHBOARD
-- ============================================================================

CREATE OR REPLACE FUNCTION get_held_funds_dashboard(
  p_ledger_id UUID,
  p_venture_id TEXT DEFAULT NULL,
  p_ready_only BOOLEAN DEFAULT false,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  entry_id UUID,
  amount NUMERIC(14,2),
  currency TEXT,
  held_since TIMESTAMPTZ,
  days_held INTEGER,
  hold_reason TEXT,
  hold_until TIMESTAMPTZ,
  ready_for_release BOOLEAN,
  recipient_type TEXT,
  recipient_id TEXT,
  recipient_name TEXT,
  has_connected_account BOOLEAN,
  stripe_account_id TEXT,
  transaction_ref TEXT,
  product_name TEXT,
  venture_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as entry_id,
    e.amount,
    COALESCE(t.currency, 'USD') as currency,
    e.created_at as held_since,
    EXTRACT(DAY FROM NOW() - e.created_at)::INTEGER as days_held,
    e.hold_reason,
    e.hold_until,
    (e.hold_until IS NULL OR e.hold_until <= NOW()) as ready_for_release,
    a.entity_type as recipient_type,
    a.entity_id as recipient_id,
    a.name as recipient_name,
    (ca.id IS NOT NULL) as has_connected_account,
    ca.stripe_account_id,
    t.reference_id as transaction_ref,
    t.metadata->>'product_name' as product_name,
    t.metadata->>'venture_id' as venture_id
  FROM entries e
  JOIN accounts a ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id
  LEFT JOIN connected_accounts ca ON (
    ca.ledger_id = a.ledger_id 
    AND ca.entity_type = a.entity_type 
    AND ca.entity_id = a.entity_id
    AND ca.is_active = true
  )
  WHERE a.ledger_id = p_ledger_id
    AND e.release_status = 'held'
    AND e.entry_type = 'credit'
    AND a.account_type = 'creator_balance'
    AND (p_venture_id IS NULL OR t.metadata->>'venture_id' = p_venture_id)
    AND (NOT p_ready_only OR e.hold_until IS NULL OR e.hold_until <= NOW())
  ORDER BY e.created_at ASC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 11. FUNCTIONS: GET ESCROW SUMMARY
-- ============================================================================

CREATE OR REPLACE FUNCTION get_escrow_summary(p_ledger_id UUID)
RETURNS TABLE (
  venture_id TEXT,
  total_held NUMERIC(14,2),
  total_ready NUMERIC(14,2),
  total_pending_release NUMERIC(14,2),
  entry_count BIGINT,
  oldest_hold_date TIMESTAMPTZ,
  unique_recipients BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.metadata->>'venture_id' as venture_id,
    SUM(e.amount) as total_held,
    SUM(CASE WHEN e.hold_until IS NULL OR e.hold_until <= NOW() THEN e.amount ELSE 0 END) as total_ready,
    SUM(CASE WHEN e.release_status = 'pending_release' THEN e.amount ELSE 0 END) as total_pending_release,
    COUNT(*) as entry_count,
    MIN(e.created_at) as oldest_hold_date,
    COUNT(DISTINCT a.entity_id) as unique_recipients
  FROM entries e
  JOIN accounts a ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id
  WHERE a.ledger_id = p_ledger_id
    AND e.release_status IN ('held', 'pending_release')
    AND e.entry_type = 'credit'
    AND a.account_type = 'creator_balance'
  GROUP BY t.metadata->>'venture_id';
END;
$$;

-- ============================================================================
-- 12. FUNCTIONS: AUTO-RELEASE READY FUNDS
-- ============================================================================

CREATE OR REPLACE FUNCTION queue_auto_releases(p_ledger_id UUID)
RETURNS INTEGER
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
      AND e.hold_until IS NOT NULL
      AND e.hold_until <= NOW()
  LOOP
    BEGIN
      PERFORM request_fund_release(v_entry.id, NULL, 'auto');
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log but continue
      RAISE WARNING 'Failed to queue auto-release for entry %: %', v_entry.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 13. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON connected_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE ON escrow_releases TO service_role;
GRANT SELECT, INSERT, UPDATE ON payout_requests TO service_role;

GRANT EXECUTE ON FUNCTION register_connected_account TO service_role;
GRANT EXECUTE ON FUNCTION sync_connected_account_status TO service_role;
GRANT EXECUTE ON FUNCTION request_fund_release TO service_role;
GRANT EXECUTE ON FUNCTION complete_fund_release TO service_role;
GRANT EXECUTE ON FUNCTION fail_fund_release TO service_role;
GRANT EXECUTE ON FUNCTION get_held_funds_dashboard TO service_role;
GRANT EXECUTE ON FUNCTION get_escrow_summary TO service_role;
GRANT EXECUTE ON FUNCTION queue_auto_releases TO service_role;

-- ============================================================================
-- 14. COMMENTS
-- ============================================================================

COMMENT ON TABLE connected_accounts IS 
  'Stripe Custom connected accounts for creators/ventures. YOU control these accounts.';

COMMENT ON TABLE escrow_releases IS 
  'Queue of fund releases from platform escrow to connected accounts.';

COMMENT ON TABLE payout_requests IS 
  'Requests from creators to withdraw from their connected account to their bank.';

COMMENT ON COLUMN connected_accounts.payouts_paused IS 
  'CRITICAL: Keep true to maintain escrow control. Only enable for specific payouts.';

COMMENT ON FUNCTION request_fund_release IS 
  'Queue a held entry for release to connected account. Returns release ID.';
