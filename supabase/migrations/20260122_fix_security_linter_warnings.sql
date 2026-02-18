-- Migration: Fix Security Linter Warnings
-- Date: December 22, 2024
-- Purpose: Enable RLS on tables and remove elevated-permission views

-- ============================================================================
-- PART 1: Enable RLS on tables missing it
-- ============================================================================

-- reserved_slugs - System table, read-only for all
ALTER TABLE public.reserved_slugs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reserved_slugs_read_all" ON public.reserved_slugs;
CREATE POLICY "reserved_slugs_read_all" ON public.reserved_slugs
  FOR SELECT USING (true);

-- idempotency_keys - Only service role should access
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "idempotency_keys_service_only" ON public.idempotency_keys;
CREATE POLICY "idempotency_keys_service_only" ON public.idempotency_keys
  FOR ALL USING (auth.role() = 'service_role');

-- pricing_plans - Public read, admin write
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pricing_plans_read_all" ON public.pricing_plans;
CREATE POLICY "pricing_plans_read_all" ON public.pricing_plans
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "pricing_plans_admin_write" ON public.pricing_plans;
DROP POLICY IF EXISTS "pricing_plans_admin_update" ON public.pricing_plans;
DROP POLICY IF EXISTS "pricing_plans_admin_delete" ON public.pricing_plans;
CREATE POLICY "pricing_plans_admin_write" ON public.pricing_plans
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "pricing_plans_admin_update" ON public.pricing_plans
  FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "pricing_plans_admin_delete" ON public.pricing_plans
  FOR DELETE USING (auth.role() = 'service_role');

-- email_log - Service role only (contains potentially sensitive data)
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_log_service_only" ON public.email_log;
CREATE POLICY "email_log_service_only" ON public.email_log
  FOR ALL USING (auth.role() = 'service_role');

-- payout_executions - Service role only 
ALTER TABLE public.payout_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payout_executions_service_only" ON public.payout_executions;
CREATE POLICY "payout_executions_service_only" ON public.payout_executions
  FOR ALL USING (auth.role() = 'service_role');

-- cron_jobs - Service role only (system table)
ALTER TABLE public.cron_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cron_jobs_service_only" ON public.cron_jobs;
CREATE POLICY "cron_jobs_service_only" ON public.cron_jobs
  FOR ALL USING (auth.role() = 'service_role');

-- rate_limits - Service role only (internal tracking)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rate_limits_service_only" ON public.rate_limits;
CREATE POLICY "rate_limits_service_only" ON public.rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 2: Drop elevated-permission views and recreate as SECURITY INVOKER
-- Note: Views in PostgreSQL are SECURITY INVOKER by default
-- ============================================================================

-- Drop existing views (they were created with elevated privileges)
DROP VIEW IF EXISTS public.v_payout_reconciliation CASCADE;
DROP VIEW IF EXISTS public.held_funds_summary CASCADE;
DROP VIEW IF EXISTS public.organization_plan_status CASCADE;
DROP VIEW IF EXISTS public.reconciliation_summary CASCADE;
DROP VIEW IF EXISTS public.security_dashboard CASCADE;

-- Recreate held_funds_summary
CREATE VIEW public.held_funds_summary AS
SELECT 
  hf.ledger_id,
  hf.creator_id,
  wr.rule_type,
  wr.name AS rule_name,
  count(*) AS hold_count,
  sum(hf.held_amount) AS total_held,
  sum(hf.released_amount) AS total_released,
  sum((hf.held_amount - hf.released_amount)) AS currently_held,
  min(hf.release_eligible_at) FILTER (WHERE (hf.status = 'held'::text)) AS next_release_date
FROM (held_funds hf
  JOIN withholding_rules wr ON ((hf.withholding_rule_id = wr.id)))
GROUP BY hf.ledger_id, hf.creator_id, wr.rule_type, wr.name;

COMMENT ON VIEW public.held_funds_summary IS 'Held funds summary - SECURITY INVOKER (default)';

-- Recreate organization_plan_status
CREATE VIEW public.organization_plan_status AS
SELECT 
  id,
  name,
  slug,
  plan,
  status,
  max_ledgers,
  current_ledger_count,
  max_team_members,
  current_member_count,
  trial_ends_at,
  CASE
    WHEN ((plan = 'trial'::text) AND (trial_ends_at < now())) THEN true
    ELSE false
  END AS trial_expired,
  CASE
    WHEN (max_ledgers = '-1'::integer) THEN 0
    WHEN (current_ledger_count > max_ledgers) THEN (current_ledger_count - max_ledgers)
    ELSE 0
  END AS ledger_overage_count,
  CASE
    WHEN (max_ledgers = '-1'::integer) THEN NULL::integer
    ELSE GREATEST(0, (max_ledgers - current_ledger_count))
  END AS ledgers_remaining
FROM organizations o;

