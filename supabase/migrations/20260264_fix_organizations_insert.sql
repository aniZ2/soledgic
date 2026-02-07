-- ============================================================================
-- FIX: Organizations INSERT policy blocking new user onboarding
-- Drop ALL existing policies and recreate clean ones
-- ============================================================================

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
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END;
$$;

-- Create fresh policies

-- Anyone authenticated can create an organization
CREATE POLICY "authenticated_insert_organizations"
  ON organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can view orgs they belong to
CREATE POLICY "authenticated_select_organizations"
  ON organizations
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT get_user_organization_ids(auth.uid()))
  );

-- Users can update orgs they belong to
CREATE POLICY "authenticated_update_organizations"
  ON organizations
  FOR UPDATE
  TO authenticated
  USING (
    id IN (SELECT get_user_organization_ids(auth.uid()))
  )
  WITH CHECK (
    id IN (SELECT get_user_organization_ids(auth.uid()))
  );

-- Service role has full access
CREATE POLICY "service_role_all_organizations"
  ON organizations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also ensure organization_members allows insert during onboarding
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
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END;
$$;

-- Fresh organization_members policies

-- Users can view their own membership
CREATE POLICY "members_select_own"
  ON organization_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can view members in their orgs
CREATE POLICY "members_select_org"
  ON organization_members
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  );

-- Users can insert their own membership (onboarding)
CREATE POLICY "members_insert_own"
  ON organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Service role full access
CREATE POLICY "members_service_role"
  ON organization_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
