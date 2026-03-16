-- Migration: Set all plan limits to unlimited (-1) while billing integration is pending
-- This removes enforcement of ledger, team member, and transaction limits

-- 1. Change column defaults on organizations table
ALTER TABLE public.organizations ALTER COLUMN max_ledgers SET DEFAULT -1;
ALTER TABLE public.organizations ALTER COLUMN max_team_members SET DEFAULT -1;

-- 2. Update all existing organizations to unlimited
UPDATE public.organizations
SET max_ledgers = -1, max_team_members = -1
WHERE max_ledgers != -1 OR max_team_members != -1;

-- 3. Disable the enforce_ledger_limit trigger (it only logs, doesn't block, but no point running it)
ALTER TABLE public.ledgers DISABLE TRIGGER trigger_enforce_ledger_limit;

-- 4. Disable the enforce_member_limit trigger
ALTER TABLE public.organization_members DISABLE TRIGGER trigger_enforce_member_limit;
