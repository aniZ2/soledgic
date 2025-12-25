-- Soledgic: User and Auth Schema
-- Extends Supabase Auth with organization membership

-- ============================================================================
-- ENSURE ORGANIZATIONS TABLE EXISTS
-- ============================================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- ============================================================================
-- ORGANIZATION MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'auditor')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);

-- ============================================================================
-- ORGANIZATION INVITES
-- ============================================================================

-- Use replace() on gen_random_uuid() to create a token instead of gen_random_bytes
CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_org_invites_token ON organization_invites(token) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON organization_invites(email) WHERE accepted_at IS NULL;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own memberships" ON organization_members;
DROP POLICY IF EXISTS "Org admins can manage members" ON organization_members;
DROP POLICY IF EXISTS "Org admins can create invites" ON organization_invites;
DROP POLICY IF EXISTS "Anyone can view invite by token" ON organization_invites;

-- Organization members: users can see their own memberships
CREATE POLICY "Users can view their own memberships"
  ON organization_members FOR SELECT
  USING (user_id = auth.uid());

-- Organization members: owners/admins can manage members
CREATE POLICY "Org admins can manage members"
  ON organization_members FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Organization invites: admins can create invites
CREATE POLICY "Org admins can create invites"
  ON organization_invites FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Organization invites: anyone can view invites by token (for accepting)
CREATE POLICY "Anyone can view invite by token"
  ON organization_invites FOR SELECT
  USING (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get user's organization
CREATE OR REPLACE FUNCTION get_user_organization(p_user_id UUID)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  organization_plan TEXT,
  user_role TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id as organization_id,
    o.name as organization_name,
    o.slug as organization_slug,
    o.plan as organization_plan,
    om.role as user_role
  FROM organization_members om
  JOIN organizations o ON om.organization_id = o.id
  WHERE om.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id UUID,
  p_organization_id UUID,
  p_required_role TEXT DEFAULT 'member'
) RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_role_rank INTEGER;
  v_required_rank INTEGER;
BEGIN
  -- Get user's role
  SELECT role INTO v_role
  FROM organization_members
  WHERE user_id = p_user_id AND organization_id = p_organization_id;
  
  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Role hierarchy
  v_role_rank := CASE v_role
    WHEN 'owner' THEN 100
    WHEN 'admin' THEN 80
    WHEN 'member' THEN 50
    WHEN 'auditor' THEN 30
    WHEN 'viewer' THEN 10
    ELSE 0
  END;
  
  v_required_rank := CASE p_required_role
    WHEN 'owner' THEN 100
    WHEN 'admin' THEN 80
    WHEN 'member' THEN 50
    WHEN 'auditor' THEN 30
    WHEN 'viewer' THEN 10
    ELSE 0
  END;
  
  RETURN v_role_rank >= v_required_rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE organization_members IS 'Links users to organizations with roles';
COMMENT ON TABLE organization_invites IS 'Pending invitations to join organizations';
COMMENT ON FUNCTION get_user_organization IS 'Get the organization a user belongs to';
COMMENT ON FUNCTION user_has_permission IS 'Check if user has required permission level';
