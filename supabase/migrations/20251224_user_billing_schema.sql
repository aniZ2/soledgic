-- soledgic: User & Billing Schema
-- Extends existing schema with user accounts, organizations, and subscriptions

-- ============================================================================
-- USERS (extends Supabase auth.users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Profile
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  
  -- Preferences
  timezone TEXT DEFAULT 'America/New_York',
  date_format TEXT DEFAULT 'MM/DD/YYYY',
  currency TEXT DEFAULT 'USD',
  
  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================================
-- ORGANIZATIONS (billing entity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic info
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  -- Owner
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Billing
  processor_customer_id TEXT UNIQUE,
  processor_subscription_id TEXT,
  
  -- Plan
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (
    plan IN ('trial', 'pro', 'business', 'scale')
  ),
  plan_started_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Trial
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  
  -- Limits (from plan)
  max_ledgers INTEGER DEFAULT 3,
  max_team_members INTEGER DEFAULT 1,
  
  -- Usage
  current_ledger_count INTEGER DEFAULT 0,
  current_member_count INTEGER DEFAULT 1,
  
  -- Overage
  overage_ledger_price INTEGER DEFAULT 2000, -- $20 in cents
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (
    status IN ('active', 'past_due', 'canceled', 'suspended')
  ),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_processor ON organizations(processor_customer_id);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ORGANIZATION MEMBERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role
  role TEXT NOT NULL DEFAULT 'member' CHECK (
    role IN ('owner', 'admin', 'member', 'viewer')
  ),
  
  -- Invitation
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'active', 'removed')
  ),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ORGANIZATION INVITATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Invite details
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  
  -- Token (using uuid as hex string instead of gen_random_bytes)
  token TEXT UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  
  -- Who invited
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'expired', 'revoked')
  ),
  
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_org ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON organization_invitations(token);

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SUBSCRIPTIONS (processor sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- processor IDs
  processor_subscription_id TEXT UNIQUE NOT NULL,
  processor_customer_id TEXT NOT NULL,
  processor_price_id TEXT NOT NULL,
  
  -- Plan details
  plan TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL CHECK (
    status IN (
      'trialing', 'active', 'past_due', 'canceled', 
      'unpaid', 'incomplete', 'incomplete_expired', 'paused'
    )
  ),
  
  -- Dates
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  
  -- Usage
  quantity INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_processor ON subscriptions(processor_subscription_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- BILLING EVENTS (audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- processor event
  processor_event_id TEXT UNIQUE,
  processor_event_type TEXT NOT NULL,
  
  -- Details
  amount INTEGER, -- in cents
  currency TEXT DEFAULT 'usd',
  description TEXT,
  
  -- Raw data
  processor_data JSONB,
  
  -- Processing
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_processor ON billing_events(processor_event_id);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- LINK LEDGERS TO ORGANIZATIONS
-- ============================================================================

ALTER TABLE ledgers 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ledgers_organization ON ledgers(organization_id);

-- ============================================================================
-- PRICING CONFIG (for reference)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pricing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  
  -- processor
  processor_price_id_monthly TEXT,
  processor_price_id_yearly TEXT,
  
  -- Pricing
  price_monthly INTEGER NOT NULL, -- cents
  price_yearly INTEGER, -- cents
  
  -- Limits
  max_ledgers INTEGER NOT NULL,
  max_team_members INTEGER NOT NULL,
  
  -- Features (for display)
  features JSONB DEFAULT '[]',
  
  -- Overage
  overage_ledger_price INTEGER DEFAULT 2000, -- $20
  
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed pricing plans
INSERT INTO pricing_plans (id, name, price_monthly, max_ledgers, max_team_members, sort_order, features) VALUES
('pro', 'Pro', 4900, 3, 1, 1, '["3 ledgers", "API access", "Receipts & reconciliation", "Email support"]'),
('business', 'Business', 24900, 10, 10, 2, '["10 ledgers", "Team members (up to 10)", "Priority support", "Everything in Pro"]'),
('scale', 'Scale', 99900, -1, -1, 3, '["Unlimited ledgers", "Unlimited team members", "Dedicated support", "SLA", "Everything in Business"]')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Update ledger count on organization
CREATE OR REPLACE FUNCTION update_org_ledger_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.organization_id IS NOT NULL THEN
    UPDATE organizations
    SET current_ledger_count = current_ledger_count + 1,
        updated_at = NOW()
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'DELETE' AND OLD.organization_id IS NOT NULL THEN
    UPDATE organizations
    SET current_ledger_count = current_ledger_count - 1,
        updated_at = NOW()
    WHERE id = OLD.organization_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ledger_count ON ledgers;
CREATE TRIGGER trigger_ledger_count
  AFTER INSERT OR DELETE ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION update_org_ledger_count();

-- Update member count on organization
CREATE OR REPLACE FUNCTION update_org_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE organizations
    SET current_member_count = current_member_count + 1,
        updated_at = NOW()
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status != 'active') THEN
    UPDATE organizations
    SET current_member_count = current_member_count - 1,
        updated_at = NOW()
    WHERE id = COALESCE(OLD.organization_id, NEW.organization_id);
  ELSIF TG_OP = 'UPDATE' AND OLD.status != 'active' AND NEW.status = 'active' THEN
    UPDATE organizations
    SET current_member_count = current_member_count + 1,
        updated_at = NOW()
    WHERE id = NEW.organization_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_member_count ON organization_members;
CREATE TRIGGER trigger_member_count
  AFTER INSERT OR UPDATE OR DELETE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION update_org_member_count();

-- Check if organization can add more ledgers
CREATE OR REPLACE FUNCTION can_add_ledger(p_organization_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_max INTEGER;
  v_current INTEGER;
  v_plan TEXT;
BEGIN
  SELECT max_ledgers, current_ledger_count, plan
  INTO v_max, v_current, v_plan
  FROM organizations
  WHERE id = p_organization_id;
  
  -- Scale plan has unlimited (-1)
  IF v_max = -1 THEN
    RETURN true;
  END IF;
  
  -- Allow overage (will be billed)
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Organizations: members can view
DROP POLICY IF EXISTS "Members can view organization" ON organizations;
CREATE POLICY "Members can view organization"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    OR owner_id = auth.uid()
  );

-- Organizations: owner can update
DROP POLICY IF EXISTS "Owner can update organization" ON organizations;
CREATE POLICY "Owner can update organization"
  ON organizations FOR UPDATE
  USING (owner_id = auth.uid());

-- Organizations: users can create
DROP POLICY IF EXISTS "Users can create organization" ON organizations;
CREATE POLICY "Users can create organization"
  ON organizations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Organization members: members can view
DROP POLICY IF EXISTS "Members can view other members" ON organization_members;
CREATE POLICY "Members can view other members"
  ON organization_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    OR user_id = auth.uid()
  );

-- Organization members: can insert own membership
DROP POLICY IF EXISTS "Users can insert own membership" ON organization_members;
CREATE POLICY "Users can insert own membership"
  ON organization_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Ledgers: org members can view
DROP POLICY IF EXISTS "Org members can view ledgers" ON ledgers;
CREATE POLICY "Org members can view ledgers"
  ON ledgers FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    OR organization_id IS NULL
  );

-- Ledgers: org members can insert
DROP POLICY IF EXISTS "Org members can insert ledgers" ON ledgers;
CREATE POLICY "Org members can insert ledgers"
  ON ledgers FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_user_profiles_updated ON user_profiles;
CREATE TRIGGER trigger_user_profiles_updated
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_organizations_updated ON organizations;
CREATE TRIGGER trigger_organizations_updated
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_subscriptions_updated ON subscriptions;
CREATE TRIGGER trigger_subscriptions_updated
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
