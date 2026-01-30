-- Soledgic: Escrow/Hold System for Manual Release
-- This enables the "Banker Model" where funds are held until explicitly released

-- ============================================================================
-- 1. ADD RELEASE TRACKING TO ENTRIES
-- ============================================================================

ALTER TABLE entries 
  ADD COLUMN IF NOT EXISTS release_status TEXT DEFAULT 'held' 
    CHECK (release_status IN ('held', 'available', 'released', 'voided')),
  ADD COLUMN IF NOT EXISTS released_by UUID,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ;  -- Auto-release after this time

-- Index for finding held funds
CREATE INDEX IF NOT EXISTS idx_entries_held ON entries(release_status) 
  WHERE release_status = 'held';

-- Index for auto-release jobs
CREATE INDEX IF NOT EXISTS idx_entries_hold_until ON entries(hold_until) 
  WHERE release_status = 'held' AND hold_until IS NOT NULL;

COMMENT ON COLUMN entries.release_status IS 
  'held = in escrow, available = can be withdrawn but not transferred yet, released = transferred to connected account, voided = cancelled/refunded';

COMMENT ON COLUMN entries.hold_until IS 
  'If set, funds auto-release after this timestamp (e.g., after dispute window)';

-- ============================================================================
-- 2. ADD CONNECTED ACCOUNT TRACKING TO ACCOUNTS
-- ============================================================================

-- For creator_balance accounts, we need to track their Stripe Connected Account
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS stripe_connected_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_account_status TEXT DEFAULT 'pending'
    CHECK (stripe_account_status IN ('pending', 'restricted', 'enabled', 'disabled')),
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'not_started'
    CHECK (kyc_status IN ('not_started', 'pending', 'verified', 'failed')),
  ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_accounts_stripe_connected 
  ON accounts(stripe_connected_account_id) 
  WHERE stripe_connected_account_id IS NOT NULL;

-- ============================================================================
-- 3. HOLD CONFIGURATION PER LEDGER
-- ============================================================================

-- Add hold settings to ledger settings
COMMENT ON COLUMN ledgers.settings IS 
  'JSON settings including:
   - default_hold_days: number of days to hold funds before auto-release (default: 7)
   - require_manual_release: boolean, if true funds never auto-release
   - min_payout_amount: minimum balance for payout requests
   - auto_release_on_kyc: boolean, release held funds when creator passes KYC';

-- ============================================================================
-- 4. FUNCTION: RELEASE FUNDS
-- ============================================================================

CREATE OR REPLACE FUNCTION release_funds(
  p_entry_id UUID,
  p_released_by UUID,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  entry_id UUID,
  amount NUMERIC(14,2),
  creator_id TEXT,
  stripe_connected_account_id TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_account RECORD;
  v_existing_release BOOLEAN;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM entries 
      WHERE release_idempotency_key = p_idempotency_key
        AND release_status = 'released'
    ) INTO v_existing_release;
    
    IF v_existing_release THEN
      RETURN QUERY SELECT 
        true::BOOLEAN,
        p_entry_id,
        0::NUMERIC(14,2),
        ''::TEXT,
        ''::TEXT,
        'Already released (idempotent)'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Get entry details
  SELECT e.*, t.ledger_id, t.reference_id
  INTO v_entry
  FROM entries e
  JOIN transactions t ON e.transaction_id = t.id
  WHERE e.id = p_entry_id
  FOR UPDATE;  -- Lock the row
  
  IF v_entry IS NULL THEN
    RETURN QUERY SELECT 
      false::BOOLEAN, p_entry_id, 0::NUMERIC(14,2), ''::TEXT, ''::TEXT,
      'Entry not found'::TEXT;
    RETURN;
  END IF;
  
  IF v_entry.release_status != 'held' THEN
    RETURN QUERY SELECT 
      false::BOOLEAN, p_entry_id, v_entry.amount, ''::TEXT, ''::TEXT,
      format('Entry not in held status (current: %s)', v_entry.release_status)::TEXT;
    RETURN;
  END IF;
  
  -- Get the creator account
  SELECT a.*
  INTO v_account
  FROM accounts a
  WHERE a.id = v_entry.account_id;
  
  IF v_account.account_type != 'creator_balance' THEN
    RETURN QUERY SELECT 
      false::BOOLEAN, p_entry_id, v_entry.amount, ''::TEXT, ''::TEXT,
      'Can only release funds from creator_balance accounts'::TEXT;
    RETURN;
  END IF;
  
  IF v_account.stripe_connected_account_id IS NULL THEN
    RETURN QUERY SELECT 
      false::BOOLEAN, p_entry_id, v_entry.amount, v_account.entity_id, ''::TEXT,
      'Creator does not have a connected Stripe account'::TEXT;
    RETURN;
  END IF;
  
  -- Update entry to available (ready for transfer)
  UPDATE entries
  SET release_status = 'available',
      released_by = p_released_by,
      released_at = NOW(),
      release_idempotency_key = p_idempotency_key
  WHERE id = p_entry_id;
  
  -- Return success with details needed for Stripe Transfer
  RETURN QUERY SELECT 
    true::BOOLEAN,
    p_entry_id,
    v_entry.amount,
    v_account.entity_id,
    v_account.stripe_connected_account_id,
    NULL::TEXT;
