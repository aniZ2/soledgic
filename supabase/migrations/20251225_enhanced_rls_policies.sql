-- soledgic: Enhanced RLS Policies
-- Ensures immediate access revocation when members are removed

-- ============================================================================
-- LEDGERS: Full CRUD for org members based on role
-- ============================================================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Org members can view ledgers" ON ledgers;
DROP POLICY IF EXISTS "Org members can insert ledgers" ON ledgers;
DROP POLICY IF EXISTS "Org admins can insert ledgers" ON ledgers;
DROP POLICY IF EXISTS "Org admins can update ledgers" ON ledgers;
DROP POLICY IF EXISTS "Org owners can delete ledgers" ON ledgers;

-- Select: any active member can view
CREATE POLICY "Org members can view ledgers"
  ON ledgers FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() 
      AND status = 'active'
    )
  );

-- Insert: admin/owner can create
CREATE POLICY "Org admins can insert ledgers"
  ON ledgers FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() 
      AND status = 'active'
      AND role IN ('owner', 'admin')
    )
  );

-- Update: admin/owner can update
CREATE POLICY "Org admins can update ledgers"
  ON ledgers FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() 
      AND status = 'active'
      AND role IN ('owner', 'admin')
    )
  );

-- Delete: owner only
CREATE POLICY "Org owners can delete ledgers"
  ON ledgers FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() 
      AND status = 'active'
      AND role = 'owner'
    )
  );

-- ============================================================================
-- TRANSACTIONS: Inherit access from ledger
-- ============================================================================

DROP POLICY IF EXISTS "Users can view transactions" ON transactions;
DROP POLICY IF EXISTS "Org members can view transactions" ON transactions;
DROP POLICY IF EXISTS "Users can insert transactions" ON transactions;
DROP POLICY IF EXISTS "Org members can insert transactions" ON transactions;

CREATE POLICY "Org members can view transactions"
  ON transactions FOR SELECT
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
    )
  );

CREATE POLICY "Org members can insert transactions"
  ON transactions FOR INSERT
  WITH CHECK (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

-- ============================================================================
-- ACCOUNTS: Inherit access from ledger
-- ============================================================================

DROP POLICY IF EXISTS "Users can view accounts" ON accounts;
DROP POLICY IF EXISTS "Org members can view accounts" ON accounts;

CREATE POLICY "Org members can view accounts"
  ON accounts FOR SELECT
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
    )
  );

-- ============================================================================
-- ENTRIES: Inherit access via transaction -> ledger
-- ============================================================================

DROP POLICY IF EXISTS "Users can view entries" ON entries;
DROP POLICY IF EXISTS "Org members can view entries" ON entries;

CREATE POLICY "Org members can view entries"
  ON entries FOR SELECT
  USING (
    transaction_id IN (
      SELECT t.id FROM transactions t
      INNER JOIN ledgers l ON l.id = t.ledger_id
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
    )
  );

-- ============================================================================
-- PAYOUTS: Inherit access from ledger
-- ============================================================================

DROP POLICY IF EXISTS "Users can view payouts" ON payouts;
DROP POLICY IF EXISTS "Org members can view payouts" ON payouts;

CREATE POLICY "Org members can view payouts"
  ON payouts FOR SELECT
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
    )
  );

-- ============================================================================
-- ORGANIZATION MEMBERS: Additional policies
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage members" ON organization_members;
DROP POLICY IF EXISTS "Admins can remove members" ON organization_members;

-- Allow admins/owners to update members
CREATE POLICY "Admins can manage members"
  ON organization_members FOR UPDATE
  USING (
    organization_id IN (
      SELECT om2.organization_id FROM organization_members om2
      WHERE om2.user_id = auth.uid() 
      AND om2.status = 'active'
      AND om2.role IN ('owner', 'admin')
    )
  );

-- Allow admins/owners to remove members (but not themselves)
CREATE POLICY "Admins can remove members"
  ON organization_members FOR DELETE
  USING (
    organization_id IN (
      SELECT om2.organization_id FROM organization_members om2
      WHERE om2.user_id = auth.uid() 
      AND om2.status = 'active'
      AND om2.role IN ('owner', 'admin')
    )
    AND user_id != auth.uid()
  );

-- ============================================================================
-- ORGANIZATION INVITATIONS: Policies
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON organization_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON organization_invitations;

CREATE POLICY "Admins can view invitations"
  ON organization_invitations FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can create invitations"
  ON organization_invitations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update invitations"
  ON organization_invitations FOR UPDATE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- SUBSCRIPTIONS: Only org members can view
-- ============================================================================

DROP POLICY IF EXISTS "Org members can view subscriptions" ON subscriptions;

CREATE POLICY "Org members can view subscriptions"
  ON subscriptions FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
    )
  );

-- ============================================================================
-- BILLING EVENTS: Only org owners can view
-- ============================================================================

DROP POLICY IF EXISTS "Owners can view billing events" ON billing_events;

CREATE POLICY "Owners can view billing events"
  ON billing_events FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() 
      AND om.status = 'active'
      AND om.role = 'owner'
    )
  );
