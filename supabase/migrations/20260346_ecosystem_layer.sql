-- Ecosystem layer above organizations/platforms.
-- Keeps money and permissions scoped, while allowing multiple platforms to share
-- an ecosystem identity/control plane later.

CREATE TABLE IF NOT EXISTS public.ecosystems (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  owner_id uuid,
  description text,
  status text NOT NULL DEFAULT 'active',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecosystems_status_valid
    CHECK (status IN ('active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ecosystems_slug
  ON public.ecosystems (lower(slug));

CREATE INDEX IF NOT EXISTS idx_ecosystems_owner
  ON public.ecosystems (owner_id, status);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ecosystem_id uuid REFERENCES public.ecosystems(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_ecosystem_id
  ON public.organizations (ecosystem_id);

CREATE TABLE IF NOT EXISTS public.ecosystem_memberships (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  ecosystem_id uuid NOT NULL REFERENCES public.ecosystems(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecosystem_memberships_role_valid
    CHECK (role IN ('owner', 'admin', 'member')),
  CONSTRAINT ecosystem_memberships_status_valid
    CHECK (status IN ('active', 'invited', 'removed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ecosystem_membership_user
  ON public.ecosystem_memberships (ecosystem_id, user_id);

CREATE INDEX IF NOT EXISTS idx_ecosystem_memberships_user
  ON public.ecosystem_memberships (user_id, status);

CREATE INDEX IF NOT EXISTS idx_ecosystem_memberships_ecosystem
  ON public.ecosystem_memberships (ecosystem_id, status);

ALTER TABLE public.ecosystems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecosystem_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecosystems_service_all
  ON public.ecosystems AS PERMISSIVE
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY ecosystems_member_select
  ON public.ecosystems AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT em.ecosystem_id
      FROM public.ecosystem_memberships em
      WHERE em.user_id = auth.uid()
        AND em.status = 'active'
    )
    OR id IN (
      SELECT o.ecosystem_id
      FROM public.organizations o
      JOIN public.organization_members om ON om.organization_id = o.id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.ecosystem_id IS NOT NULL
    )
  );

CREATE POLICY ecosystem_memberships_service_all
  ON public.ecosystem_memberships AS PERMISSIVE
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY ecosystem_memberships_self_select
  ON public.ecosystem_memberships AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trigger_ecosystems_updated
  BEFORE UPDATE ON public.ecosystems
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_ecosystem_memberships_updated
  BEFORE UPDATE ON public.ecosystem_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

WITH bootstrapped AS (
  INSERT INTO public.ecosystems (
    name,
    slug,
    owner_id,
    description,
    settings,
    created_at,
    updated_at
  )
  SELECT
    o.name,
    o.slug,
    o.owner_id,
    'Bootstrapped from organization "' || o.name || '"',
    jsonb_build_object(
      'bootstrapped_from_organization_id', o.id,
      'bootstrapped_at', now()
    ),
    COALESCE(o.created_at, now()),
    now()
  FROM public.organizations o
  WHERE o.ecosystem_id IS NULL
  ON CONFLICT ((lower(slug))) DO NOTHING
)
SELECT 1;

UPDATE public.organizations o
SET ecosystem_id = e.id
FROM public.ecosystems e
WHERE o.ecosystem_id IS NULL
  AND lower(e.slug) = lower(o.slug);

INSERT INTO public.ecosystem_memberships (
  ecosystem_id,
  user_id,
  role,
  status,
  metadata
)
SELECT
  o.ecosystem_id,
  o.owner_id,
  'owner',
  'active',
  jsonb_build_object(
    'bootstrapped_from_organization_id', o.id,
    'source', 'organization_owner'
  )
FROM public.organizations o
WHERE o.ecosystem_id IS NOT NULL
  AND o.owner_id IS NOT NULL
ON CONFLICT (ecosystem_id, user_id) DO UPDATE
SET role = EXCLUDED.role,
    status = EXCLUDED.status,
    metadata = public.ecosystem_memberships.metadata || EXCLUDED.metadata;
