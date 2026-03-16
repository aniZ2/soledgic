-- Migration: Drop 4 dead/superseded tables
-- Each verified to have zero code + SQL references

-- api_key_scopes: superseded by api_keys.scopes array field
DROP TABLE IF EXISTS public.api_key_scopes CASCADE;

-- organization_invites: superseded by organization_invitations (with status field)
DROP TABLE IF EXISTS public.organization_invites CASCADE;

-- payment_methods: Stripe columns already dropped in 20260364; table is an empty shell
DROP TABLE IF EXISTS public.payment_methods CASCADE;

-- audit_sensitive_fields: planned feature never implemented
DROP TABLE IF EXISTS public.audit_sensitive_fields CASCADE;
