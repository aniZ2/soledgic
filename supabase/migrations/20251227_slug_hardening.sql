-- soledgic: Slug Hardening
-- Immutability, soft-delete preservation, case-insensitive uniqueness

-- ============================================================================
-- 1. MAKE SLUGS IMMUTABLE AFTER CREATION
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_organization_slug()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: generate slug if not provided
  IF TG_OP = 'INSERT' THEN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
      NEW.slug := generate_unique_slug(NEW.name);
    ELSE
      -- Normalize provided slug
      NEW.slug := lower(trim(NEW.slug));
      NEW.slug := regexp_replace(NEW.slug, '[^a-z0-9-]+', '', 'g');
      
      -- Check uniqueness
      IF EXISTS (SELECT 1 FROM organizations WHERE lower(slug) = lower(NEW.slug)) THEN
        NEW.slug := generate_unique_slug(NEW.slug);
      END IF;
      
      -- Check reserved
      IF EXISTS (SELECT 1 FROM reserved_slugs WHERE lower(slug) = lower(NEW.slug)) THEN
        NEW.slug := generate_unique_slug(NEW.slug);
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- On UPDATE: FREEZE the slug - ignore any changes
  IF TG_OP = 'UPDATE' THEN
    -- Slug is immutable after creation
    NEW.slug := OLD.slug;
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_organization_slug ON organizations;
CREATE TRIGGER trigger_organization_slug
  BEFORE INSERT OR UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION handle_organization_slug();

-- ============================================================================
-- 2. CASE-INSENSITIVE UNIQUE INDEX
-- ============================================================================

-- Drop old unique constraint if exists
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_slug_key;

-- Create case-insensitive unique index
DROP INDEX IF EXISTS idx_organizations_slug_unique;
CREATE UNIQUE INDEX idx_organizations_slug_unique ON organizations (lower(slug));

-- Same for reserved_slugs
DROP INDEX IF EXISTS idx_reserved_slugs_lower;
CREATE UNIQUE INDEX idx_reserved_slugs_lower ON reserved_slugs (lower(slug));

-- ============================================================================
-- 3. PRESERVE SLUGS ON SOFT-DELETE
-- ============================================================================

-- Add deleted_at for soft deletes (if not exists)
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Function to handle organization deletion
CREATE OR REPLACE FUNCTION handle_organization_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Instead of hard delete, preserve the slug forever
  -- Add to reserved_slugs to prevent reuse
  INSERT INTO reserved_slugs (slug, reason)
  VALUES (OLD.slug, 'Previously used by organization: ' || OLD.name || ' (deleted ' || NOW() || ')')
  ON CONFLICT (slug) DO NOTHING;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_preserve_slug_on_delete ON organizations;
CREATE TRIGGER trigger_preserve_slug_on_delete
  BEFORE DELETE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION handle_organization_delete();

-- ============================================================================
-- 4. OPTIMIZED SLUG GENERATION WITH RANDOM HEX
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_unique_slug(base_name TEXT, table_name TEXT DEFAULT 'organizations')
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
  slug_exists BOOLEAN;
  is_reserved BOOLEAN;
  random_hex TEXT;
BEGIN
  -- Generate base slug (always lowercase)
  base_slug := lower(trim(base_name));
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  base_slug := substring(base_slug from 1 for 50);
  
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'organization';
  END IF;
  
  final_slug := base_slug;
  
  LOOP
    -- Case-insensitive check on reserved slugs
    SELECT EXISTS(SELECT 1 FROM reserved_slugs WHERE lower(slug) = lower(final_slug)) INTO is_reserved;
    
    -- Case-insensitive check on organizations
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE lower(slug) = lower($1))', table_name)
    INTO slug_exists
    USING final_slug;
    
    EXIT WHEN NOT slug_exists AND NOT is_reserved;
    
    counter := counter + 1;
    
    -- After 5 sequential attempts, switch to random hex suffix
    -- This prevents O(N) lookups for highly collided names like "marketing"
    -- Results in: acme, acme-1, acme-2, acme-3, acme-4, acme-5, acme-a3f2b1, acme-7c9d4e...
    IF counter > 5 THEN
      random_hex := substring(md5(random()::text || clock_timestamp()::text) from 1 for 6);
      final_slug := base_slug || '-' || random_hex;
    ELSE
      final_slug := base_slug || '-' || counter;
    END IF;
    
    -- Safety valve - extremely unlikely to hit
    IF counter > 100 THEN
      final_slug := base_slug || '-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 12);
      EXIT;
    END IF;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;
