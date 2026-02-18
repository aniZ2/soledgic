-- Soledgic: Organization Slug Generation
-- Handles slug creation on insert and ensures uniqueness

-- ============================================================================
-- SLUG GENERATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_unique_slug(base_name TEXT, table_name TEXT DEFAULT 'organizations')
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
  slug_exists BOOLEAN;
BEGIN
  -- Generate base slug: lowercase, replace non-alphanumeric with hyphens, trim
  base_slug := lower(trim(base_name));
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g'); -- Trim leading/trailing hyphens
  base_slug := substring(base_slug from 1 for 50); -- Max 50 chars for base
  
  -- Handle empty slug
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'organization';
  END IF;
  
  final_slug := base_slug;
  
  -- Check for uniqueness and append number if needed
  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE slug = $1)', table_name)
    INTO slug_exists
    USING final_slug;
    
    EXIT WHEN NOT slug_exists;
    
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
    
    -- Safety valve
    IF counter > 1000 THEN
      final_slug := base_slug || '-' || extract(epoch from now())::integer;
      EXIT;
    END IF;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-generate slug on organization insert
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_organization_slug()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate if slug is null or empty
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_unique_slug(NEW.name);
  ELSE
    -- Validate provided slug format
    NEW.slug := lower(trim(NEW.slug));
    NEW.slug := regexp_replace(NEW.slug, '[^a-z0-9-]+', '', 'g');
    
    -- Check uniqueness of provided slug
    IF EXISTS (SELECT 1 FROM organizations WHERE slug = NEW.slug AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
      -- Slug taken, generate unique one
      NEW.slug := generate_unique_slug(NEW.slug);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_organization_slug ON organizations;
CREATE TRIGGER trigger_organization_slug
  BEFORE INSERT OR UPDATE OF name, slug ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION handle_organization_slug();

-- ============================================================================
-- RESERVED SLUGS (prevent URL squatting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reserved_slugs (
  slug TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert reserved slugs
INSERT INTO reserved_slugs (slug, reason) VALUES
  -- System routes
  ('admin', 'System reserved'),
  ('api', 'System reserved'),
  ('app', 'System reserved'),
  ('auth', 'System reserved'),
  ('billing', 'System reserved'),
  ('dashboard', 'System reserved'),
  ('docs', 'System reserved'),
  ('help', 'System reserved'),
  ('login', 'System reserved'),
  ('logout', 'System reserved'),
  ('new', 'System reserved'),
  ('pricing', 'System reserved'),
  ('settings', 'System reserved'),
  ('signup', 'System reserved'),
  ('support', 'System reserved'),
  ('terms', 'System reserved'),
  ('privacy', 'System reserved'),
  ('status', 'System reserved'),
  ('ledgers', 'System reserved'),
  ('onboarding', 'System reserved'),
  ('invite', 'System reserved'),
  ('account', 'System reserved'),
  ('profile', 'System reserved'),
  ('webhooks', 'System reserved'),
  ('callback', 'System reserved'),
  ('oauth', 'System reserved'),
  ('sso', 'System reserved'),
  -- Marketing pages
  ('blog', 'System reserved'),
  ('about', 'System reserved'),
  ('contact', 'System reserved'),
  ('careers', 'System reserved'),
  ('press', 'System reserved'),
  ('legal', 'System reserved'),
  ('security', 'System reserved'),
  ('enterprise', 'System reserved'),
  ('demo', 'System reserved'),
  ('trial', 'System reserved'),
  ('features', 'System reserved'),
  ('customers', 'System reserved'),
  ('partners', 'System reserved'),
  ('integrations', 'System reserved'),
  ('changelog', 'System reserved'),
  ('roadmap', 'System reserved'),
  -- Brand protection
  ('soledgic', 'Brand protection'),
  ('soledgic', 'Brand protection'),
  ('soledgic', 'Brand protection'),
  ('anthropic', 'Brand protection'),
  ('processor', 'Brand protection'),
  ('supabase', 'Brand protection'),
  ('vercel', 'Brand protection'),
  ('google', 'Brand protection'),
  ('microsoft', 'Brand protection'),
  ('apple', 'Brand protection'),
  ('amazon', 'Brand protection'),
  ('facebook', 'Brand protection'),
  ('meta', 'Brand protection'),
  ('twitter', 'Brand protection'),
  -- Common phishing targets
  ('bank', 'Security reserved'),
  ('venmo', 'Security reserved'),
  ('coinbase', 'Security reserved'),
  ('crypto', 'Security reserved'),
  ('wallet', 'Security reserved'),
  ('irs', 'Security reserved'),
  ('government', 'Security reserved'),
  ('official', 'Security reserved'),
  ('secure', 'Security reserved'),
  ('verify', 'Security reserved'),
  ('confirm', 'Security reserved')
ON CONFLICT (slug) DO NOTHING;

-- Update slug function to check reserved slugs
CREATE OR REPLACE FUNCTION generate_unique_slug(base_name TEXT, table_name TEXT DEFAULT 'organizations')
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
  slug_exists BOOLEAN;
  is_reserved BOOLEAN;
BEGIN
  -- Generate base slug
  base_slug := lower(trim(base_name));
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  base_slug := substring(base_slug from 1 for 50);
  
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'organization';
  END IF;
  
  final_slug := base_slug;
  
  LOOP
    -- Check reserved slugs
    SELECT EXISTS(SELECT 1 FROM reserved_slugs WHERE slug = final_slug) INTO is_reserved;
    
    -- Check existing organizations
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE slug = $1)', table_name)
    INTO slug_exists
    USING final_slug;
    
    EXIT WHEN NOT slug_exists AND NOT is_reserved;
    
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
    
    IF counter > 1000 THEN
      final_slug := base_slug || '-' || extract(epoch from now())::integer;
      EXIT;
    END IF;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION CONSTRAINT
-- ============================================================================

-- Add check constraint for slug format
ALTER TABLE organizations 
DROP CONSTRAINT IF EXISTS organizations_slug_format;

ALTER TABLE organizations 
ADD CONSTRAINT organizations_slug_format 
CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' OR slug ~ '^[a-z0-9]$');