END;
$$;

-- ============================================================================
-- 5. FUNCTION: GET HELD FUNDS (FOR ADMIN DASHBOARD)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_held_funds(
  p_ledger_id UUID,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  entry_id UUID,
  transaction_id UUID,
  creator_id TEXT,
  creator_name TEXT,
  amount NUMERIC(14,2),
  currency TEXT,
  hold_reason TEXT,
  hold_until TIMESTAMPTZ,
  held_since TIMESTAMPTZ,
  days_held INTEGER,
  reference_id TEXT,
  product_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as entry_id,
    e.transaction_id,
    a.entity_id as creator_id,
    a.name as creator_name,
    e.amount,
    t.currency,
    e.hold_reason,
    e.hold_until,
    e.created_at as held_since,
    EXTRACT(DAY FROM NOW() - e.created_at)::INTEGER as days_held,
    t.reference_id,
    t.metadata->>'product_name' as product_name
  FROM entries e
  JOIN transactions t ON e.transaction_id = t.id
  JOIN accounts a ON e.account_id = a.id
  WHERE t.ledger_id = p_ledger_id
    AND e.release_status = 'held'
    AND e.entry_type = 'credit'  -- Only show credits (money owed to creators)
    AND a.account_type = 'creator_balance'
  ORDER BY e.created_at ASC  -- Oldest first
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 6. FUNCTION: AUTO-RELEASE EXPIRED HOLDS (FOR CRON JOB)
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_release_expired_holds()
RETURNS TABLE (
  released_count INTEGER,
  total_amount NUMERIC(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_total NUMERIC(14,2) := 0;
BEGIN
  -- Update all entries past their hold_until time
  WITH released AS (
    UPDATE entries
    SET release_status = 'available',
        released_at = NOW(),
        released_by = NULL  -- System release
    WHERE release_status = 'held'
      AND hold_until IS NOT NULL
      AND hold_until <= NOW()
    RETURNING amount
  )
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_count, v_total
  FROM released;
  
  RETURN QUERY SELECT v_count, v_total;
END;
$$;

-- ============================================================================
-- 7. FUNCTION: VOID/CANCEL HELD FUNDS
-- ============================================================================

CREATE OR REPLACE FUNCTION void_held_funds(
  p_entry_id UUID,
  p_voided_by UUID,
  p_reason TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE entries
  SET release_status = 'voided',
      released_by = p_voided_by,
      released_at = NOW(),
      hold_reason = p_reason
  WHERE id = p_entry_id
    AND release_status = 'held';
  
  RETURN FOUND;
END;
$$;

-- ============================================================================
-- 8. GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION release_funds(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_held_funds(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auto_release_expired_holds() TO service_role;
GRANT EXECUTE ON FUNCTION void_held_funds(UUID, UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 9. CRON JOB FOR AUTO-RELEASE
-- ============================================================================

-- Run every hour to release funds past their hold_until time
-- Enable pg_cron extension first in Supabase Dashboard
-- SELECT cron.schedule('auto-release-holds', '0 * * * *', 'SELECT auto_release_expired_holds()');
