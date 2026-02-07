-- ============================================================================
-- FIX: Infinite recursion in organization_members RLS policy
-- The previous policy queried organization_members within itself, causing recursion.
-- Solution: Create a privileged function that bypasses RLS to get user's orgs.
-- ============================================================================

-- Step 1: Create helper function that bypasses RLS
CREATE OR REPLACE FUNCTION get_user_organization_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = p_user_id
    AND status = 'active';
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_user_organization_ids(UUID) TO authenticated;

-- Step 2: Drop ALL existing policies on organization_members to start fresh
DROP POLICY IF EXISTS "Service role scoped access" ON organization_members;
DROP POLICY IF EXISTS "Service role full access" ON organization_members;
DROP POLICY IF EXISTS "Users can view own membership" ON organization_members;
DROP POLICY IF EXISTS "Users can view org members" ON organization_members;
DROP POLICY IF EXISTS "Users can insert own membership" ON organization_members;
DROP POLICY IF EXISTS "Members can view other members" ON organization_members;
DROP POLICY IF EXISTS "Admins can manage members" ON organization_members;
DROP POLICY IF EXISTS "Admins can remove members" ON organization_members;
DROP POLICY IF EXISTS "Users can view their own memberships" ON organization_members;
DROP POLICY IF EXISTS "Org admins can manage members" ON organization_members;
DROP POLICY IF EXISTS "Member list access" ON organization_members;

-- Step 3: Create fixed policies (non-recursive)

-- Policy for users to view their own membership row
CREATE POLICY "Users can view own membership"
  ON organization_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy for users to view other members in their org (uses helper function)
CREATE POLICY "Users can view org members"
  ON organization_members
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  );

-- Policy for inserting own membership (during onboarding)
CREATE POLICY "Users can insert own membership"
  ON organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy for service role (full access)
CREATE POLICY "Service role full access"
  ON organization_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Step 4: Also fix the organizations table policy if it has the same issue
DROP POLICY IF EXISTS "Service role scoped access" ON organizations;
DROP POLICY IF EXISTS "Service role full access" ON organizations;

CREATE POLICY "Users can view their organizations"
  ON organizations
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT get_user_organization_ids(auth.uid()))
  );

CREATE POLICY "Users can insert organizations"
  ON organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their organizations"
  ON organizations
  FOR UPDATE
  TO authenticated
  USING (
    id IN (SELECT get_user_organization_ids(auth.uid()))
  );

CREATE POLICY "Service role full access"
  ON organizations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