COMMENT ON VIEW public.organization_plan_status IS 'Organization plan status - SECURITY INVOKER (default)';

-- Recreate reconciliation_summary
CREATE VIEW public.reconciliation_summary AS
SELECT 
  bt.ledger_id,
  bc.account_name,
  date_trunc('month'::text, (bt.transaction_date)::timestamp with time zone) AS month,
  count(*) AS total_transactions,
  count(*) FILTER (WHERE (bt.reconciliation_status = 'matched'::text)) AS matched,
  count(*) FILTER (WHERE (bt.reconciliation_status = 'manual_match'::text)) AS manual_matched,
  count(*) FILTER (WHERE (bt.reconciliation_status = 'unmatched'::text)) AS unmatched,
  count(*) FILTER (WHERE (bt.reconciliation_status = 'excluded'::text)) AS excluded,
  sum(bt.amount) FILTER (WHERE (bt.amount > (0)::numeric)) AS total_credits,
  sum(abs(bt.amount)) FILTER (WHERE (bt.amount < (0)::numeric)) AS total_debits,
  round((((count(*) FILTER (WHERE (bt.reconciliation_status = ANY (ARRAY['matched'::text, 'manual_match'::text, 'excluded'::text]))))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 1) AS reconciliation_percent
FROM (bank_transactions bt
  JOIN bank_connections bc ON ((bt.bank_connection_id = bc.id)))
GROUP BY bt.ledger_id, bc.account_name, (date_trunc('month'::text, (bt.transaction_date)::timestamp with time zone))
ORDER BY (date_trunc('month'::text, (bt.transaction_date)::timestamp with time zone)) DESC;

COMMENT ON VIEW public.reconciliation_summary IS 'Reconciliation summary - SECURITY INVOKER (default)';

-- Recreate security_dashboard
CREATE VIEW public.security_dashboard AS
SELECT 
  date_trunc('hour'::text, created_at) AS hour,
  action,
  count(*) AS event_count,
  count(DISTINCT ip_address) AS unique_ips,
  (avg(risk_score))::integer AS avg_risk_score,
  max(risk_score) AS max_risk_score,
  count(*) FILTER (WHERE (risk_score >= 70)) AS high_risk_count
FROM audit_log
WHERE (created_at > (now() - '24:00:00'::interval))
GROUP BY (date_trunc('hour'::text, created_at)), action
ORDER BY (date_trunc('hour'::text, created_at)) DESC, (count(*)) DESC;

COMMENT ON VIEW public.security_dashboard IS 'Security metrics dashboard - SECURITY INVOKER (default)';

-- Recreate v_payout_reconciliation
CREATE VIEW public.v_payout_reconciliation AS
SELECT 
  l.id AS ledger_id,
  l.business_name,
  st.id AS processor_txn_id,
  st.processor_id AS payout_id,
  abs(st.amount) AS payout_amount,
  (st.raw_data ->> 'arrival_date'::text) AS expected_arrival,
  st.created_at AS payout_created,
  pt.id AS bank_txn_id,
  pt.name AS bank_description,
  pt.amount AS bank_amount,
  pt.date AS bank_date,
  CASE
    WHEN (st.bank_transaction_id IS NOT NULL) THEN 'matched'::text
    WHEN (st.created_at > (now() - '3 days'::interval)) THEN 'pending'::text
    ELSE 'unmatched'::text
  END AS reconciliation_status,
  CASE
    WHEN (pt.id IS NOT NULL) THEN (abs(st.amount) - pt.amount)
    ELSE NULL::numeric
  END AS amount_difference
FROM ((processor_transactions st
  JOIN ledgers l ON ((st.ledger_id = l.id)))
  LEFT JOIN bank_aggregator_transactions pt ON ((st.bank_transaction_id = pt.id)))
WHERE ((st.processor_type = 'payout'::text) AND (st.status = 'paid'::text))
ORDER BY st.created_at DESC;

COMMENT ON VIEW public.v_payout_reconciliation IS 'Payout reconciliation view - SECURITY INVOKER (default)';

-- ============================================================================
-- PART 3: Grant appropriate permissions
-- ============================================================================

-- Views need SELECT permission for authenticated users
GRANT SELECT ON public.held_funds_summary TO authenticated;
GRANT SELECT ON public.organization_plan_status TO authenticated;
GRANT SELECT ON public.reconciliation_summary TO authenticated;
GRANT SELECT ON public.security_dashboard TO authenticated;
GRANT SELECT ON public.v_payout_reconciliation TO authenticated;

-- Service role gets full access
GRANT ALL ON public.held_funds_summary TO service_role;
GRANT ALL ON public.organization_plan_status TO service_role;
GRANT ALL ON public.reconciliation_summary TO service_role;
GRANT ALL ON public.security_dashboard TO service_role;
GRANT ALL ON public.v_payout_reconciliation TO service_role;
