-- ============================================================================
-- HOTFIX: Slug trigger functions need elevated privileges
-- The BEFORE INSERT trigger checks organizations table but RLS blocks it
-- ============================================================================

-- Fix: generate_unique_slug must bypass RLS to check for existing slugs
CREATE OR REPLACE FUNCTION generate_unique_slug(base_name TEXT, table_name TEXT DEFAULT 'organizations')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    IF counter > 5 THEN
      random_hex := substring(md5(random()::text || clock_timestamp()::text) from 1 for 6);
      final_slug := base_slug || '-' || random_hex;
    ELSE
      final_slug := base_slug || '-' || counter;
    END IF;

    IF counter > 100 THEN
      final_slug := base_slug || '-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 12);
      EXIT;
    END IF;
  END LOOP;

  RETURN final_slug;
END;
$$;

-- Fix: handle_organization_slug must bypass RLS
CREATE OR REPLACE FUNCTION handle_organization_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On INSERT: generate slug if not provided
  IF TG_OP = 'INSERT' THEN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
      NEW.slug := generate_unique_slug(NEW.name);
    ELSE
      -- Normalize provided slug
      NEW.slug := lower(trim(NEW.slug));
      NEW.slug := regexp_replace(NEW.slug, '[^a-z0-9-]+', '', 'g');

      -- Check uniqueness (RLS bypassed via elevated privileges)
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
    NEW.slug := OLD.slug;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger to use updated function
DROP TRIGGER IF EXISTS trigger_organization_slug ON organizations;
CREATE TRIGGER trigger_organization_slug
  BEFORE INSERT OR UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION handle_organization_slug();
