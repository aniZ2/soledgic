-- ============================================================================
-- HOTFIX: Simple organizations INSERT policy for onboarding
-- Drop all existing policies and create minimal working set
-- ============================================================================

-- Ensure the function exists (idempotent)
CREATE OR REPLACE FUNCTION get_user_organization_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_user_organization_ids(UUID) TO authenticated;

-- Drop ALL existing policies on organizations
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'organizations' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON organizations', pol.policyname);
    END LOOP;
END;
$$;

-- Create minimal working policies

-- INSERT: Any authenticated user can create (needed for onboarding)
CREATE POLICY "org_insert"
  ON organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- SELECT: Users can view orgs they belong to
CREATE POLICY "org_select"
  ON organizations
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT get_user_organization_ids(auth.uid()))
  );

-- UPDATE: Users can update orgs they belong to  
CREATE POLICY "org_update"
  ON organizations
  FOR UPDATE
  TO authenticated
  USING (id IN (SELECT get_user_organization_ids(auth.uid())))
  WITH CHECK (id IN (SELECT get_user_organization_ids(auth.uid())));

-- DELETE: Users can delete orgs they own (via membership check)
CREATE POLICY "org_delete"
  ON organizations
  FOR DELETE
  TO authenticated
  USING (id IN (SELECT get_user_organization_ids(auth.uid())));

-- Drop ALL existing policies on organization_members
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'organization_members' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON organization_members', pol.policyname);
    END LOOP;
END;
$$;

-- INSERT: Users can add themselves as member
CREATE POLICY "members_insert"
  ON organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- SELECT: Users can view their own memberships
CREATE POLICY "members_select_own"
  ON organization_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- SELECT: Users can view members in their orgs
CREATE POLICY "members_select_org"
  ON organization_members
  FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- UPDATE: Users can update memberships in their orgs
CREATE POLICY "members_update"
  ON organization_members
  FOR UPDATE
  TO authenticated
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- DELETE: Users can remove members from their orgs
CREATE POLICY "members_delete"
  ON organization_members
  FOR DELETE
  TO authenticated
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));
