-- Soledgic v1 Baseline Schema
-- Generated from production database
-- Project: ocjrcsmoeikxfooeglkt

BEGIN;

-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA graphql;
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ============================================
-- TABLES
-- ============================================
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  period_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  fiscal_year integer NOT NULL,
  period_number integer NOT NULL,
  status text DEFAULT 'open'::text,
  closed_at timestamp with time zone,
  closed_by text,
  close_notes text,
  reopened_at timestamp with time zone,
  reopened_by text,
  reopen_reason text,
  closing_trial_balance jsonb,
  closing_hash text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  account_type text NOT NULL,
  entity_id text,
  entity_type text,
  name text NOT NULL,
  balance numeric(14,2) DEFAULT 0.00,
  currency text DEFAULT 'USD'::text,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adjustment_journals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  original_transaction_id uuid,
  adjustment_type text NOT NULL,
  reason text NOT NULL,
  supporting_documentation text,
  prepared_by text NOT NULL,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  adjustment_date date NOT NULL,
  affects_period_start date,
  affects_period_end date,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alert_configurations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  alert_type text NOT NULL,
  channel text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  thresholds jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  last_triggered_at timestamp with time zone,
  trigger_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alert_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  alert_config_id uuid,
  alert_type text NOT NULL,
  channel text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  error_message text,
  response_status integer,
  response_body text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_key_scopes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  api_key text DEFAULT encode(gen_random_bytes(32), 'hex'::text) NOT NULL,
  api_key_hash text,
  role text NOT NULL,
  name text NOT NULL,
  description text,
  can_write_transactions boolean DEFAULT false,
  can_close_periods boolean DEFAULT false,
  can_create_adjustments boolean DEFAULT false,
  can_export boolean DEFAULT true,
  can_view_all boolean DEFAULT true,
  is_active boolean DEFAULT true,
  expires_at timestamp with time zone,
  created_by text,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  scopes text[] DEFAULT ARRAY['read'::text] NOT NULL,
  allowed_ips cidr[],
  rate_limit_per_minute integer DEFAULT 60,
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  last_used_at timestamp with time zone,
  last_used_ip inet,
  revoked_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  actor_type text,
  actor_id text,
  ip_address inet,
  request_body jsonb,
  response_status integer,
  created_at timestamp with time zone DEFAULT now(),
  user_agent text,
  request_id text,
  duration_ms integer,
  risk_score integer DEFAULT 0,
  session_id text,
  geo_country text,
  geo_region text,
  seq_num bigint,
  prev_hash text,
  row_hash text
);

CREATE TABLE IF NOT EXISTS public.audit_log_archive (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  actor_type text,
  actor_id text,
  ip_address inet,
  request_body jsonb,
  response_status integer,
  created_at timestamp with time zone DEFAULT now(),
  user_agent text,
  request_id text,
  duration_ms integer,
  risk_score integer DEFAULT 0,
  session_id text,
  geo_country text,
  geo_region text,
  seq_num bigint,
  prev_hash text,
  row_hash text
);

CREATE TABLE IF NOT EXISTS public.audit_sensitive_fields (
  field_path text NOT NULL,
  reason text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.authorizing_instruments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  external_ref text NOT NULL,
  fingerprint text NOT NULL,
  extracted_terms jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'active'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.auto_match_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
  action text NOT NULL,
  action_config jsonb DEFAULT '{}'::jsonb,
  priority integer DEFAULT 100,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL,
  account_last_four text,
  plaid_account_id text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  provider text NOT NULL,
  provider_account_id text,
  provider_institution_id text,
  account_name text NOT NULL,
  account_type text,
  account_mask text,
  institution_name text,
  linked_account_id uuid,
  last_sync_at timestamp with time zone,
  sync_cursor text,
  sync_status text DEFAULT 'active'::text,
  sync_error text,
  current_balance numeric(14,2),
  available_balance numeric(14,2),
  balance_updated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  bank_account_id uuid NOT NULL,
  bank_statement_id uuid,
  transaction_date date NOT NULL,
  post_date date,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  reference_number text,
  check_number text,
  merchant_name text,
  category_hint text,
  match_status text DEFAULT 'unmatched'::text,
  matched_transaction_id uuid,
  matched_at timestamp with time zone,
  matched_by text,
  split_parent_id uuid,
  exclusion_reason text,
  import_batch_id text,
  raw_data jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_statements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  bank_account_id uuid NOT NULL,
  statement_month date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  file_url text NOT NULL,
  file_name text,
  file_size integer,
  file_hash text,
  mime_type text DEFAULT 'application/pdf'::text,
  opening_balance numeric(14,2),
  closing_balance numeric(14,2),
  total_deposits numeric(14,2),
  total_withdrawals numeric(14,2),
  status text DEFAULT 'uploaded'::text,
  verified_at timestamp with time zone,
  verified_by text,
  uploaded_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  bank_connection_id uuid NOT NULL,
  provider_transaction_id text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'USD'::text,
  transaction_date date NOT NULL,
  posted_date date,
  name text,
  merchant_name text,
  category text[],
  reconciliation_status text DEFAULT 'unmatched'::text,
  matched_transaction_id uuid,
  matched_at timestamp with time zone,
  matched_by text,
  match_confidence numeric(3,2),
  excluded_reason text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid,
  stripe_event_id text,
  stripe_event_type text NOT NULL,
  amount integer,
  currency text DEFAULT 'usd'::text,
  description text,
  stripe_data jsonb,
  processed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_overage_charges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text DEFAULT 'usd'::text NOT NULL,
  included_ledgers integer DEFAULT 1 NOT NULL,
  included_team_members integer DEFAULT 1 NOT NULL,
  current_ledger_count integer DEFAULT 0 NOT NULL,
  current_member_count integer DEFAULT 0 NOT NULL,
  additional_ledgers integer DEFAULT 0 NOT NULL,
  additional_team_members integer DEFAULT 0 NOT NULL,
  overage_ledger_price integer DEFAULT 2000 NOT NULL,
  overage_team_member_price integer DEFAULT 2000 NOT NULL,
  amount_cents integer NOT NULL,
  status text DEFAULT 'queued'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_attempt_at timestamp with time zone,
  processor_payment_id text,
  error text,
  raw jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  included_transactions integer DEFAULT 1000 NOT NULL,
  current_transaction_count integer DEFAULT 0 NOT NULL,
  additional_transactions integer DEFAULT 0 NOT NULL,
  overage_transaction_price integer DEFAULT 2 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.budget_envelopes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  name text NOT NULL,
  category_id uuid,
  budget_amount numeric(14,2) NOT NULL,
  budget_period text NOT NULL,
  allow_rollover boolean DEFAULT false,
  rollover_amount numeric(14,2) DEFAULT 0,
  current_period_start date,
  current_period_spent numeric(14,2) DEFAULT 0,
  current_period_remaining numeric(14,2),
  alert_at_percentage integer DEFAULT 80,
  alert_email text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  amount integer NOT NULL,
  currency text DEFAULT 'USD'::text NOT NULL,
  creator_id text NOT NULL,
  product_id text,
  product_name text,
  customer_email text,
  customer_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  success_url text NOT NULL,
  cancel_url text,
  processor_identity_id text,
  setup_state text,
  setup_state_expires_at timestamp with time zone,
  creator_percent numeric NOT NULL,
  creator_amount integer NOT NULL,
  platform_amount integer NOT NULL,
  payment_id text,
  reference_id text,
  status text DEFAULT 'pending'::text NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.connected_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  display_name text,
  email text,
  stripe_account_id text,
  stripe_account_type text DEFAULT 'custom'::text,
  stripe_status text DEFAULT 'pending'::text,
  charges_enabled boolean DEFAULT false,
  payouts_enabled boolean DEFAULT false,
  details_submitted boolean DEFAULT false,
  payout_schedule jsonb DEFAULT '{"interval": "manual"}'::jsonb,
  payouts_paused boolean DEFAULT true,
  requirements_current jsonb DEFAULT '[]'::jsonb,
  requirements_past_due jsonb DEFAULT '[]'::jsonb,
  requirements_pending jsonb DEFAULT '[]'::jsonb,
  default_bank_account_id text,
  default_bank_last4 text,
  default_bank_name text,
  is_active boolean DEFAULT true,
  can_receive_transfers boolean DEFAULT false,
  can_request_payouts boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  processor_identity_id text,
  setup_state text,
  setup_state_expires_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.contractor_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  contractor_id uuid NOT NULL,
  transaction_id uuid,
  amount numeric(14,2) NOT NULL,
  payment_date date NOT NULL,
  payment_method text,
  payment_reference text,
  tax_year integer NOT NULL,
  included_in_1099 boolean DEFAULT false,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contractors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  company_name text,
  stripe_account_id text,
  paypal_email text,
  w9_status text DEFAULT 'not_requested'::text,
  w9_received_date date,
  w9_expires_date date,
  address_on_file boolean DEFAULT false,
  ytd_payments numeric(14,2) DEFAULT 0,
  lifetime_payments numeric(14,2) DEFAULT 0,
  needs_1099 boolean DEFAULT false,
  last_1099_year integer,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_payout_summaries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  entity_id text NOT NULL,
  tax_year integer NOT NULL,
  gross_earnings numeric(14,2) DEFAULT 0,
  refunds_issued numeric(14,2) DEFAULT 0,
  net_earnings numeric(14,2) DEFAULT 0,
  total_paid_out numeric(14,2) DEFAULT 0,
  payout_count integer DEFAULT 0,
  stripe_account_id text,
  reconciled_with_stripe boolean DEFAULT false,
  last_reconciled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_tiers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  tier_name text NOT NULL,
  tier_order integer NOT NULL,
  creator_percent numeric(5,2) NOT NULL,
  threshold_type text,
  threshold_value numeric(14,2),
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cron_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid,
  job_name text NOT NULL,
  job_type text NOT NULL,
  schedule text NOT NULL,
  timezone text DEFAULT 'UTC'::text,
  enabled boolean DEFAULT true,
  last_run_at timestamp with time zone,
  last_run_status text,
  next_run_at timestamp with time zone,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.drift_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  run_id uuid NOT NULL,
  expected_balance numeric(15,2) NOT NULL,
  actual_balance numeric(15,2) NOT NULL,
  drift_amount numeric(15,2) NOT NULL,
  drift_percent numeric(8,4) NOT NULL,
  severity text DEFAULT 'warning'::text NOT NULL,
  acknowledged_at timestamp with time zone,
  acknowledged_by text,
  resolution_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  creator_id text,
  email_type text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  message_id text,
  error text,
  period_year integer,
  period_month integer,
  created_at timestamp with time zone DEFAULT now(),
  sent_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transaction_id uuid NOT NULL,
  account_id uuid NOT NULL,
  entry_type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  running_balance numeric(14,2),
  created_at timestamp with time zone DEFAULT now(),
  release_status text DEFAULT 'held'::text,
  released_at timestamp with time zone,
  released_by uuid,
  release_idempotency_key text,
  release_transfer_id text,
  hold_reason text,
  hold_until timestamp with time zone,
  currency text DEFAULT 'USD'::text
);

CREATE TABLE IF NOT EXISTS public.escrow_releases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  connected_account_id uuid,
  recipient_stripe_account text,
  recipient_entity_type text NOT NULL,
  recipient_entity_id text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'USD'::text,
  release_type text DEFAULT 'manual'::text,
  status text DEFAULT 'pending'::text,
  stripe_transfer_id text,
  stripe_transfer_group text,
  stripe_error_code text,
  stripe_error_message text,
  requested_at timestamp with time zone DEFAULT now(),
  requested_by uuid,
  approved_at timestamp with time zone,
  approved_by uuid,
  executed_at timestamp with time zone,
  idempotency_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  attachment_type text NOT NULL,
  receipt_id uuid,
  bank_statement_id uuid,
  file_url text,
  file_name text,
  page_number integer,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  schedule_c_line integer,
  irs_category text,
  parent_id uuid,
  requires_receipt boolean DEFAULT false,
  receipt_threshold numeric(10,2) DEFAULT 75,
  is_active boolean DEFAULT true,
  is_mileage boolean DEFAULT false,
  mileage_rate numeric(5,3),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.health_check_results (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid,
  check_type text NOT NULL,
  run_at timestamp with time zone DEFAULT now() NOT NULL,
  status text NOT NULL,
  checks jsonb DEFAULT '[]'::jsonb NOT NULL,
  total_checks integer DEFAULT 0,
  passed_checks integer DEFAULT 0,
  warning_checks integer DEFAULT 0,
  failed_checks integer DEFAULT 0,
  alerts_sent boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.held_funds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  withholding_rule_id uuid,
  creator_id text NOT NULL,
  held_amount numeric(14,2) NOT NULL,
  released_amount numeric(14,2) DEFAULT 0,
  status text DEFAULT 'held'::text,
  held_at timestamp with time zone DEFAULT now(),
  release_eligible_at timestamp with time zone,
  released_at timestamp with time zone,
  release_transaction_id uuid,
  hold_reason text,
  release_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  request_hash text,
  expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.import_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  name text NOT NULL,
  bank_name text,
  format text DEFAULT 'csv'::text NOT NULL,
  mapping jsonb NOT NULL,
  skip_rows integer DEFAULT 0,
  delimiter text DEFAULT ','::text,
  date_format text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.internal_transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  from_account_id uuid NOT NULL,
  to_account_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'USD'::text,
  transfer_type text NOT NULL,
  description text,
  scheduled_date date,
  executed_at timestamp with time zone,
  is_recurring boolean DEFAULT false,
  recurrence_rule text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  transaction_id uuid,
  amount bigint NOT NULL,
  payment_date date DEFAULT CURRENT_DATE NOT NULL,
  payment_method text,
  reference_id text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  invoice_number text NOT NULL,
  reference_id text,
  customer_name text NOT NULL,
  customer_email text,
  customer_id text,
  customer_address jsonb,
  line_items jsonb DEFAULT '[]'::jsonb NOT NULL,
  subtotal bigint DEFAULT 0 NOT NULL,
  tax_rate numeric(5,4) DEFAULT 0,
  tax_amount bigint DEFAULT 0 NOT NULL,
  discount_amount bigint DEFAULT 0 NOT NULL,
  total_amount bigint DEFAULT 0 NOT NULL,
  amount_paid bigint DEFAULT 0 NOT NULL,
  amount_due bigint DEFAULT 0 NOT NULL,
  currency text DEFAULT 'USD'::text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  issue_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date,
  sent_at timestamp with time zone,
  viewed_at timestamp with time zone,
  paid_at timestamp with time zone,
  voided_at timestamp with time zone,
  void_reason text,
  transaction_id uuid,
  notes text,
  terms text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ledgers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_name text NOT NULL,
  api_key_hash text NOT NULL,
  webhook_url text,
  status text DEFAULT 'active'::text,
  settings jsonb DEFAULT '{"payout_schedule": "manual", "min_payout_amount": 10.00, "tax_withholding_percent": 0, "default_platform_fee_percent": 20}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  organization_id uuid,
  ledger_mode text DEFAULT 'standard'::text,
  email_config jsonb,
  payout_rails jsonb DEFAULT '[]'::jsonb,
  stripe_webhook_secret_vault_id uuid,
  stripe_secret_key_vault_id uuid,
  default_currency text DEFAULT 'USD'::text,
  ledger_group_id uuid,
  livemode boolean DEFAULT false,
  api_key text
);

CREATE TABLE IF NOT EXISTS public.mileage_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  transaction_id uuid,
  trip_date date NOT NULL,
  starting_location text NOT NULL,
  ending_location text NOT NULL,
  business_purpose text NOT NULL,
  miles numeric(10,2) NOT NULL,
  rate_per_mile numeric(5,3) NOT NULL,
  total_amount numeric(10,2) DEFAULT (miles * rate_per_mile),
  vehicle_id text,
  round_trip boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nacha_files (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_hash text NOT NULL,
  file_size_bytes integer NOT NULL,
  batch_count integer NOT NULL,
  entry_count integer NOT NULL,
  total_debit_amount numeric(14,2) NOT NULL,
  total_credit_amount numeric(14,2) NOT NULL,
  effective_date date NOT NULL,
  generated_by uuid,
  generated_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  downloaded_at timestamp with time zone,
  downloaded_by uuid,
  request_id text,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid,
  user_id uuid,
  ledger_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  action_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  read_at timestamp with time zone,
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.opening_balances (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  as_of_date date NOT NULL,
  source text NOT NULL,
  source_description text,
  verified boolean DEFAULT false,
  verified_by text,
  verified_at timestamp with time zone,
  total_assets numeric(14,2),
  total_liabilities numeric(14,2),
  total_equity numeric(14,2),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_monitor_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_at timestamp with time zone DEFAULT now() NOT NULL,
  triggered_by text DEFAULT 'cron'::text NOT NULL,
  overall_status text NOT NULL,
  checks jsonb DEFAULT '[]'::jsonb NOT NULL,
  total_checks integer DEFAULT 0 NOT NULL,
  ok_checks integer DEFAULT 0 NOT NULL,
  warning_checks integer DEFAULT 0 NOT NULL,
  critical_checks integer DEFAULT 0 NOT NULL,
  alert_sent boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  token text DEFAULT replace(((gen_random_uuid())::text || (gen_random_uuid())::text), '-'::text, ''::text) NOT NULL,
  invited_by uuid NOT NULL,
  status text DEFAULT 'pending'::text,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  invited_by uuid NOT NULL,
  token text DEFAULT replace(((gen_random_uuid())::text || (gen_random_uuid())::text), '-'::text, ''::text) NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  invited_by uuid,
  invited_at timestamp with time zone DEFAULT now(),
  accepted_at timestamp with time zone,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  owner_id uuid NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text DEFAULT 'trial'::text NOT NULL,
  plan_started_at timestamp with time zone DEFAULT now(),
  trial_ends_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
  max_ledgers integer DEFAULT 3,
  max_team_members integer DEFAULT 1,
  current_ledger_count integer DEFAULT 0,
  current_member_count integer DEFAULT 1,
  overage_ledger_price integer DEFAULT 2000,
  status text DEFAULT 'active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  billing_email text,
  logo_url text,
  settings jsonb DEFAULT '{}'::jsonb,
  stripe_default_payment_method_id text,
  billing_address jsonb,
  tax_id text,
  tax_exempt text DEFAULT 'none'::text,
  display_currency text DEFAULT 'USD'::text,
  overage_team_member_price integer DEFAULT 2000,
  max_transactions_per_month integer DEFAULT 1000,
  overage_transaction_price integer DEFAULT 2
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  stripe_payment_method_id text NOT NULL,
  type text NOT NULL,
  card_brand text,
  card_last4 text,
  card_exp_month integer,
  card_exp_year integer,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payout_executions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  rail text NOT NULL,
  external_id text,
  status text DEFAULT 'pending'::text NOT NULL,
  error text,
  amount integer NOT NULL,
  currency text DEFAULT 'USD'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  executed_at timestamp with time zone,
  completed_at timestamp with time zone,
  response_data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.payout_file_downloads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  file_path text NOT NULL,
  downloaded_by uuid,
  downloaded_at timestamp with time zone DEFAULT now(),
  ip_address inet,
  user_agent text
);

CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  connected_account_id uuid NOT NULL,
  recipient_entity_type text NOT NULL,
  recipient_entity_id text NOT NULL,
  requested_amount numeric(14,2) NOT NULL,
  approved_amount numeric(14,2),
  currency text DEFAULT 'USD'::text,
  status text DEFAULT 'pending'::text,
  stripe_payout_id text,
  stripe_arrival_date date,
  stripe_error_code text,
  stripe_error_message text,
  requested_at timestamp with time zone DEFAULT now(),
  requested_by uuid,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  rejection_reason text,
  executed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payout_schedule_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_at timestamp with time zone DEFAULT now(),
  status text,
  processed_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  account_id uuid NOT NULL,
  transaction_id uuid,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'USD'::text,
  payment_method text,
  payment_reference text,
  status text DEFAULT 'pending'::text,
  initiated_at timestamp with time zone DEFAULT now(),
  processed_at timestamp with time zone,
  completed_at timestamp with time zone,
  failed_at timestamp with time zone,
  failure_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pending_processor_refunds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  reference_id text NOT NULL,
  original_transaction_id uuid NOT NULL,
  refund_amount integer NOT NULL,
  reason text,
  refund_from text DEFAULT 'both'::text,
  external_refund_id text,
  processor_payment_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending'::text NOT NULL,
  error_message text,
  repaired_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plaid_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  item_id text NOT NULL,
  access_token text NOT NULL,
  institution_id text,
  institution_name text,
  status text DEFAULT 'active'::text NOT NULL,
  error_code text,
  error_message text,
  last_sync_at timestamp with time zone,
  cursor text,
  accounts jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  access_token_vault_id uuid
);

CREATE TABLE IF NOT EXISTS public.plaid_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  plaid_transaction_id text NOT NULL,
  plaid_account_id text NOT NULL,
  amount numeric(15,2) NOT NULL,
  date date NOT NULL,
  name text NOT NULL,
  merchant_name text,
  category text[],
  pending boolean DEFAULT false,
  matched_transaction_id uuid,
  match_status text DEFAULT 'unmatched'::text,
  match_confidence numeric(3,2),
  raw_data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  stripe_payout_id text,
  is_stripe_payout boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.prices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  stripe_price_id text NOT NULL,
  unit_amount integer,
  currency text DEFAULT 'usd'::text,
  billing_scheme text DEFAULT 'per_unit'::text,
  recurring_interval text,
  recurring_interval_count integer DEFAULT 1,
  usage_type text,
  aggregate_usage text,
  tiers jsonb,
  tiers_mode text,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id text NOT NULL,
  name text NOT NULL,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  price_monthly integer NOT NULL,
  price_yearly integer,
  max_ledgers integer NOT NULL,
  max_team_members integer NOT NULL,
  features jsonb DEFAULT '[]'::jsonb,
  overage_ledger_price integer DEFAULT 2000,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  overage_team_member_price integer DEFAULT 2000
);

CREATE TABLE IF NOT EXISTS public.processor_webhook_inbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  ledger_id uuid,
  event_id text,
  event_type text,
  resource_id text,
  livemode boolean,
  headers jsonb DEFAULT '{}'::jsonb NOT NULL,
  payload jsonb NOT NULL,
  signature_valid boolean,
  signature_error text,
  status text DEFAULT 'pending'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  processed_at timestamp with time zone,
  processing_error text,
  processing_started_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.product_splits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  product_id text NOT NULL,
  product_name text,
  creator_percent numeric(5,2) NOT NULL,
  creator_overrides jsonb DEFAULT '{}'::jsonb,
  effective_from timestamp with time zone DEFAULT now(),
  effective_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  stripe_product_id text NOT NULL,
  name text NOT NULL,
  description text,
  product_type text DEFAULT 'service'::text,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.projected_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  authorizing_instrument_id uuid NOT NULL,
  expected_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'USD'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  matched_transaction_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.race_condition_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid,
  event_type text NOT NULL,
  endpoint text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  endpoint text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamp with time zone DEFAULT now(),
  blocked_until timestamp with time zone,
  violation_count integer DEFAULT 0,
  last_violation_at timestamp with time zone,
  key_type text DEFAULT 'api_key'::text
);

CREATE TABLE IF NOT EXISTS public.receipt_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  category_id uuid,
  min_amount numeric(14,2),
  always_required boolean DEFAULT false,
  rule_name text NOT NULL,
  description text,
  enforcement_level text DEFAULT 'warn'::text,
  irs_requirement boolean DEFAULT false,
  irs_reference text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text,
  file_size integer,
  file_hash text,
  mime_type text,
  merchant_name text,
  transaction_date date,
  total_amount numeric(14,2),
  currency text DEFAULT 'USD'::text,
  ocr_processed boolean DEFAULT false,
  ocr_confidence numeric(5,2),
  ocr_raw_text text,
  status text DEFAULT 'uploaded'::text,
  uploaded_at timestamp with time zone DEFAULT now(),
  uploaded_via text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reconciliation_periods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  bank_connection_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  statement_opening_balance numeric(14,2),
  statement_closing_balance numeric(14,2),
  ledger_opening_balance numeric(14,2),
  ledger_closing_balance numeric(14,2),
  status text DEFAULT 'in_progress'::text,
  discrepancy_amount numeric(14,2),
  discrepancy_notes text,
  reconciled_at timestamp with time zone,
  reconciled_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reconciliation_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  expected_revenue numeric(14,2) NOT NULL,
  actual_deposits numeric(14,2) NOT NULL,
  expected_payouts numeric(14,2) NOT NULL,
  actual_payouts numeric(14,2) NOT NULL,
  revenue_difference numeric(14,2) DEFAULT (actual_deposits - expected_revenue),
  payout_difference numeric(14,2) DEFAULT (actual_payouts - expected_payouts),
  status text DEFAULT 'pending'::text,
  discrepancy_notes text,
  resolved_by text,
  resolved_at timestamp with time zone,
  external_report_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reconciliation_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  priority integer DEFAULT 100,
  is_active boolean DEFAULT true,
  conditions jsonb NOT NULL,
  action text NOT NULL,
  action_params jsonb DEFAULT '{}'::jsonb,
  times_applied integer DEFAULT 0,
  last_applied_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  run_type text NOT NULL,
  status text DEFAULT 'running'::text NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  stats jsonb DEFAULT '{}'::jsonb,
  drift_amount numeric(15,2),
  drift_percent numeric(8,4),
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reconciliation_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  bank_account_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  statement_opening_balance numeric(14,2),
  statement_closing_balance numeric(14,2),
  ledger_opening_balance numeric(14,2),
  ledger_closing_balance numeric(14,2),
  difference numeric(14,2),
  is_reconciled boolean DEFAULT false,
  total_statement_items integer DEFAULT 0,
  matched_items integer DEFAULT 0,
  unmatched_items integer DEFAULT 0,
  status text DEFAULT 'in_progress'::text,
  started_by text,
  started_at timestamp with time zone DEFAULT now(),
  completed_by text,
  completed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recurring_expense_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  name text NOT NULL,
  merchant_name text NOT NULL,
  category_id uuid,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'USD'::text,
  is_variable_amount boolean DEFAULT false,
  recurrence_interval text NOT NULL,
  recurrence_day integer,
  start_date date NOT NULL,
  end_date date,
  auto_create boolean DEFAULT false,
  business_purpose text,
  is_active boolean DEFAULT true,
  last_created_date date,
  next_due_date date,
  total_occurrences integer DEFAULT 0,
  total_amount_spent numeric(14,2) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.release_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  recipient_type text NOT NULL,
  recipient_id text NOT NULL,
  recipient_stripe_account_id text,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'USD'::text,
  release_type text DEFAULT 'manual'::text,
  scheduled_for timestamp with time zone,
  status text DEFAULT 'pending'::text,
  stripe_transfer_id text,
  stripe_error text,
  requested_by uuid,
  requested_at timestamp with time zone DEFAULT now(),
  approved_by uuid,
  approved_at timestamp with time zone,
  executed_at timestamp with time zone,
  idempotency_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_exports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  report_type text NOT NULL,
  parameters jsonb NOT NULL,
  period_start date,
  period_end date,
  format text,
  file_hash text,
  row_count integer,
  requested_by text,
  requested_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  status text DEFAULT 'pending'::text,
  error_message text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reserved_slugs (
  slug text NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.risk_evaluations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  proposed_transaction jsonb NOT NULL,
  signal text NOT NULL,
  risk_factors jsonb DEFAULT '[]'::jsonb NOT NULL,
  valid_until timestamp with time zone DEFAULT (now() + '02:00:00'::interval) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  acknowledged_at timestamp with time zone,
  acknowledged_by text
);

CREATE TABLE IF NOT EXISTS public.risk_policies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  policy_type text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  severity text DEFAULT 'hard'::text NOT NULL,
  priority integer DEFAULT 100 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.risk_score_definitions (
  action text NOT NULL,
  base_score integer NOT NULL,
  description text,
  soc2_control text
);

CREATE TABLE IF NOT EXISTS public.runway_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  snapshot_date date DEFAULT CURRENT_DATE NOT NULL,
  cash_balance numeric(14,2) NOT NULL,
  accounts_receivable numeric(14,2) DEFAULT 0,
  accounts_payable numeric(14,2) DEFAULT 0,
  avg_monthly_revenue numeric(14,2),
  avg_monthly_expenses numeric(14,2),
  avg_monthly_burn numeric(14,2),
  runway_months numeric(5,1),
  projected_cash_3mo numeric(14,2),
  projected_cash_6mo numeric(14,2),
  projected_cash_12mo numeric(14,2),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.security_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  severity text NOT NULL,
  alert_type text NOT NULL,
  title text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  acknowledged_at timestamp with time zone,
  acknowledged_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stripe_account_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  entity_id text NOT NULL,
  stripe_account_id text NOT NULL,
  stripe_account_type text,
  payouts_enabled boolean DEFAULT false,
  charges_enabled boolean DEFAULT false,
  linked_at timestamp with time zone DEFAULT now(),
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stripe_balance_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  snapshot_at timestamp with time zone NOT NULL,
  available jsonb NOT NULL,
  pending jsonb NOT NULL,
  raw_data jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.stripe_connected_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_name text,
  stripe_account_id text NOT NULL,
  stripe_account_type text DEFAULT 'custom'::text,
  status text DEFAULT 'pending'::text,
  charges_enabled boolean DEFAULT false,
  payouts_enabled boolean DEFAULT false,
  details_submitted boolean DEFAULT false,
  auto_payout_enabled boolean DEFAULT false,
  payout_schedule jsonb DEFAULT '{"interval": "manual"}'::jsonb,
  requirements_current jsonb,
  requirements_pending jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  livemode boolean DEFAULT false,
  status text DEFAULT 'pending'::text NOT NULL,
  processed_at timestamp with time zone,
  transaction_id uuid,
  error_message text,
  raw_data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.stripe_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  stripe_id text NOT NULL,
  stripe_type text NOT NULL,
  amount numeric(15,2) NOT NULL,
  fee numeric(15,2) DEFAULT 0,
  net numeric(15,2),
  currency text DEFAULT 'USD'::text,
  status text NOT NULL,
  description text,
  transaction_id uuid,
  match_status text DEFAULT 'unmatched'::text NOT NULL,
  match_confidence numeric(3,2),
  raw_data jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  bank_transaction_id uuid,
  bank_matched_at timestamp with time zone,
  fee_estimated boolean DEFAULT false,
  fee_estimate_reason text
);

CREATE TABLE IF NOT EXISTS public.subscription_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  subscription_id uuid NOT NULL,
  stripe_subscription_item_id text NOT NULL,
  stripe_price_id text NOT NULL,
  quantity integer DEFAULT 1,
  is_metered boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  stripe_subscription_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  stripe_price_id text NOT NULL,
  plan text NOT NULL,
  status text NOT NULL,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at timestamp with time zone,
  canceled_at timestamp with time zone,
  trial_start timestamp with time zone,
  trial_end timestamp with time zone,
  quantity integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_buckets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  account_id uuid,
  bucket_type text NOT NULL,
  name text NOT NULL,
  target_percentage numeric(5,2),
  target_amount numeric(14,2),
  state_code text,
  current_balance numeric(14,2) DEFAULT 0,
  ytd_contributed numeric(14,2) DEFAULT 0,
  ytd_paid_out numeric(14,2) DEFAULT 0,
  q1_estimated numeric(14,2) DEFAULT 0,
  q1_paid numeric(14,2) DEFAULT 0,
  q2_estimated numeric(14,2) DEFAULT 0,
  q2_paid numeric(14,2) DEFAULT 0,
  q3_estimated numeric(14,2) DEFAULT 0,
  q3_paid numeric(14,2) DEFAULT 0,
  q4_estimated numeric(14,2) DEFAULT 0,
  q4_paid numeric(14,2) DEFAULT 0,
  next_payment_due date,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  document_type text NOT NULL,
  tax_year integer NOT NULL,
  recipient_type text NOT NULL,
  recipient_id text NOT NULL,
  gross_amount numeric(15,2) NOT NULL,
  federal_withholding numeric(15,2) DEFAULT 0,
  state_withholding numeric(15,2) DEFAULT 0,
  transaction_count integer,
  monthly_amounts jsonb,
  status text DEFAULT 'calculated'::text NOT NULL,
  exported_at timestamp with time zone,
  exported_by uuid,
  export_format text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pdf_path text,
  pdf_generated_at timestamp with time zone,
  copy_type text DEFAULT 'b'::text
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  transaction_type text NOT NULL,
  reference_id text,
  reference_type text,
  description text,
  amount numeric(14,2) NOT NULL,
  currency text DEFAULT 'USD'::text,
  status text DEFAULT 'completed'::text,
  reversed_by uuid,
  reverses uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  correction_type text,
  correction_reason_code text,
  correction_reason_detail text,
  expense_category_id uuid,
  merchant_name text,
  business_purpose text,
  is_billable boolean DEFAULT false,
  client_id text,
  is_recurring boolean DEFAULT false,
  recurrence_interval text,
  recurrence_day integer,
  recurring_parent_id uuid,
  next_occurrence_date date,
  authorizing_instrument_id uuid,
  projection_id uuid,
  entry_method text DEFAULT 'manual'::text
);

CREATE TABLE IF NOT EXISTS public.trial_balance_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  snapshot_type text NOT NULL,
  snapshot_at timestamp with time zone DEFAULT now() NOT NULL,
  as_of_date date NOT NULL,
  balances jsonb NOT NULL,
  total_debits numeric(14,2) NOT NULL,
  total_credits numeric(14,2) NOT NULL,
  is_balanced boolean DEFAULT (total_debits = total_credits),
  balance_hash text NOT NULL,
  previous_snapshot_id uuid,
  previous_hash text,
  chain_valid boolean,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_aggregates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  date date NOT NULL,
  api_calls bigint DEFAULT 0,
  transactions_count bigint DEFAULT 0,
  creators_count bigint DEFAULT 0,
  storage_bytes bigint DEFAULT 0,
  computed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.usage_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  ledger_id uuid,
  usage_type text NOT NULL,
  quantity bigint DEFAULT 1 NOT NULL,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  stripe_usage_record_id text,
  synced_to_stripe_at timestamp with time zone,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  timezone text DEFAULT 'America/New_York'::text,
  date_format text DEFAULT 'MM/DD/YYYY'::text,
  currency text DEFAULT 'USD'::text,
  onboarding_completed boolean DEFAULT false,
  onboarding_step integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vault_access_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  secret_type text NOT NULL,
  secret_id text NOT NULL,
  accessed_by text NOT NULL,
  access_granted boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ventures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  venture_id text NOT NULL,
  name text NOT NULL,
  stripe_account_id text,
  release_policy text DEFAULT 'manual'::text,
  dispute_window_days integer DEFAULT 7,
  min_release_amount numeric(14,2) DEFAULT 0,
  default_creator_percent numeric(5,2) DEFAULT 80.00,
  default_platform_percent numeric(5,2) DEFAULT 20.00,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  endpoint_id uuid NOT NULL,
  ledger_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 5,
  response_status integer,
  response_body text,
  response_time_ms integer,
  scheduled_at timestamp with time zone DEFAULT now(),
  delivered_at timestamp with time zone,
  next_retry_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  url text NOT NULL,
  description text,
  secret text DEFAULT replace(((gen_random_uuid())::text || (gen_random_uuid())::text), '-'::text, ''::text) NOT NULL,
  events text[] DEFAULT ARRAY['*'::text] NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  previous_secret text,
  secret_rotated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending'::text,
  attempts integer DEFAULT 0,
  last_attempt_at timestamp with time zone,
  delivered_at timestamp with time zone,
  response_status integer,
  response_body text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.withholding_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  name text NOT NULL,
  rule_type text NOT NULL,
  applies_to text DEFAULT 'all'::text,
  creator_ids text[],
  product_ids text[],
  percent numeric(5,2) NOT NULL,
  min_amount numeric(14,2) DEFAULT 0,
  max_amount numeric(14,2),
  hold_days integer DEFAULT 0,
  release_trigger text DEFAULT 'automatic'::text,
  release_threshold numeric(14,2),
  is_active boolean DEFAULT true,
  priority integer DEFAULT 100,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- ============================================
-- PRIMARY KEYS AND UNIQUE CONSTRAINTS
-- ============================================
ALTER TABLE public.accounting_periods ADD CONSTRAINT accounting_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.accounting_periods ADD CONSTRAINT accounting_periods_ledger_id_period_start_period_end_key UNIQUE (ledger_id, period_start, period_end);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_ledger_id_account_type_entity_id_key UNIQUE (ledger_id, account_type, entity_id);
ALTER TABLE public.adjustment_journals ADD CONSTRAINT adjustment_journals_pkey PRIMARY KEY (id);
ALTER TABLE public.alert_configurations ADD CONSTRAINT alert_configurations_pkey PRIMARY KEY (id);
ALTER TABLE public.alert_configurations ADD CONSTRAINT unique_alert_config UNIQUE (ledger_id, alert_type, channel);
ALTER TABLE public.alert_history ADD CONSTRAINT alert_history_pkey PRIMARY KEY (id);
ALTER TABLE public.api_key_scopes ADD CONSTRAINT api_key_scopes_pkey PRIMARY KEY (id);
ALTER TABLE public.api_key_scopes ADD CONSTRAINT api_key_scopes_api_key_key UNIQUE (api_key);
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_log_archive ADD CONSTRAINT audit_log_archive_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_sensitive_fields ADD CONSTRAINT audit_sensitive_fields_pkey PRIMARY KEY (field_path);
ALTER TABLE public.authorizing_instruments ADD CONSTRAINT authorizing_instruments_pkey PRIMARY KEY (id);
ALTER TABLE public.authorizing_instruments ADD CONSTRAINT unique_external_ref_per_ledger UNIQUE (ledger_id, external_ref);
ALTER TABLE public.authorizing_instruments ADD CONSTRAINT unique_instrument_fingerprint UNIQUE (ledger_id, fingerprint);
ALTER TABLE public.auto_match_rules ADD CONSTRAINT auto_match_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_connections ADD CONSTRAINT bank_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_connections ADD CONSTRAINT bank_connections_ledger_id_provider_provider_account_id_key UNIQUE (ledger_id, provider, provider_account_id);
ALTER TABLE public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_statements ADD CONSTRAINT bank_statements_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_statements ADD CONSTRAINT bank_statements_ledger_id_bank_account_id_statement_month_key UNIQUE (ledger_id, bank_account_id, statement_month);
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_bank_connection_id_provider_transaction_i_key UNIQUE (bank_connection_id, provider_transaction_id);
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_stripe_event_id_key UNIQUE (stripe_event_id);
ALTER TABLE public.billing_overage_charges ADD CONSTRAINT billing_overage_charges_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_overage_charges ADD CONSTRAINT billing_overage_charges_organization_id_period_start_key UNIQUE (organization_id, period_start);
ALTER TABLE public.budget_envelopes ADD CONSTRAINT budget_envelopes_pkey PRIMARY KEY (id);
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_setup_state_key UNIQUE (setup_state);
ALTER TABLE public.connected_accounts ADD CONSTRAINT connected_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.connected_accounts ADD CONSTRAINT connected_accounts_ledger_id_entity_type_entity_id_key UNIQUE (ledger_id, entity_type, entity_id);
ALTER TABLE public.connected_accounts ADD CONSTRAINT connected_accounts_stripe_account_id_key UNIQUE (stripe_account_id);
ALTER TABLE public.contractor_payments ADD CONSTRAINT contractor_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.contractors ADD CONSTRAINT contractors_pkey PRIMARY KEY (id);
ALTER TABLE public.contractors ADD CONSTRAINT contractors_ledger_id_email_key UNIQUE (ledger_id, email);
ALTER TABLE public.creator_payout_summaries ADD CONSTRAINT creator_payout_summaries_pkey PRIMARY KEY (id);
ALTER TABLE public.creator_payout_summaries ADD CONSTRAINT creator_payout_summaries_ledger_id_entity_id_tax_year_key UNIQUE (ledger_id, entity_id, tax_year);
ALTER TABLE public.creator_tiers ADD CONSTRAINT creator_tiers_pkey PRIMARY KEY (id);
ALTER TABLE public.creator_tiers ADD CONSTRAINT creator_tiers_ledger_id_tier_name_key UNIQUE (ledger_id, tier_name);
ALTER TABLE public.cron_jobs ADD CONSTRAINT cron_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.cron_jobs ADD CONSTRAINT cron_jobs_ledger_id_job_name_key UNIQUE (ledger_id, job_name);
ALTER TABLE public.drift_alerts ADD CONSTRAINT drift_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.email_log ADD CONSTRAINT email_log_pkey PRIMARY KEY (id);
ALTER TABLE public.entries ADD CONSTRAINT entries_pkey PRIMARY KEY (id);
ALTER TABLE public.entries ADD CONSTRAINT entries_release_idempotency_key_key UNIQUE (release_idempotency_key);
ALTER TABLE public.escrow_releases ADD CONSTRAINT escrow_releases_pkey PRIMARY KEY (id);
ALTER TABLE public.escrow_releases ADD CONSTRAINT escrow_releases_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE public.expense_attachments ADD CONSTRAINT expense_attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_ledger_id_code_key UNIQUE (ledger_id, code);
ALTER TABLE public.health_check_results ADD CONSTRAINT health_check_results_pkey PRIMARY KEY (id);
ALTER TABLE public.held_funds ADD CONSTRAINT held_funds_pkey PRIMARY KEY (id);
ALTER TABLE public.idempotency_keys ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id);
ALTER TABLE public.idempotency_keys ADD CONSTRAINT idempotency_keys_ledger_id_idempotency_key_key UNIQUE (ledger_id, idempotency_key);
ALTER TABLE public.import_templates ADD CONSTRAINT import_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.import_templates ADD CONSTRAINT import_templates_ledger_id_name_key UNIQUE (ledger_id, name);
ALTER TABLE public.internal_transfers ADD CONSTRAINT internal_transfers_pkey PRIMARY KEY (id);
ALTER TABLE public.invoice_payments ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_ledger_invoice_number_unique UNIQUE (ledger_id, invoice_number);
ALTER TABLE public.ledgers ADD CONSTRAINT ledgers_pkey PRIMARY KEY (id);
ALTER TABLE public.mileage_entries ADD CONSTRAINT mileage_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.nacha_files ADD CONSTRAINT nacha_files_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.opening_balances ADD CONSTRAINT opening_balances_pkey PRIMARY KEY (id);
ALTER TABLE public.ops_monitor_runs ADD CONSTRAINT ops_monitor_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.organization_invitations ADD CONSTRAINT organization_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.organization_invitations ADD CONSTRAINT organization_invitations_token_key UNIQUE (token);
ALTER TABLE public.organization_invites ADD CONSTRAINT organization_invites_pkey PRIMARY KEY (id);
ALTER TABLE public.organization_invites ADD CONSTRAINT organization_invites_organization_id_email_key UNIQUE (organization_id, email);
ALTER TABLE public.organization_invites ADD CONSTRAINT organization_invites_token_key UNIQUE (token);
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_organization_id_user_id_key UNIQUE (organization_id, user_id);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_stripe_customer_id_key UNIQUE (stripe_customer_id);
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_stripe_payment_method_id_key UNIQUE (stripe_payment_method_id);
ALTER TABLE public.payout_executions ADD CONSTRAINT payout_executions_pkey PRIMARY KEY (id);
ALTER TABLE public.payout_file_downloads ADD CONSTRAINT payout_file_downloads_pkey PRIMARY KEY (id);
ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.payout_schedule_runs ADD CONSTRAINT payout_schedule_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.payouts ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_processor_refunds ADD CONSTRAINT pending_processor_refunds_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_processor_refunds ADD CONSTRAINT uq_pending_refund_ref UNIQUE (ledger_id, reference_id);
ALTER TABLE public.plaid_connections ADD CONSTRAINT plaid_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.plaid_connections ADD CONSTRAINT plaid_connections_ledger_id_item_id_key UNIQUE (ledger_id, item_id);
ALTER TABLE public.plaid_transactions ADD CONSTRAINT plaid_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.plaid_transactions ADD CONSTRAINT plaid_transactions_ledger_id_plaid_transaction_id_key UNIQUE (ledger_id, plaid_transaction_id);
ALTER TABLE public.prices ADD CONSTRAINT prices_pkey PRIMARY KEY (id);
ALTER TABLE public.prices ADD CONSTRAINT prices_stripe_price_id_key UNIQUE (stripe_price_id);
ALTER TABLE public.pricing_plans ADD CONSTRAINT pricing_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.processor_webhook_inbox ADD CONSTRAINT processor_webhook_inbox_pkey PRIMARY KEY (id);
ALTER TABLE public.product_splits ADD CONSTRAINT product_splits_pkey PRIMARY KEY (id);
ALTER TABLE public.product_splits ADD CONSTRAINT product_splits_ledger_id_product_id_key UNIQUE (ledger_id, product_id);
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE public.products ADD CONSTRAINT products_stripe_product_id_key UNIQUE (stripe_product_id);
ALTER TABLE public.projected_transactions ADD CONSTRAINT projected_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.projected_transactions ADD CONSTRAINT unique_projection UNIQUE (ledger_id, authorizing_instrument_id, expected_date, amount, currency);
ALTER TABLE public.race_condition_events ADD CONSTRAINT race_condition_events_pkey PRIMARY KEY (id);
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_key_endpoint_key UNIQUE (key, endpoint);
ALTER TABLE public.receipt_rules ADD CONSTRAINT receipt_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.receipts ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.reconciliation_periods ADD CONSTRAINT reconciliation_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.reconciliation_periods ADD CONSTRAINT reconciliation_periods_bank_connection_id_period_start_peri_key UNIQUE (bank_connection_id, period_start, period_end);
ALTER TABLE public.reconciliation_records ADD CONSTRAINT reconciliation_records_pkey PRIMARY KEY (id);
ALTER TABLE public.reconciliation_rules ADD CONSTRAINT reconciliation_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.reconciliation_runs ADD CONSTRAINT reconciliation_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.reconciliation_sessions ADD CONSTRAINT reconciliation_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.recurring_expense_templates ADD CONSTRAINT recurring_expense_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.release_queue ADD CONSTRAINT release_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.release_queue ADD CONSTRAINT release_queue_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE public.report_exports ADD CONSTRAINT report_exports_pkey PRIMARY KEY (id);
ALTER TABLE public.reserved_slugs ADD CONSTRAINT reserved_slugs_pkey PRIMARY KEY (slug);
ALTER TABLE public.risk_evaluations ADD CONSTRAINT authorization_decisions_pkey PRIMARY KEY (id);
ALTER TABLE public.risk_evaluations ADD CONSTRAINT unique_idempotency_key UNIQUE (ledger_id, idempotency_key);
ALTER TABLE public.risk_policies ADD CONSTRAINT authorization_policies_pkey PRIMARY KEY (id);
ALTER TABLE public.risk_policies ADD CONSTRAINT unique_policy_priority UNIQUE (ledger_id, policy_type, priority);
ALTER TABLE public.risk_score_definitions ADD CONSTRAINT risk_score_definitions_pkey PRIMARY KEY (action);
ALTER TABLE public.runway_snapshots ADD CONSTRAINT runway_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.security_alerts ADD CONSTRAINT security_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.stripe_account_links ADD CONSTRAINT stripe_account_links_pkey PRIMARY KEY (id);
ALTER TABLE public.stripe_account_links ADD CONSTRAINT stripe_account_links_ledger_id_entity_id_key UNIQUE (ledger_id, entity_id);
ALTER TABLE public.stripe_account_links ADD CONSTRAINT stripe_account_links_ledger_id_stripe_account_id_key UNIQUE (ledger_id, stripe_account_id);
ALTER TABLE public.stripe_balance_snapshots ADD CONSTRAINT stripe_balance_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.stripe_balance_snapshots ADD CONSTRAINT stripe_balance_snapshots_ledger_id_snapshot_at_key UNIQUE (ledger_id, snapshot_at);
ALTER TABLE public.stripe_connected_accounts ADD CONSTRAINT stripe_connected_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.stripe_connected_accounts ADD CONSTRAINT stripe_connected_accounts_ledger_id_entity_type_entity_id_key UNIQUE (ledger_id, entity_type, entity_id);
ALTER TABLE public.stripe_connected_accounts ADD CONSTRAINT stripe_connected_accounts_stripe_account_id_key UNIQUE (stripe_account_id);
ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_pkey PRIMARY KEY (id);
ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_ledger_id_stripe_event_id_key UNIQUE (ledger_id, stripe_event_id);
ALTER TABLE public.stripe_transactions ADD CONSTRAINT stripe_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.stripe_transactions ADD CONSTRAINT stripe_transactions_ledger_id_stripe_id_stripe_type_key UNIQUE (ledger_id, stripe_id, stripe_type);
ALTER TABLE public.subscription_items ADD CONSTRAINT subscription_items_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_items ADD CONSTRAINT subscription_items_stripe_subscription_item_id_key UNIQUE (stripe_subscription_item_id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
ALTER TABLE public.tax_buckets ADD CONSTRAINT tax_buckets_pkey PRIMARY KEY (id);
ALTER TABLE public.tax_documents ADD CONSTRAINT tax_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.tax_documents ADD CONSTRAINT tax_documents_ledger_id_document_type_tax_year_recipient_id_key UNIQUE (ledger_id, document_type, tax_year, recipient_id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.trial_balance_snapshots ADD CONSTRAINT trial_balance_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.usage_aggregates ADD CONSTRAINT usage_aggregates_pkey PRIMARY KEY (id);
ALTER TABLE public.usage_aggregates ADD CONSTRAINT usage_aggregates_organization_id_date_key UNIQUE (organization_id, date);
ALTER TABLE public.usage_records ADD CONSTRAINT usage_records_pkey PRIMARY KEY (id);
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.vault_access_log ADD CONSTRAINT vault_access_log_pkey PRIMARY KEY (id);
ALTER TABLE public.ventures ADD CONSTRAINT ventures_pkey PRIMARY KEY (id);
ALTER TABLE public.ventures ADD CONSTRAINT ventures_ledger_id_venture_id_key UNIQUE (ledger_id, venture_id);
ALTER TABLE public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE public.webhook_endpoints ADD CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id);
ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);
ALTER TABLE public.withholding_rules ADD CONSTRAINT withholding_rules_pkey PRIMARY KEY (id);

-- ============================================
-- FOREIGN KEYS
-- ============================================
ALTER TABLE public.accounting_periods ADD CONSTRAINT accounting_periods_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.adjustment_journals ADD CONSTRAINT adjustment_journals_original_transaction_id_fkey FOREIGN KEY (original_transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.adjustment_journals ADD CONSTRAINT adjustment_journals_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.adjustment_journals ADD CONSTRAINT adjustment_journals_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.alert_configurations ADD CONSTRAINT alert_configurations_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.alert_history ADD CONSTRAINT alert_history_alert_config_id_fkey FOREIGN KEY (alert_config_id) REFERENCES public.alert_configurations(id) ON DELETE SET NULL;
ALTER TABLE public.alert_history ADD CONSTRAINT alert_history_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.api_key_scopes ADD CONSTRAINT api_key_scopes_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE SET NULL;
ALTER TABLE public.authorizing_instruments ADD CONSTRAINT authorizing_instruments_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.auto_match_rules ADD CONSTRAINT auto_match_rules_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.bank_connections ADD CONSTRAINT bank_connections_linked_account_id_fkey FOREIGN KEY (linked_account_id) REFERENCES public.accounts(id);
ALTER TABLE public.bank_connections ADD CONSTRAINT bank_connections_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_bank_statement_id_fkey FOREIGN KEY (bank_statement_id) REFERENCES public.bank_statements(id);
ALTER TABLE public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_matched_transaction_id_fkey FOREIGN KEY (matched_transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.bank_statement_lines ADD CONSTRAINT bank_statement_lines_split_parent_id_fkey FOREIGN KEY (split_parent_id) REFERENCES public.bank_statement_lines(id);
ALTER TABLE public.bank_statements ADD CONSTRAINT bank_statements_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.bank_statements ADD CONSTRAINT bank_statements_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_bank_connection_id_fkey FOREIGN KEY (bank_connection_id) REFERENCES public.bank_connections(id) ON DELETE CASCADE;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_matched_transaction_id_fkey FOREIGN KEY (matched_transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.billing_overage_charges ADD CONSTRAINT billing_overage_charges_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.budget_envelopes ADD CONSTRAINT budget_envelopes_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.budget_envelopes ADD CONSTRAINT budget_envelopes_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id);
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id);
ALTER TABLE public.connected_accounts ADD CONSTRAINT connected_accounts_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.contractor_payments ADD CONSTRAINT contractor_payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.contractor_payments ADD CONSTRAINT contractor_payments_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;
ALTER TABLE public.contractor_payments ADD CONSTRAINT contractor_payments_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.contractors ADD CONSTRAINT contractors_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.creator_payout_summaries ADD CONSTRAINT creator_payout_summaries_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.creator_tiers ADD CONSTRAINT creator_tiers_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.cron_jobs ADD CONSTRAINT cron_jobs_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.drift_alerts ADD CONSTRAINT drift_alerts_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.drift_alerts ADD CONSTRAINT drift_alerts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.reconciliation_runs(id) ON DELETE CASCADE;
ALTER TABLE public.email_log ADD CONSTRAINT email_log_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.entries ADD CONSTRAINT entries_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);
ALTER TABLE public.entries ADD CONSTRAINT entries_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;
ALTER TABLE public.escrow_releases ADD CONSTRAINT escrow_releases_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.escrow_releases ADD CONSTRAINT escrow_releases_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id);
ALTER TABLE public.escrow_releases ADD CONSTRAINT escrow_releases_connected_account_id_fkey FOREIGN KEY (connected_account_id) REFERENCES public.connected_accounts(id);
ALTER TABLE public.escrow_releases ADD CONSTRAINT escrow_releases_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.expense_attachments ADD CONSTRAINT expense_attachments_bank_statement_id_fkey FOREIGN KEY (bank_statement_id) REFERENCES public.bank_statements(id);
ALTER TABLE public.expense_attachments ADD CONSTRAINT expense_attachments_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id);
ALTER TABLE public.expense_attachments ADD CONSTRAINT expense_attachments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;
ALTER TABLE public.expense_attachments ADD CONSTRAINT expense_attachments_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.expense_categories(id);
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.health_check_results ADD CONSTRAINT health_check_results_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.held_funds ADD CONSTRAINT held_funds_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.held_funds ADD CONSTRAINT held_funds_release_transaction_id_fkey FOREIGN KEY (release_transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.held_funds ADD CONSTRAINT held_funds_withholding_rule_id_fkey FOREIGN KEY (withholding_rule_id) REFERENCES public.withholding_rules(id);
ALTER TABLE public.held_funds ADD CONSTRAINT held_funds_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.idempotency_keys ADD CONSTRAINT idempotency_keys_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.import_templates ADD CONSTRAINT import_templates_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.internal_transfers ADD CONSTRAINT internal_transfers_to_account_id_fkey FOREIGN KEY (to_account_id) REFERENCES public.accounts(id);
ALTER TABLE public.internal_transfers ADD CONSTRAINT internal_transfers_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.internal_transfers ADD CONSTRAINT internal_transfers_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.internal_transfers ADD CONSTRAINT internal_transfers_from_account_id_fkey FOREIGN KEY (from_account_id) REFERENCES public.accounts(id);
ALTER TABLE public.invoice_payments ADD CONSTRAINT invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_payments ADD CONSTRAINT invoice_payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.ledgers ADD CONSTRAINT ledgers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.mileage_entries ADD CONSTRAINT mileage_entries_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.mileage_entries ADD CONSTRAINT mileage_entries_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.nacha_files ADD CONSTRAINT nacha_files_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.opening_balances ADD CONSTRAINT opening_balances_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.opening_balances ADD CONSTRAINT opening_balances_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.organization_invitations ADD CONSTRAINT organization_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.organization_invites ADD CONSTRAINT organization_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.payout_executions ADD CONSTRAINT payout_executions_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.payout_executions ADD CONSTRAINT payout_executions_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.payout_file_downloads ADD CONSTRAINT payout_file_downloads_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_connected_account_id_fkey FOREIGN KEY (connected_account_id) REFERENCES public.connected_accounts(id);
ALTER TABLE public.payouts ADD CONSTRAINT payouts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);
ALTER TABLE public.payouts ADD CONSTRAINT payouts_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.payouts ADD CONSTRAINT payouts_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.pending_processor_refunds ADD CONSTRAINT pending_processor_refunds_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.plaid_connections ADD CONSTRAINT plaid_connections_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.plaid_transactions ADD CONSTRAINT plaid_transactions_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.plaid_connections(id) ON DELETE CASCADE;
ALTER TABLE public.plaid_transactions ADD CONSTRAINT plaid_transactions_matched_transaction_id_fkey FOREIGN KEY (matched_transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.plaid_transactions ADD CONSTRAINT plaid_transactions_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.prices ADD CONSTRAINT prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.processor_webhook_inbox ADD CONSTRAINT processor_webhook_inbox_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE SET NULL;
ALTER TABLE public.product_splits ADD CONSTRAINT product_splits_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.projected_transactions ADD CONSTRAINT projected_transactions_authorizing_instrument_id_fkey FOREIGN KEY (authorizing_instrument_id) REFERENCES public.authorizing_instruments(id) ON DELETE CASCADE;
ALTER TABLE public.projected_transactions ADD CONSTRAINT projected_transactions_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.projected_transactions ADD CONSTRAINT projected_transactions_matched_transaction_id_fkey FOREIGN KEY (matched_transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.race_condition_events ADD CONSTRAINT race_condition_events_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.receipt_rules ADD CONSTRAINT receipt_rules_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.receipt_rules ADD CONSTRAINT receipt_rules_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id);
ALTER TABLE public.receipts ADD CONSTRAINT receipts_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_periods ADD CONSTRAINT reconciliation_periods_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_periods ADD CONSTRAINT reconciliation_periods_bank_connection_id_fkey FOREIGN KEY (bank_connection_id) REFERENCES public.bank_connections(id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_records ADD CONSTRAINT reconciliation_records_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_rules ADD CONSTRAINT reconciliation_rules_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_runs ADD CONSTRAINT reconciliation_runs_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_sessions ADD CONSTRAINT reconciliation_sessions_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_sessions ADD CONSTRAINT reconciliation_sessions_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);
ALTER TABLE public.recurring_expense_templates ADD CONSTRAINT recurring_expense_templates_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.recurring_expense_templates ADD CONSTRAINT recurring_expense_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id);
ALTER TABLE public.release_queue ADD CONSTRAINT release_queue_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.release_queue ADD CONSTRAINT release_queue_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.release_queue ADD CONSTRAINT release_queue_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entries(id);
ALTER TABLE public.report_exports ADD CONSTRAINT report_exports_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.risk_evaluations ADD CONSTRAINT authorization_decisions_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.risk_policies ADD CONSTRAINT authorization_policies_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.runway_snapshots ADD CONSTRAINT runway_snapshots_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.stripe_account_links ADD CONSTRAINT stripe_account_links_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.stripe_balance_snapshots ADD CONSTRAINT stripe_balance_snapshots_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.stripe_connected_accounts ADD CONSTRAINT stripe_connected_accounts_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.stripe_transactions ADD CONSTRAINT stripe_transactions_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.stripe_transactions ADD CONSTRAINT stripe_transactions_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
ALTER TABLE public.stripe_transactions ADD CONSTRAINT stripe_transactions_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.plaid_transactions(id);
ALTER TABLE public.subscription_items ADD CONSTRAINT subscription_items_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tax_buckets ADD CONSTRAINT tax_buckets_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);
ALTER TABLE public.tax_buckets ADD CONSTRAINT tax_buckets_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.tax_documents ADD CONSTRAINT tax_documents_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_reversed_by_fkey FOREIGN KEY (reversed_by) REFERENCES public.transactions(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_expense_category_id_fkey FOREIGN KEY (expense_category_id) REFERENCES public.expense_categories(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_projection_id_fkey FOREIGN KEY (projection_id) REFERENCES public.projected_transactions(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_authorizing_instrument_id_fkey FOREIGN KEY (authorizing_instrument_id) REFERENCES public.authorizing_instruments(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_reverses_fkey FOREIGN KEY (reverses) REFERENCES public.transactions(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_recurring_parent_id_fkey FOREIGN KEY (recurring_parent_id) REFERENCES public.transactions(id);
ALTER TABLE public.trial_balance_snapshots ADD CONSTRAINT trial_balance_snapshots_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.trial_balance_snapshots ADD CONSTRAINT trial_balance_snapshots_previous_snapshot_id_fkey FOREIGN KEY (previous_snapshot_id) REFERENCES public.trial_balance_snapshots(id);
ALTER TABLE public.usage_aggregates ADD CONSTRAINT usage_aggregates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.usage_records ADD CONSTRAINT usage_records_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE SET NULL;
ALTER TABLE public.usage_records ADD CONSTRAINT usage_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ventures ADD CONSTRAINT ventures_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_endpoint_id_fkey FOREIGN KEY (endpoint_id) REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE;
ALTER TABLE public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.webhook_endpoints ADD CONSTRAINT webhook_endpoints_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;
ALTER TABLE public.withholding_rules ADD CONSTRAINT withholding_rules_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON DELETE CASCADE;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_accounting_periods_dates ON public.accounting_periods USING btree (ledger_id, period_start, period_end);
CREATE INDEX idx_accounting_periods_ledger ON public.accounting_periods USING btree (ledger_id);
CREATE INDEX idx_accounting_periods_status ON public.accounting_periods USING btree (ledger_id, status);
CREATE INDEX idx_periods_dates ON public.accounting_periods USING btree (ledger_id, period_start, period_end);
CREATE INDEX idx_periods_ledger ON public.accounting_periods USING btree (ledger_id);
CREATE INDEX idx_periods_status ON public.accounting_periods USING btree (ledger_id, status);
CREATE INDEX idx_accounts_active ON public.accounts USING btree (ledger_id, is_active) WHERE (is_active = true);
CREATE INDEX idx_accounts_ar_ap ON public.accounts USING btree (ledger_id, account_type) WHERE (account_type = ANY (ARRAY['accounts_receivable'::text, 'accounts_payable'::text]));
CREATE INDEX idx_accounts_entity ON public.accounts USING btree (ledger_id, entity_id) WHERE (entity_id IS NOT NULL);
CREATE INDEX idx_accounts_ledger_type ON public.accounts USING btree (ledger_id, account_type);
CREATE INDEX idx_accounts_revenue_expense ON public.accounts USING btree (ledger_id, account_type) WHERE (account_type = ANY (ARRAY['revenue'::text, 'expense'::text, 'income'::text]));
CREATE UNIQUE INDEX unique_ledger_account_type_entity ON public.accounts USING btree (ledger_id, account_type, entity_id) WHERE (entity_id IS NOT NULL);
CREATE UNIQUE INDEX unique_ledger_account_type_no_entity ON public.accounts USING btree (ledger_id, account_type) WHERE (entity_id IS NULL);
CREATE INDEX idx_adjustments_date ON public.adjustment_journals USING btree (ledger_id, adjustment_date);
CREATE INDEX idx_adjustments_ledger ON public.adjustment_journals USING btree (ledger_id);
CREATE INDEX idx_adjustments_original ON public.adjustment_journals USING btree (original_transaction_id) WHERE (original_transaction_id IS NOT NULL);
CREATE INDEX idx_alert_configurations_ledger ON public.alert_configurations USING btree (ledger_id) WHERE (is_active = true);
CREATE INDEX idx_alert_configurations_type ON public.alert_configurations USING btree (alert_type) WHERE (is_active = true);
CREATE INDEX idx_alert_history_ledger ON public.alert_history USING btree (ledger_id);
CREATE INDEX idx_alert_history_pending ON public.alert_history USING btree (created_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_api_scopes_key ON public.api_key_scopes USING btree (api_key) WHERE (is_active = true);
CREATE INDEX idx_api_scopes_ledger ON public.api_key_scopes USING btree (ledger_id);
CREATE INDEX idx_api_keys_hash ON public.api_keys USING btree (key_hash);
CREATE INDEX idx_api_keys_ledger ON public.api_keys USING btree (ledger_id);
CREATE INDEX idx_api_keys_lookup ON public.api_keys USING btree (key_prefix) WHERE (revoked_at IS NULL);
CREATE INDEX idx_audit_created ON public.audit_log USING btree (created_at DESC);
CREATE INDEX idx_audit_ledger ON public.audit_log USING btree (ledger_id);
CREATE INDEX idx_audit_log_compliance ON public.audit_log USING btree (created_at DESC, action, risk_score) WHERE ((risk_score > 0) OR (action = ANY (ARRAY['payout_initiated'::text, 'payout_completed'::text, 'payout_failed'::text, 'nacha_generated'::text, 'batch_payout_executed'::text, 'api_key_created'::text, 'api_key_rotated'::text, 'ledger_created'::text, 'ledger_deleted'::text, 'user_login'::text, 'user_logout'::text, 'auth_failed'::text])));
CREATE INDEX idx_audit_log_ip ON public.audit_log USING btree (ip_address, created_at DESC) WHERE (ip_address IS NOT NULL);
CREATE INDEX idx_audit_log_request_id ON public.audit_log USING btree (request_id) WHERE (request_id IS NOT NULL);
CREATE INDEX idx_audit_log_request_trace ON public.audit_log USING btree (request_id) WHERE (request_id IS NOT NULL);
CREATE INDEX idx_audit_log_risk ON public.audit_log USING btree (risk_score DESC, created_at DESC) WHERE (risk_score > 0);
CREATE INDEX idx_audit_log_security_analysis ON public.audit_log USING btree (created_at DESC, risk_score DESC, action) WHERE (risk_score > 0);
CREATE UNIQUE INDEX idx_audit_log_seq_num ON public.audit_log USING btree (seq_num) WHERE (seq_num IS NOT NULL);
CREATE INDEX audit_log_archive_created_at_action_risk_score_idx ON public.audit_log_archive USING btree (created_at DESC, action, risk_score) WHERE ((risk_score > 0) OR (action = ANY (ARRAY['payout_initiated'::text, 'payout_completed'::text, 'payout_failed'::text, 'nacha_generated'::text, 'batch_payout_executed'::text, 'api_key_created'::text, 'api_key_rotated'::text, 'ledger_created'::text, 'ledger_deleted'::text, 'user_login'::text, 'user_logout'::text, 'auth_failed'::text])));
CREATE INDEX audit_log_archive_created_at_idx ON public.audit_log_archive USING btree (created_at DESC);
CREATE INDEX audit_log_archive_created_at_risk_score_action_idx ON public.audit_log_archive USING btree (created_at DESC, risk_score DESC, action) WHERE (risk_score > 0);
CREATE INDEX audit_log_archive_ip_address_created_at_idx ON public.audit_log_archive USING btree (ip_address, created_at DESC) WHERE (ip_address IS NOT NULL);
CREATE INDEX audit_log_archive_ledger_id_idx ON public.audit_log_archive USING btree (ledger_id);
CREATE INDEX audit_log_archive_request_id_idx ON public.audit_log_archive USING btree (request_id) WHERE (request_id IS NOT NULL);
CREATE INDEX audit_log_archive_request_id_idx1 ON public.audit_log_archive USING btree (request_id) WHERE (request_id IS NOT NULL);
CREATE INDEX audit_log_archive_risk_score_created_at_idx ON public.audit_log_archive USING btree (risk_score DESC, created_at DESC) WHERE (risk_score > 0);
CREATE UNIQUE INDEX audit_log_archive_seq_num_idx ON public.audit_log_archive USING btree (seq_num) WHERE (seq_num IS NOT NULL);
CREATE INDEX idx_authorizing_instruments_external_ref ON public.authorizing_instruments USING btree (ledger_id, external_ref);
CREATE INDEX idx_authorizing_instruments_fingerprint ON public.authorizing_instruments USING btree (ledger_id, fingerprint);
CREATE INDEX idx_authorizing_instruments_ledger ON public.authorizing_instruments USING btree (ledger_id);
CREATE INDEX idx_authorizing_instruments_status ON public.authorizing_instruments USING btree (ledger_id, status);
CREATE INDEX idx_auto_match_rules_ledger ON public.auto_match_rules USING btree (ledger_id) WHERE (is_active = true);
CREATE INDEX idx_bank_accounts_ledger ON public.bank_accounts USING btree (ledger_id);
CREATE INDEX idx_bank_connections_ledger ON public.bank_connections USING btree (ledger_id);
CREATE INDEX idx_bank_lines_account ON public.bank_statement_lines USING btree (bank_account_id);
CREATE INDEX idx_bank_lines_date ON public.bank_statement_lines USING btree (ledger_id, transaction_date);
CREATE INDEX idx_bank_lines_ledger ON public.bank_statement_lines USING btree (ledger_id);
CREATE INDEX idx_bank_lines_status ON public.bank_statement_lines USING btree (ledger_id, match_status);
CREATE INDEX idx_bank_lines_unmatched ON public.bank_statement_lines USING btree (ledger_id, match_status) WHERE (match_status = 'unmatched'::text);
CREATE INDEX idx_bank_statements_account ON public.bank_statements USING btree (bank_account_id);
CREATE INDEX idx_bank_statements_ledger ON public.bank_statements USING btree (ledger_id);
CREATE INDEX idx_bank_statements_month ON public.bank_statements USING btree (ledger_id, statement_month);
CREATE INDEX idx_bank_tx_date ON public.bank_transactions USING btree (ledger_id, transaction_date DESC);
CREATE INDEX idx_bank_tx_ledger ON public.bank_transactions USING btree (ledger_id);
CREATE INDEX idx_bank_tx_status ON public.bank_transactions USING btree (ledger_id, reconciliation_status);
CREATE INDEX idx_bank_tx_unmatched ON public.bank_transactions USING btree (ledger_id, reconciliation_status) WHERE (reconciliation_status = 'unmatched'::text);
CREATE INDEX idx_billing_events_org ON public.billing_events USING btree (organization_id);
CREATE INDEX idx_billing_events_stripe ON public.billing_events USING btree (stripe_event_id);
CREATE INDEX idx_billing_overage_charges_org_period ON public.billing_overage_charges USING btree (organization_id, period_start DESC);
CREATE INDEX idx_billing_overage_charges_status ON public.billing_overage_charges USING btree (status);
CREATE INDEX idx_budgets_category ON public.budget_envelopes USING btree (category_id);
CREATE INDEX idx_budgets_ledger ON public.budget_envelopes USING btree (ledger_id);
CREATE INDEX idx_checkout_sessions_expires_at ON public.checkout_sessions USING btree (expires_at) WHERE (status = ANY (ARRAY['pending'::text, 'collecting'::text]));
CREATE INDEX idx_checkout_sessions_setup_state ON public.checkout_sessions USING btree (setup_state) WHERE (setup_state IS NOT NULL);
CREATE INDEX idx_checkout_sessions_status_ledger ON public.checkout_sessions USING btree (status, ledger_id);
CREATE INDEX idx_connected_accounts_entity ON public.connected_accounts USING btree (entity_type, entity_id);
CREATE INDEX idx_connected_accounts_ledger ON public.connected_accounts USING btree (ledger_id);
CREATE INDEX idx_connected_accounts_status ON public.connected_accounts USING btree (stripe_status) WHERE (is_active = true);
CREATE INDEX idx_connected_accounts_stripe ON public.connected_accounts USING btree (stripe_account_id);
CREATE INDEX idx_contractor_payments_contractor ON public.contractor_payments USING btree (contractor_id);
CREATE INDEX idx_contractor_payments_year ON public.contractor_payments USING btree (ledger_id, tax_year);
CREATE INDEX idx_contractors_1099 ON public.contractors USING btree (ledger_id, needs_1099) WHERE (needs_1099 = true);
CREATE INDEX idx_contractors_ledger ON public.contractors USING btree (ledger_id);
CREATE INDEX idx_payout_summaries_year ON public.creator_payout_summaries USING btree (ledger_id, tax_year);
CREATE INDEX idx_creator_tiers_ledger ON public.creator_tiers USING btree (ledger_id);
CREATE INDEX idx_cron_jobs_next ON public.cron_jobs USING btree (next_run_at) WHERE (enabled = true);
CREATE UNIQUE INDEX idx_dispute_lifecycle_dispute_id ON public.dispute_lifecycle USING btree (stripe_dispute_id);
CREATE INDEX idx_drift_alerts_ledger ON public.drift_alerts USING btree (ledger_id, created_at DESC);
CREATE INDEX idx_drift_alerts_severity ON public.drift_alerts USING btree (severity) WHERE (acknowledged_at IS NULL);
CREATE INDEX idx_email_log_creator ON public.email_log USING btree (ledger_id, creator_id);
CREATE INDEX idx_email_log_ledger ON public.email_log USING btree (ledger_id, created_at DESC);
CREATE INDEX idx_email_log_period ON public.email_log USING btree (ledger_id, period_year, period_month);
CREATE INDEX idx_email_log_status ON public.email_log USING btree (status) WHERE (status = 'pending'::text);
CREATE INDEX idx_entries_account ON public.entries USING btree (account_id);
CREATE INDEX idx_entries_account_created ON public.entries USING btree (account_id, created_at DESC);
CREATE INDEX idx_entries_held ON public.entries USING btree (release_status, hold_until) WHERE (release_status = 'held'::text);
CREATE INDEX idx_entries_held_status ON public.entries USING btree (release_status, hold_until) WHERE (release_status = 'held'::text);
CREATE INDEX idx_entries_release_pending ON public.entries USING btree (release_status, created_at DESC) WHERE (release_status = ANY (ARRAY['held'::text, 'pending_release'::text]));
CREATE INDEX idx_entries_transaction ON public.entries USING btree (transaction_id);
CREATE INDEX idx_entries_type ON public.entries USING btree (entry_type);
CREATE INDEX idx_escrow_releases_entry ON public.escrow_releases USING btree (entry_id);
CREATE INDEX idx_escrow_releases_pending ON public.escrow_releases USING btree (status, ledger_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_escrow_releases_recipient ON public.escrow_releases USING btree (recipient_entity_type, recipient_entity_id);
CREATE INDEX idx_expense_attachments_receipt ON public.expense_attachments USING btree (receipt_id) WHERE (receipt_id IS NOT NULL);
CREATE INDEX idx_expense_attachments_tx ON public.expense_attachments USING btree (transaction_id);
CREATE INDEX idx_expense_categories_ledger ON public.expense_categories USING btree (ledger_id);
CREATE INDEX idx_health_checks_date ON public.health_check_results USING btree (run_at DESC);
CREATE INDEX idx_health_checks_ledger ON public.health_check_results USING btree (ledger_id);
CREATE INDEX idx_health_checks_status ON public.health_check_results USING btree (status);
CREATE INDEX idx_held_funds_creator ON public.held_funds USING btree (ledger_id, creator_id);
CREATE INDEX idx_held_funds_dispute ON public.held_funds USING btree (ledger_id, hold_reason) WHERE (withholding_rule_id IS NULL);
CREATE INDEX idx_held_funds_ledger ON public.held_funds USING btree (ledger_id);
CREATE INDEX idx_held_funds_release ON public.held_funds USING btree (status, release_eligible_at) WHERE (status = 'held'::text);
CREATE INDEX idx_held_funds_status ON public.held_funds USING btree (ledger_id, status);
CREATE INDEX idx_idempotency_expires ON public.idempotency_keys USING btree (expires_at);
CREATE INDEX idx_idempotency_ledger ON public.idempotency_keys USING btree (ledger_id);
CREATE INDEX idx_import_templates_ledger ON public.import_templates USING btree (ledger_id);
CREATE INDEX idx_transfers_date ON public.internal_transfers USING btree (ledger_id, executed_at);
CREATE INDEX idx_transfers_ledger ON public.internal_transfers USING btree (ledger_id);
CREATE INDEX idx_invoice_payments_invoice_id ON public.invoice_payments USING btree (invoice_id);
CREATE INDEX idx_invoices_customer_id ON public.invoices USING btree (ledger_id, customer_id) WHERE (customer_id IS NOT NULL);
CREATE INDEX idx_invoices_due_date ON public.invoices USING btree (ledger_id, due_date) WHERE (status <> ALL (ARRAY['paid'::text, 'void'::text]));
CREATE INDEX idx_invoices_invoice_number ON public.invoices USING btree (ledger_id, invoice_number);
CREATE INDEX idx_invoices_ledger_id ON public.invoices USING btree (ledger_id);
CREATE INDEX idx_invoices_status ON public.invoices USING btree (ledger_id, status);
CREATE INDEX idx_ledgers_api_key_hash ON public.ledgers USING btree (api_key_hash);
CREATE INDEX idx_ledgers_mode ON public.ledgers USING btree (ledger_mode);
CREATE INDEX idx_ledgers_organization ON public.ledgers USING btree (organization_id);
CREATE INDEX idx_mileage_date ON public.mileage_entries USING btree (ledger_id, trip_date);
CREATE INDEX idx_mileage_ledger ON public.mileage_entries USING btree (ledger_id);
CREATE INDEX idx_nacha_files_ledger ON public.nacha_files USING btree (ledger_id, created_at DESC);
CREATE INDEX idx_nacha_files_request ON public.nacha_files USING btree (request_id) WHERE (request_id IS NOT NULL);
CREATE INDEX idx_notifications_ledger ON public.notifications USING btree (ledger_id, created_at DESC);
CREATE INDEX idx_notifications_org_user ON public.notifications USING btree (organization_id, user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications USING btree (organization_id, user_id) WHERE ((read_at IS NULL) AND (dismissed_at IS NULL));
CREATE INDEX idx_opening_balances_ledger ON public.opening_balances USING btree (ledger_id);
CREATE INDEX idx_ops_monitor_runs_run_at ON public.ops_monitor_runs USING btree (run_at DESC);
CREATE INDEX idx_ops_monitor_runs_status ON public.ops_monitor_runs USING btree (overall_status, run_at DESC) WHERE (overall_status = ANY (ARRAY['warning'::text, 'critical'::text]));
CREATE INDEX idx_invitations_email ON public.organization_invitations USING btree (email);
CREATE INDEX idx_invitations_org ON public.organization_invitations USING btree (organization_id);
CREATE INDEX idx_invitations_token ON public.organization_invitations USING btree (token);
CREATE INDEX idx_org_invites_email ON public.organization_invites USING btree (email) WHERE (accepted_at IS NULL);
CREATE INDEX idx_org_invites_token ON public.organization_invites USING btree (token) WHERE (accepted_at IS NULL);
CREATE INDEX idx_org_members_org ON public.organization_members USING btree (organization_id);
CREATE INDEX idx_org_members_user ON public.organization_members USING btree (user_id);
CREATE INDEX idx_organizations_owner ON public.organizations USING btree (owner_id);
CREATE INDEX idx_organizations_slug ON public.organizations USING btree (slug);
CREATE UNIQUE INDEX idx_organizations_slug_unique ON public.organizations USING btree (lower(slug));
CREATE INDEX idx_organizations_stripe ON public.organizations USING btree (stripe_customer_id);
CREATE INDEX idx_payment_methods_org ON public.payment_methods USING btree (organization_id);
CREATE INDEX idx_payout_exec_external ON public.payout_executions USING btree (rail, external_id);
CREATE INDEX idx_payout_exec_ledger ON public.payout_executions USING btree (ledger_id, created_at DESC);
CREATE INDEX idx_payout_exec_status ON public.payout_executions USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));
CREATE INDEX idx_payout_exec_tx ON public.payout_executions USING btree (transaction_id);
CREATE INDEX idx_payout_file_downloads_ledger ON public.payout_file_downloads USING btree (ledger_id, downloaded_at DESC);
CREATE UNIQUE INDEX idx_payout_lifecycle_tx_id ON public.payout_lifecycle USING btree (transaction_id);
CREATE INDEX idx_payout_requests_account ON public.payout_requests USING btree (connected_account_id);
CREATE INDEX idx_payout_requests_pending ON public.payout_requests USING btree (status, ledger_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_payout_schedule_runs_date ON public.payout_schedule_runs USING btree (run_at DESC);
CREATE INDEX idx_payouts_account ON public.payouts USING btree (account_id);
CREATE INDEX idx_payouts_ledger ON public.payouts USING btree (ledger_id);
CREATE INDEX idx_payouts_status ON public.payouts USING btree (ledger_id, status);
CREATE INDEX idx_pending_refunds_external ON public.pending_processor_refunds USING btree (external_refund_id) WHERE (external_refund_id IS NOT NULL);
CREATE INDEX idx_pending_refunds_status ON public.pending_processor_refunds USING btree (status, created_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_plaid_connections_ledger ON public.plaid_connections USING btree (ledger_id);
CREATE INDEX idx_plaid_connections_status ON public.plaid_connections USING btree (status) WHERE (status = 'active'::text);
CREATE INDEX idx_plaid_stripe_payout ON public.plaid_transactions USING btree (stripe_payout_id) WHERE (stripe_payout_id IS NOT NULL);
CREATE INDEX idx_plaid_txns_date ON public.plaid_transactions USING btree (ledger_id, date);
CREATE INDEX idx_plaid_txns_ledger ON public.plaid_transactions USING btree (ledger_id);
CREATE INDEX idx_plaid_txns_unmatched ON public.plaid_transactions USING btree (ledger_id, match_status) WHERE (match_status = 'unmatched'::text);
CREATE INDEX idx_prices_product ON public.prices USING btree (product_id);
CREATE INDEX idx_prices_stripe ON public.prices USING btree (stripe_price_id);
CREATE UNIQUE INDEX idx_processor_webhook_inbox_event_id_unique ON public.processor_webhook_inbox USING btree (event_id) WHERE (event_id IS NOT NULL);
CREATE INDEX idx_processor_webhook_inbox_ledger ON public.processor_webhook_inbox USING btree (ledger_id, received_at DESC);
CREATE INDEX idx_processor_webhook_inbox_received ON public.processor_webhook_inbox USING btree (received_at DESC);
CREATE INDEX idx_processor_webhook_inbox_status ON public.processor_webhook_inbox USING btree (status, received_at DESC);
CREATE INDEX idx_product_splits_ledger ON public.product_splits USING btree (ledger_id);
CREATE INDEX idx_product_splits_product ON public.product_splits USING btree (ledger_id, product_id);
CREATE INDEX idx_projected_transactions_expected_date ON public.projected_transactions USING btree (ledger_id, expected_date);
CREATE INDEX idx_projected_transactions_instrument ON public.projected_transactions USING btree (authorizing_instrument_id);
CREATE INDEX idx_projected_transactions_ledger ON public.projected_transactions USING btree (ledger_id);
CREATE INDEX idx_projected_transactions_matched ON public.projected_transactions USING btree (matched_transaction_id) WHERE (matched_transaction_id IS NOT NULL);
CREATE INDEX idx_projected_transactions_pending ON public.projected_transactions USING btree (ledger_id, status, expected_date) WHERE (status = 'pending'::text);
CREATE INDEX idx_projected_transactions_status ON public.projected_transactions USING btree (ledger_id, status);
CREATE INDEX idx_race_events_created ON public.race_condition_events USING btree (created_at DESC);
CREATE INDEX idx_race_events_ledger ON public.race_condition_events USING btree (ledger_id);
CREATE INDEX idx_race_events_type ON public.race_condition_events USING btree (event_type);
CREATE INDEX idx_rate_limits_key ON public.rate_limits USING btree (key, endpoint);
CREATE INDEX idx_rate_limits_key_type ON public.rate_limits USING btree (key_type, key, endpoint) WHERE (key_type = 'ip'::text);
CREATE INDEX idx_rate_limits_window ON public.rate_limits USING btree (window_start);
CREATE INDEX idx_receipt_rules_category ON public.receipt_rules USING btree (category_id);
CREATE INDEX idx_receipt_rules_ledger ON public.receipt_rules USING btree (ledger_id);
CREATE INDEX idx_receipts_date ON public.receipts USING btree (ledger_id, transaction_date);
CREATE INDEX idx_receipts_ledger ON public.receipts USING btree (ledger_id);
CREATE INDEX idx_receipts_status ON public.receipts USING btree (ledger_id, status);
CREATE INDEX idx_reconciliation_period ON public.reconciliation_records USING btree (ledger_id, period_start, period_end);
CREATE INDEX idx_reconciliation_status ON public.reconciliation_records USING btree (ledger_id, status);
CREATE INDEX idx_recon_rules_ledger ON public.reconciliation_rules USING btree (ledger_id, is_active, priority);
CREATE INDEX idx_recon_runs_ledger ON public.reconciliation_runs USING btree (ledger_id, started_at DESC);
CREATE INDEX idx_recon_runs_status ON public.reconciliation_runs USING btree (status) WHERE (status = 'running'::text);
CREATE INDEX idx_recon_sessions_account ON public.reconciliation_sessions USING btree (bank_account_id);
CREATE INDEX idx_recon_sessions_ledger ON public.reconciliation_sessions USING btree (ledger_id);
CREATE INDEX idx_recurring_templates_ledger ON public.recurring_expense_templates USING btree (ledger_id);
CREATE INDEX idx_recurring_templates_next ON public.recurring_expense_templates USING btree (next_due_date) WHERE (is_active = true);
CREATE INDEX idx_release_queue_ledger ON public.release_queue USING btree (ledger_id, status);
CREATE INDEX idx_release_queue_pending ON public.release_queue USING btree (status, scheduled_for) WHERE (status = 'pending'::text);
CREATE INDEX idx_reports_ledger ON public.report_exports USING btree (ledger_id);
CREATE INDEX idx_reports_type ON public.report_exports USING btree (ledger_id, report_type);
CREATE UNIQUE INDEX idx_reserved_slugs_lower ON public.reserved_slugs USING btree (lower(slug));
CREATE INDEX idx_authorization_decisions_decision ON public.risk_evaluations USING btree (signal);
CREATE INDEX idx_authorization_decisions_idempotency ON public.risk_evaluations USING btree (ledger_id, idempotency_key);
CREATE INDEX idx_authorization_decisions_ledger ON public.risk_evaluations USING btree (ledger_id);
CREATE INDEX idx_risk_evaluations_lookup ON public.risk_evaluations USING btree (ledger_id, idempotency_key);
CREATE INDEX idx_risk_evaluations_valid_until ON public.risk_evaluations USING btree (valid_until);
CREATE INDEX idx_authorization_policies_ledger ON public.risk_policies USING btree (ledger_id) WHERE (is_active = true);
CREATE INDEX idx_authorization_policies_type ON public.risk_policies USING btree (policy_type) WHERE (is_active = true);
CREATE INDEX idx_runway_date ON public.runway_snapshots USING btree (ledger_id, snapshot_date DESC);
CREATE INDEX idx_runway_ledger ON public.runway_snapshots USING btree (ledger_id);
CREATE INDEX idx_security_alerts_unacked ON public.security_alerts USING btree (severity, created_at DESC) WHERE (acknowledged_at IS NULL);
CREATE INDEX idx_stripe_links_ledger ON public.stripe_account_links USING btree (ledger_id);
CREATE INDEX idx_stripe_accounts_entity ON public.stripe_connected_accounts USING btree (entity_type, entity_id);
CREATE INDEX idx_stripe_accounts_ledger ON public.stripe_connected_accounts USING btree (ledger_id);
CREATE INDEX idx_stripe_accounts_stripe_id ON public.stripe_connected_accounts USING btree (stripe_account_id);
CREATE INDEX idx_stripe_events_created ON public.stripe_events USING btree (created_at DESC);
CREATE INDEX idx_stripe_events_ledger ON public.stripe_events USING btree (ledger_id);
CREATE INDEX idx_stripe_events_status ON public.stripe_events USING btree (status);
CREATE INDEX idx_stripe_events_type ON public.stripe_events USING btree (event_type);
CREATE INDEX idx_stripe_bank_match ON public.stripe_transactions USING btree (bank_transaction_id) WHERE (bank_transaction_id IS NOT NULL);
CREATE INDEX idx_stripe_transactions_estimated_fees ON public.stripe_transactions USING btree (ledger_id, created_at DESC) WHERE (fee_estimated = true);
CREATE INDEX idx_stripe_txns_date ON public.stripe_transactions USING btree (created_at DESC);
CREATE INDEX idx_stripe_txns_ledger ON public.stripe_transactions USING btree (ledger_id);
CREATE INDEX idx_stripe_txns_match ON public.stripe_transactions USING btree (match_status);
CREATE INDEX idx_stripe_txns_status ON public.stripe_transactions USING btree (status);
CREATE INDEX idx_stripe_txns_type ON public.stripe_transactions USING btree (stripe_type);
CREATE INDEX idx_stripe_txns_unmatched ON public.stripe_transactions USING btree (ledger_id, amount, created_at) WHERE (match_status = 'unmatched'::text);
CREATE INDEX idx_subscription_items_sub ON public.subscription_items USING btree (subscription_id);
CREATE INDEX idx_subscriptions_org ON public.subscriptions USING btree (organization_id);
CREATE INDEX idx_subscriptions_stripe ON public.subscriptions USING btree (stripe_subscription_id);
CREATE INDEX idx_tax_buckets_ledger ON public.tax_buckets USING btree (ledger_id);
CREATE INDEX idx_tax_docs_ledger_year ON public.tax_documents USING btree (ledger_id, tax_year);
CREATE INDEX idx_tax_docs_recipient ON public.tax_documents USING btree (recipient_id);
CREATE INDEX idx_tax_docs_status ON public.tax_documents USING btree (status);
CREATE INDEX idx_transactions_authorizing_instrument ON public.transactions USING btree (authorizing_instrument_id) WHERE (authorizing_instrument_id IS NOT NULL);
CREATE INDEX idx_transactions_created ON public.transactions USING btree (ledger_id, created_at DESC);
CREATE INDEX idx_transactions_currency ON public.transactions USING btree (ledger_id, currency);
CREATE INDEX idx_transactions_entry_method ON public.transactions USING btree (ledger_id, entry_method, created_at DESC) WHERE (entry_method = 'manual'::text);
CREATE INDEX idx_transactions_ledger ON public.transactions USING btree (ledger_id);
CREATE UNIQUE INDEX idx_transactions_ledger_reference_unique ON public.transactions USING btree (ledger_id, reference_id) WHERE (reference_id IS NOT NULL);
CREATE INDEX idx_transactions_ledger_status ON public.transactions USING btree (ledger_id, status);
CREATE INDEX idx_transactions_projection ON public.transactions USING btree (projection_id) WHERE (projection_id IS NOT NULL);
CREATE INDEX idx_transactions_reference ON public.transactions USING btree (reference_id) WHERE (reference_id IS NOT NULL);
CREATE INDEX idx_transactions_reference_id_ledger ON public.transactions USING btree (ledger_id, reference_id) WHERE (reference_id IS NOT NULL);
CREATE INDEX idx_transactions_status ON public.transactions USING btree (ledger_id, status);
CREATE INDEX idx_transactions_type ON public.transactions USING btree (ledger_id, transaction_type);
CREATE INDEX idx_trial_balance_date ON public.trial_balance_snapshots USING btree (ledger_id, as_of_date DESC);
CREATE INDEX idx_trial_balance_ledger ON public.trial_balance_snapshots USING btree (ledger_id);
CREATE INDEX idx_trial_balance_type ON public.trial_balance_snapshots USING btree (ledger_id, snapshot_type);
CREATE INDEX idx_usage_aggregates_date ON public.usage_aggregates USING btree (date DESC);
CREATE INDEX idx_usage_aggregates_org ON public.usage_aggregates USING btree (organization_id);
CREATE INDEX idx_usage_records_org ON public.usage_records USING btree (organization_id);
CREATE INDEX idx_usage_records_period ON public.usage_records USING btree (period_start, period_end);
CREATE INDEX idx_usage_records_recorded ON public.usage_records USING btree (recorded_at DESC);
CREATE INDEX idx_usage_records_type ON public.usage_records USING btree (usage_type);
CREATE INDEX idx_user_profiles_email ON public.user_profiles USING btree (email);
CREATE INDEX idx_vault_access_log_secret ON public.vault_access_log USING btree (secret_type, secret_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_endpoint ON public.webhook_deliveries USING btree (endpoint_id);
CREATE INDEX idx_webhook_deliveries_ledger ON public.webhook_deliveries USING btree (ledger_id);
CREATE INDEX idx_webhook_deliveries_pending ON public.webhook_deliveries USING btree (scheduled_at) WHERE (status = ANY (ARRAY['pending'::text, 'retrying'::text]));
CREATE INDEX idx_webhook_endpoints_ledger ON public.webhook_endpoints USING btree (ledger_id) WHERE (is_active = true);
CREATE INDEX idx_webhook_ledger ON public.webhook_events USING btree (ledger_id);
CREATE INDEX idx_webhook_status ON public.webhook_events USING btree (status) WHERE (status = 'pending'::text);
CREATE INDEX idx_withholding_rules_ledger ON public.withholding_rules USING btree (ledger_id, is_active);

-- ============================================
-- FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION public.account_balances_as_of(p_ledger_id uuid, p_as_of_date timestamp with time zone DEFAULT now())
 RETURNS TABLE(account_id uuid, account_name text, account_type text, entity_type text, balance numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    a.id AS account_id,
    a.name AS account_name,
    a.account_type,
    a.entity_type,
    COALESCE(SUM(
      CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
    ), 0)::NUMERIC(14,2) AS balance
  FROM public.accounts a
  LEFT JOIN public.entries e ON e.account_id = a.id
  LEFT JOIN public.transactions t ON t.id = e.transaction_id
    AND t.ledger_id = p_ledger_id
    AND t.status = 'completed'
    AND t.created_at <= p_as_of_date
  WHERE a.ledger_id = p_ledger_id
  GROUP BY a.id, a.name, a.account_type, a.entity_type
$function$
;

CREATE OR REPLACE FUNCTION public.account_balances_for_period(p_ledger_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(account_id uuid, account_name text, account_type text, balance numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    a.id AS account_id,
    a.name AS account_name,
    a.account_type,
    COALESCE(SUM(
      CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
    ), 0)::NUMERIC(14,2) AS balance
  FROM public.accounts a
  LEFT JOIN public.entries e ON e.account_id = a.id
  LEFT JOIN public.transactions t ON t.id = e.transaction_id
    AND t.ledger_id = p_ledger_id
    AND t.status = 'completed'
    AND t.created_at >= p_start_date
    AND t.created_at <= p_end_date
  WHERE a.ledger_id = p_ledger_id
  GROUP BY a.id, a.name, a.account_type
$function$
;

CREATE OR REPLACE FUNCTION public.aggregate_daily_usage(p_date date DEFAULT (CURRENT_DATE - 1))
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO usage_aggregates (organization_id, date, api_calls, transactions_count)
  SELECT 
    organization_id,
    p_date,
    COALESCE(SUM(quantity) FILTER (WHERE usage_type = 'api_calls'), 0),
    COALESCE(SUM(quantity) FILTER (WHERE usage_type = 'transactions'), 0)
  FROM usage_records
  WHERE period_start::date = p_date
  GROUP BY organization_id
  ON CONFLICT (organization_id, date) DO UPDATE SET
    api_calls = EXCLUDED.api_calls,
    transactions_count = EXCLUDED.transactions_count,
    computed_at = now();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_dispute_hold(p_ledger_id uuid, p_creator_id text, p_dispute_id text, p_amount numeric, p_source_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hold_reason text;
  v_existing RECORD;
  v_creator_account_id uuid;
  v_reserve_account_id uuid;
  v_hold_tx_id uuid;
  v_held_fund_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  v_hold_reason := 'dispute:' || COALESCE(NULLIF(trim(p_dispute_id), ''), 'unknown');

  SELECT * INTO v_existing
  FROM held_funds
  WHERE ledger_id = p_ledger_id
    AND withholding_rule_id IS NULL
    AND hold_reason = v_hold_reason
    AND status IN ('held', 'partial')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'held_fund_id', v_existing.id, 'transaction_id', v_existing.transaction_id, 'idempotent', true);
  END IF;

  SELECT id INTO v_creator_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id
  LIMIT 1;

  IF v_creator_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creator account not found');
  END IF;

  SELECT get_or_create_reserve_account(p_ledger_id, 'dispute')
  INTO v_reserve_account_id;

  INSERT INTO transactions (
    ledger_id,
    transaction_type,
    description,
    amount,
    status,
    metadata
  ) VALUES (
    p_ledger_id,
    'transfer',
    'Dispute hold: ' || v_hold_reason,
    p_amount,
    'completed',
    jsonb_build_object(
      'dispute_id', p_dispute_id,
      'creator_id', p_creator_id,
      'source_reference', p_source_reference,
      'hold_reason', v_hold_reason
    )
  )
  RETURNING id INTO v_hold_tx_id;

  -- Move funds: Creator Balance -> Dispute Reserve
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_hold_tx_id, v_creator_account_id, 'debit', p_amount);

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_hold_tx_id, v_reserve_account_id, 'credit', p_amount);

  INSERT INTO held_funds (
    ledger_id,
    transaction_id,
    withholding_rule_id,
    creator_id,
    held_amount,
    release_eligible_at,
    hold_reason
  ) VALUES (
    p_ledger_id,
    v_hold_tx_id,
    NULL,
    p_creator_id,
    p_amount,
    NOW(),
    v_hold_reason
  )
  RETURNING id INTO v_held_fund_id;

  RETURN jsonb_build_object(
    'success', true,
    'held_fund_id', v_held_fund_id,
    'transaction_id', v_hold_tx_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_withholding_to_sale(p_transaction_id uuid, p_ledger_id uuid, p_creator_id text, p_creator_amount numeric, p_product_id text DEFAULT NULL::text)
 RETURNS TABLE(rule_id uuid, rule_type text, withheld_amount numeric, remaining_creator_amount numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule RECORD;
  v_withheld NUMERIC(14,2);
  v_remaining NUMERIC(14,2) := p_creator_amount;
  v_reserve_account_id UUID;
  v_creator_account_id UUID;
BEGIN
  -- Get creator account
  SELECT id INTO v_creator_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id;
  
  -- Process each active rule in priority order
  FOR v_rule IN
    SELECT * FROM withholding_rules
    WHERE ledger_id = p_ledger_id
      AND is_active = true
      AND (
        applies_to = 'all'
        OR (applies_to = 'creators' AND p_creator_id = ANY(creator_ids))
        OR (applies_to = 'specific' AND p_creator_id = ANY(creator_ids))
      )
      AND (product_ids IS NULL OR p_product_id = ANY(product_ids))
      AND (min_amount IS NULL OR p_creator_amount >= min_amount)
    ORDER BY priority ASC
  LOOP
    -- Calculate withholding
    v_withheld := ROUND(v_remaining * (v_rule.percent / 100), 2);
    
    -- Apply max cap if set
    IF v_rule.max_amount IS NOT NULL AND v_withheld > v_rule.max_amount THEN
      v_withheld := v_rule.max_amount;
    END IF;
    
    -- Skip if nothing to withhold
    IF v_withheld <= 0 THEN
      CONTINUE;
    END IF;
    
    -- Get/create reserve account
    v_reserve_account_id := get_or_create_reserve_account(p_ledger_id, v_rule.rule_type);
    
    -- Record the hold
    INSERT INTO held_funds (
      ledger_id,
      transaction_id,
      withholding_rule_id,
      creator_id,
      held_amount,
      release_eligible_at,
      hold_reason
    ) VALUES (
      p_ledger_id,
      p_transaction_id,
      v_rule.id,
      p_creator_id,
      v_withheld,
      CASE 
        WHEN v_rule.hold_days > 0 THEN NOW() + (v_rule.hold_days || ' days')::interval
        ELSE NOW()
      END,
      v_rule.name
    );
    
    -- Create transfer entry: Creator Balance → Reserve
    -- DEBIT creator (reduce liability to them)
    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES (p_transaction_id, v_creator_account_id, 'debit', v_withheld);
    
    -- CREDIT reserve (increase liability to reserve)
    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES (p_transaction_id, v_reserve_account_id, 'credit', v_withheld);
    
    -- Update remaining
    v_remaining := v_remaining - v_withheld;
    
    -- Return this rule's result
    rule_id := v_rule.id;
    rule_type := v_rule.rule_type;
    withheld_amount := v_withheld;
    remaining_creator_amount := v_remaining;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_create_ledger_accounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Initialize accounts based on mode
  PERFORM initialize_ledger_accounts(NEW.id);
  
  -- Initialize expense categories (both modes need this)
  PERFORM initialize_expense_categories(NEW.id);
  
  -- Initialize expense accounts (both modes)
  PERFORM initialize_expense_accounts(NEW.id);
  
  -- Initialize receipt rules (both modes)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'initialize_receipt_rules') THEN
    PERFORM initialize_receipt_rules(NEW.id);
  END IF;
  
  -- Initialize tax buckets (both modes)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'initialize_tax_buckets') THEN
    PERFORM initialize_tax_buckets(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_match_bank_lines(p_ledger_id uuid, p_bank_account_id uuid)
 RETURNS TABLE(matched_count integer, unmatched_count integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_matched INTEGER := 0;
  v_line RECORD;
  v_tx_id UUID;
BEGIN
  -- Loop through unmatched bank lines
  FOR v_line IN 
    SELECT id, transaction_date, amount, description, merchant_name
    FROM bank_statement_lines
    WHERE ledger_id = p_ledger_id
      AND bank_account_id = p_bank_account_id
      AND match_status = 'unmatched'
  LOOP
    -- Try to match by amount and date (±2 days)
    SELECT t.id INTO v_tx_id
    FROM transactions t
    WHERE t.ledger_id = p_ledger_id
      AND ABS(t.amount) = ABS(v_line.amount)
      AND t.created_at::date BETWEEN v_line.transaction_date - 2 AND v_line.transaction_date + 2
      AND t.id NOT IN (
        SELECT matched_transaction_id FROM bank_statement_lines 
        WHERE matched_transaction_id IS NOT NULL
      )
    LIMIT 1;
    
    IF v_tx_id IS NOT NULL THEN
      UPDATE bank_statement_lines
      SET match_status = 'matched',
          matched_transaction_id = v_tx_id,
          matched_at = NOW(),
          matched_by = 'auto'
      WHERE id = v_line.id;
      
      v_matched := v_matched + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    v_matched,
    (SELECT COUNT(*)::integer FROM bank_statement_lines 
     WHERE ledger_id = p_ledger_id 
       AND bank_account_id = p_bank_account_id 
       AND match_status = 'unmatched');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_match_bank_transaction(p_bank_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_match_found BOOLEAN := FALSE;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.bank_transactions bt ON bt.ledger_id = l.id
      WHERE bt.id = p_bank_transaction_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Auto-matching logic placeholder
  RETURN jsonb_build_object(
    'matched', v_match_found,
    'bank_transaction_id', p_bank_transaction_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_match_plaid_transaction(p_plaid_txn_id uuid)
 RETURNS TABLE(matched boolean, match_type text, matched_transaction_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plaid_txn plaid_transactions;
  v_rule auto_match_rules;
  v_match_id UUID;
BEGIN
  -- Get the Plaid transaction
  SELECT * INTO v_plaid_txn FROM plaid_transactions WHERE id = p_plaid_txn_id;
  
  IF v_plaid_txn IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Try each rule in priority order
  FOR v_rule IN 
    SELECT * FROM auto_match_rules 
    WHERE ledger_id = v_plaid_txn.ledger_id 
      AND is_active = true 
    ORDER BY priority
  LOOP
    -- Check if conditions match
    IF check_auto_match_conditions(v_plaid_txn, v_rule.conditions) THEN
      
      CASE v_rule.action
        WHEN 'match_by_amount' THEN
          -- Find transaction with same amount on same day
          SELECT t.id INTO v_match_id
          FROM transactions t
          WHERE t.ledger_id = v_plaid_txn.ledger_id
            AND ABS(t.amount - ABS(v_plaid_txn.amount)) < 0.01
            AND DATE(t.created_at) BETWEEN v_plaid_txn.date - INTERVAL '3 days' AND v_plaid_txn.date + INTERVAL '3 days'
            AND t.status NOT IN ('voided', 'reversed')
            AND NOT EXISTS (
              SELECT 1 FROM plaid_transactions pt 
              WHERE pt.matched_transaction_id = t.id AND pt.id != p_plaid_txn_id
            )
          LIMIT 1;
          
          IF v_match_id IS NOT NULL THEN
            UPDATE plaid_transactions 
            SET matched_transaction_id = v_match_id, 
                match_status = 'auto_matched',
                match_confidence = 0.85
            WHERE id = p_plaid_txn_id;
            
            RETURN QUERY SELECT true, 'amount_match'::TEXT, v_match_id;
            RETURN;
          END IF;
          
        WHEN 'exclude' THEN
          UPDATE plaid_transactions 
          SET match_status = 'excluded'
          WHERE id = p_plaid_txn_id;
          
          RETURN QUERY SELECT true, 'excluded'::TEXT, NULL::UUID;
          RETURN;
          
        ELSE
          -- Other actions not implemented yet
          NULL;
      END CASE;
      
    END IF;
  END LOOP;
  
  -- No match found
  RETURN QUERY SELECT false, 'no_match'::TEXT, NULL::UUID;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_promote_creators(p_ledger_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_creator RECORD;
  v_tier RECORD;
  v_earnings NUMERIC(14,2);
  v_promoted INTEGER := 0;
BEGIN
  -- For each creator
  FOR v_creator IN
    SELECT entity_id, metadata
    FROM accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'creator_balance'
  LOOP
    -- Calculate lifetime earnings
    SELECT COALESCE(SUM(e.amount), 0) INTO v_earnings
    FROM entries e
    JOIN transactions t ON e.transaction_id = t.id
    WHERE e.account_id = (
      SELECT id FROM accounts 
      WHERE ledger_id = p_ledger_id 
        AND account_type = 'creator_balance' 
        AND entity_id = v_creator.entity_id
    )
    AND e.entry_type = 'credit'
    AND t.transaction_type = 'sale';

    -- Find highest qualifying tier
    SELECT * INTO v_tier
    FROM creator_tiers
    WHERE ledger_id = p_ledger_id
      AND threshold_type = 'lifetime_earnings'
      AND threshold_value <= v_earnings
    ORDER BY tier_order DESC
    LIMIT 1;

    -- Update if tier changed
    IF v_tier IS NOT NULL AND (v_creator.metadata->>'tier') IS DISTINCT FROM v_tier.tier_name THEN
      PERFORM set_creator_tier(p_ledger_id, v_creator.entity_id, v_tier.tier_name);
      v_promoted := v_promoted + 1;
    END IF;
  END LOOP;

  RETURN v_promoted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_release_ready_funds(p_ledger_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_entry IN
    SELECT e.id
    FROM entries e
    JOIN accounts a ON e.account_id = a.id
    WHERE a.ledger_id = p_ledger_id
      AND e.release_status = 'held'
      AND e.entry_type = 'credit'
      AND e.hold_until <= NOW()
  LOOP
    PERFORM request_release(v_entry.id, NULL, 'auto');
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_1099_totals(p_ledger_id uuid, p_creator_id text, p_tax_year integer)
 RETURNS TABLE(gross_payments numeric, transaction_count integer, requires_1099 boolean, monthly_totals jsonb)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold NUMERIC := 600;
BEGIN
  RETURN QUERY
  WITH monthly AS (
    SELECT 
      EXTRACT(MONTH FROM t.created_at)::INTEGER as month,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) as amount,
      COUNT(*) as txn_count
    FROM entries e
    JOIN transactions t ON e.transaction_id = t.id
    JOIN accounts a ON e.account_id = a.id
    WHERE a.ledger_id = p_ledger_id
      AND a.account_type = 'creator_balance'
      AND a.entity_id = p_creator_id
      AND EXTRACT(YEAR FROM t.created_at) = p_tax_year
      AND t.status NOT IN ('voided', 'reversed')
      AND t.transaction_type = 'sale'
    GROUP BY EXTRACT(MONTH FROM t.created_at)
  ),
  totals AS (
    SELECT 
      COALESCE(SUM(amount), 0) as total,
      COALESCE(SUM(txn_count), 0)::INTEGER as cnt
    FROM monthly
  )
  SELECT 
    t.total::NUMERIC as gross_payments,
    t.cnt as transaction_count,
    (t.total >= v_threshold) as requires_1099,
    COALESCE(
      jsonb_object_agg(
        CASE m.month
          WHEN 1 THEN 'jan' WHEN 2 THEN 'feb' WHEN 3 THEN 'mar'
          WHEN 4 THEN 'apr' WHEN 5 THEN 'may' WHEN 6 THEN 'jun'
          WHEN 7 THEN 'jul' WHEN 8 THEN 'aug' WHEN 9 THEN 'sep'
          WHEN 10 THEN 'oct' WHEN 11 THEN 'nov' WHEN 12 THEN 'dec'
        END,
        m.amount
      ) FILTER (WHERE m.month IS NOT NULL),
      '{}'::jsonb
    ) as monthly_totals
  FROM totals t
  LEFT JOIN monthly m ON true
  GROUP BY t.total, t.cnt;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_runway(p_ledger_id uuid)
 RETURNS TABLE(cash_balance numeric, avg_monthly_revenue numeric, avg_monthly_expenses numeric, avg_monthly_burn numeric, runway_months numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cash NUMERIC(14,2);
  v_revenue NUMERIC(14,2);
  v_expenses NUMERIC(14,2);
  v_burn NUMERIC(14,2);
  v_runway NUMERIC(5,1);
BEGIN
  -- Get cash balance
  SELECT COALESCE(SUM(balance), 0) INTO v_cash
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'cash';
  
  -- Get 3-month average revenue
  SELECT COALESCE(AVG(monthly_total), 0) INTO v_revenue
  FROM (
    SELECT DATE_TRUNC('month', created_at) as month, SUM(amount) as monthly_total
    FROM transactions
    WHERE ledger_id = p_ledger_id
      AND transaction_type = 'sale'
      AND status = 'completed'
      AND created_at >= NOW() - INTERVAL '3 months'
    GROUP BY DATE_TRUNC('month', created_at)
  ) monthly;
  
  -- Get 3-month average expenses
  SELECT COALESCE(AVG(monthly_total), 0) INTO v_expenses
  FROM (
    SELECT DATE_TRUNC('month', created_at) as month, SUM(amount) as monthly_total
    FROM transactions
    WHERE ledger_id = p_ledger_id
      AND transaction_type = 'expense'
      AND status = 'completed'
      AND created_at >= NOW() - INTERVAL '3 months'
    GROUP BY DATE_TRUNC('month', created_at)
  ) monthly;
  
  -- Calculate burn rate
  v_burn := v_expenses - v_revenue;
  
  -- Calculate runway
  IF v_burn > 0 THEN
    v_runway := v_cash / v_burn;
  ELSE
    v_runway := 999;  -- Infinite runway (profitable)
  END IF;
  
  RETURN QUERY SELECT v_cash, v_revenue, v_expenses, v_burn, v_runway;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_sale_split(p_gross_cents bigint, p_creator_percent numeric, p_processing_fee_cents bigint DEFAULT 0)
 RETURNS TABLE(creator_cents bigint, platform_cents bigint, fee_cents bigint)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_net_cents BIGINT;
  v_creator_cents BIGINT;
  v_platform_cents BIGINT;
BEGIN
  IF p_creator_percent < 0 OR p_creator_percent > 100 THEN
    RAISE EXCEPTION 'creator_percent must be 0-100, got %', p_creator_percent;
  END IF;
  
  IF p_processing_fee_cents < 0 THEN
    RAISE EXCEPTION 'processing_fee cannot be negative';
  END IF;
  
  IF p_processing_fee_cents > p_gross_cents THEN
    RAISE EXCEPTION 'processing_fee (%) cannot exceed gross (%)', p_processing_fee_cents, p_gross_cents;
  END IF;
  
  v_net_cents := p_gross_cents - p_processing_fee_cents;
  v_creator_cents := FLOOR(v_net_cents * p_creator_percent / 100);
  v_platform_cents := v_net_cents - v_creator_cents;
  
  RETURN QUERY SELECT v_creator_cents, v_platform_cents, p_processing_fee_cents;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_split(p_gross_cents bigint, p_creator_percent numeric)
 RETURNS TABLE(creator_cents bigint, platform_cents bigint)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_creator_cents BIGINT;
  v_platform_cents BIGINT;
BEGIN
  -- Calculate creator share (round down)
  v_creator_cents := FLOOR(p_gross_cents * p_creator_percent / 100);
  
  -- Platform gets remainder (ensures total = gross)
  v_platform_cents := p_gross_cents - v_creator_cents;
  
  RETURN QUERY SELECT v_creator_cents, v_platform_cents;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_trial_balance(p_ledger_id uuid, p_as_of_date date DEFAULT NULL::date)
 RETURNS TABLE(account_id uuid, account_code text, account_name text, account_type text, debit_balance numeric, credit_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  RETURN QUERY
  WITH entry_totals AS (
    SELECT
      e.account_id,
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) as total_debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) as total_credits
    FROM public.entries e
    JOIN public.transactions t ON e.transaction_id = t.id
    WHERE t.ledger_id = p_ledger_id
      AND t.status NOT IN ('voided', 'reversed', 'draft')
      AND (p_as_of_date IS NULL OR DATE(t.created_at) <= p_as_of_date)
    GROUP BY e.account_id
  )
  SELECT
    a.id as account_id,
    a.account_type as account_code,
    a.name as account_name,
    a.account_type,
    CASE
      WHEN a.account_type IN ('asset', 'expense', 'contra_liability', 'contra_equity')
      THEN GREATEST(0, COALESCE(et.total_debits, 0) - COALESCE(et.total_credits, 0))
      ELSE 0::NUMERIC
    END as debit_balance,
    CASE
      WHEN a.account_type IN ('liability', 'equity', 'revenue', 'contra_asset')
      THEN GREATEST(0, COALESCE(et.total_credits, 0) - COALESCE(et.total_debits, 0))
      WHEN a.account_type IN ('asset', 'expense') AND COALESCE(et.total_credits, 0) > COALESCE(et.total_debits, 0)
      THEN COALESCE(et.total_credits, 0) - COALESCE(et.total_debits, 0)
      ELSE 0::NUMERIC
    END as credit_balance
  FROM public.accounts a
  LEFT JOIN entry_totals et ON a.id = et.account_id
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true
    AND (et.total_debits > 0 OR et.total_credits > 0)
  ORDER BY a.account_type, a.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_add_ledger(p_org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_limit INTEGER;
  v_current_count INTEGER;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  SELECT ledger_limit INTO v_limit
  FROM public.organizations
  WHERE id = p_org_id;

  SELECT COUNT(*) INTO v_current_count
  FROM public.ledgers
  WHERE organization_id = p_org_id;

  RETURN v_current_count < COALESCE(v_limit, 999999);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_org_create_ledger(p_org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  RETURN public.can_add_ledger(p_org_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_auto_match_conditions(p_txn plaid_transactions, p_conditions jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Merchant contains
  IF p_conditions ? 'merchant_contains' THEN
    IF p_txn.merchant_name IS NULL OR 
       UPPER(p_txn.merchant_name) NOT LIKE '%' || UPPER(p_conditions->>'merchant_contains') || '%' THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Amount range
  IF p_conditions ? 'amount_min' THEN
    IF ABS(p_txn.amount) < (p_conditions->>'amount_min')::NUMERIC THEN
      RETURN false;
    END IF;
  END IF;
  
  IF p_conditions ? 'amount_max' THEN
    IF ABS(p_txn.amount) > (p_conditions->>'amount_max')::NUMERIC THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Name contains
  IF p_conditions ? 'name_contains' THEN
    IF UPPER(p_txn.name) NOT LIKE '%' || UPPER(p_conditions->>'name_contains') || '%' THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_balance_equation(p_ledger_id uuid)
 RETURNS TABLE(total_assets numeric, total_liabilities numeric, total_equity numeric, total_revenue numeric, total_expenses numeric, net_income numeric, liabilities_plus_equity numeric, is_balanced boolean, difference numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_assets NUMERIC := 0;
  v_total_liabilities NUMERIC := 0;
  v_total_equity NUMERIC := 0;
  v_total_revenue NUMERIC := 0;
  v_total_expenses NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_assets
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('cash', 'accounts_receivable', 'inventory', 'prepaid_expense',
                           'fixed_asset', 'property', 'equipment');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_liabilities
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('accounts_payable', 'creator_balance', 'payee_balance',
                           'accrued_expense', 'tax_payable', 'unearned_revenue',
                           'long_term_debt', 'notes_payable', 'deferred_tax',
                           'user_wallet');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_equity
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('owner_equity', 'retained_earnings', 'common_stock',
                           'additional_paid_in_capital');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_revenue
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('revenue', 'platform_revenue');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_expenses
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'expense';

  RETURN QUERY SELECT
    v_total_assets,
    v_total_liabilities,
    v_total_equity,
    v_total_revenue,
    v_total_expenses,
    (v_total_revenue - v_total_expenses) as net_income,
    (v_total_liabilities + v_total_equity + v_total_revenue - v_total_expenses) as liabilities_plus_equity,
    (ABS(v_total_assets - (v_total_liabilities + v_total_equity + v_total_revenue - v_total_expenses)) < 0.01) as is_balanced,
    (v_total_assets - (v_total_liabilities + v_total_equity + v_total_revenue - v_total_expenses)) as difference;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_balance_invariants(p_ledger_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_violations JSONB := '[]'::jsonb;
  v_rec RECORD;
  v_total_checked INTEGER := 0;
  v_total_violations INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT
      a.id AS account_id,
      a.entity_id,
      a.ledger_id,
      COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)
        AS computed_balance,
      COALESCE((
        SELECT SUM(hf.held_amount - hf.released_amount)
        FROM public.held_funds hf
        WHERE hf.ledger_id = a.ledger_id
          AND hf.creator_id = a.entity_id
          AND hf.status IN ('held', 'partial')
      ), 0) AS total_held
    FROM public.accounts a
    LEFT JOIN public.entries e ON e.account_id = a.id
    LEFT JOIN public.transactions t ON t.id = e.transaction_id
      AND t.status NOT IN ('voided', 'reversed')
    WHERE a.account_type = 'creator_balance'
      AND (p_ledger_id IS NULL OR a.ledger_id = p_ledger_id)
    GROUP BY a.id, a.entity_id, a.ledger_id
  LOOP
    v_total_checked := v_total_checked + 1;

    IF v_rec.computed_balance - v_rec.total_held < -0.005 THEN
      v_total_violations := v_total_violations + 1;
      v_violations := v_violations || jsonb_build_object(
        'account_id', v_rec.account_id,
        'entity_id', v_rec.entity_id,
        'ledger_id', v_rec.ledger_id,
        'computed_balance', v_rec.computed_balance,
        'held_amount', v_rec.total_held,
        'available_balance', v_rec.computed_balance - v_rec.total_held
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'check', 'negative_balance',
    'status', CASE WHEN v_total_violations = 0 THEN 'pass' ELSE 'fail' END,
    'accounts_checked', v_total_checked,
    'violations', v_total_violations,
    'details', v_violations
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_double_entry_balance(p_ledger_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_unbalanced JSONB := '[]'::jsonb;
  v_rec RECORD;
  v_total_unbalanced INTEGER := 0;
  v_total_checked INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT
      e.transaction_id,
      t.ledger_id,
      t.reference_id,
      t.transaction_type,
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) AS total_debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) AS total_credits
    FROM public.entries e
    JOIN public.transactions t ON t.id = e.transaction_id
    WHERE (p_ledger_id IS NULL OR t.ledger_id = p_ledger_id)
    GROUP BY e.transaction_id, t.ledger_id, t.reference_id, t.transaction_type
    HAVING ABS(
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END)
      - SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)
    ) > 0.005
    LIMIT 100
  LOOP
    v_total_unbalanced := v_total_unbalanced + 1;
    v_unbalanced := v_unbalanced || jsonb_build_object(
      'transaction_id', v_rec.transaction_id,
      'ledger_id', v_rec.ledger_id,
      'reference_id', v_rec.reference_id,
      'type', v_rec.transaction_type,
      'debits', v_rec.total_debits,
      'credits', v_rec.total_credits,
      'imbalance', v_rec.total_debits - v_rec.total_credits
    );
  END LOOP;

  SELECT COUNT(DISTINCT e.transaction_id) INTO v_total_checked
  FROM public.entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE (p_ledger_id IS NULL OR t.ledger_id = p_ledger_id);

  RETURN jsonb_build_object(
    'check', 'double_entry_balance',
    'status', CASE WHEN v_total_unbalanced = 0 THEN 'pass' ELSE 'fail' END,
    'transactions_checked', v_total_checked,
    'unbalanced', v_total_unbalanced,
    'details', v_unbalanced
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_no_duplicate_references(p_ledger_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_duplicates JSONB := '[]'::jsonb;
  v_rec RECORD;
  v_total_duplicates INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT t.ledger_id, t.reference_id, COUNT(*) AS dup_count
    FROM public.transactions t
    WHERE t.reference_id IS NOT NULL
      AND (p_ledger_id IS NULL OR t.ledger_id = p_ledger_id)
    GROUP BY t.ledger_id, t.reference_id
    HAVING COUNT(*) > 1
    LIMIT 100
  LOOP
    v_total_duplicates := v_total_duplicates + 1;
    v_duplicates := v_duplicates || jsonb_build_object(
      'ledger_id', v_rec.ledger_id,
      'reference_id', v_rec.reference_id,
      'count', v_rec.dup_count
    );
  END LOOP;

  RETURN jsonb_build_object(
    'check', 'duplicate_references',
    'status', CASE WHEN v_total_duplicates = 0 THEN 'pass' ELSE 'fail' END,
    'duplicates_found', v_total_duplicates,
    'details', v_duplicates
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_period_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period RECORD;
  v_tx_date DATE;
BEGIN
  -- Get transaction date
  IF TG_TABLE_NAME = 'transactions' THEN
    v_tx_date := COALESCE(NEW.created_at::date, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'entries' THEN
    SELECT t.created_at::date INTO v_tx_date
    FROM transactions t
    WHERE t.id = NEW.transaction_id;
  END IF;
  
  -- Check if date falls in a locked period
  SELECT * INTO v_period
  FROM accounting_periods
  WHERE ledger_id = NEW.ledger_id
    AND v_tx_date BETWEEN period_start AND period_end
    AND status = 'locked';
  
  IF v_period IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot modify transactions in locked period: % to %', 
      v_period.period_start, v_period.period_end;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_period_not_closed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF is_period_closed(NEW.ledger_id, NEW.created_at::date) THEN
    RAISE EXCEPTION 'Cannot create transaction in closed period. Use a correcting entry in the current period.';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_endpoint text, p_max_requests integer DEFAULT 100, p_window_seconds integer DEFAULT 60)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_record RECORD;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := NOW() - (p_window_seconds || ' seconds')::INTERVAL;
  
  -- Get or create rate limit record
  SELECT * INTO v_record
  FROM rate_limits
  WHERE key = p_key AND endpoint = p_endpoint
  FOR UPDATE;
  
  IF v_record IS NULL THEN
    -- First request
    INSERT INTO rate_limits (key, endpoint, request_count, window_start)
    VALUES (p_key, p_endpoint, 1, NOW());
    RETURN TRUE;
  END IF;
  
  IF v_record.window_start < v_window_start THEN
    -- Window expired, reset
    UPDATE rate_limits
    SET request_count = 1, window_start = NOW()
    WHERE key = p_key AND endpoint = p_endpoint;
    RETURN TRUE;
  END IF;
  
  IF v_record.request_count >= p_max_requests THEN
    -- Rate limited
    RETURN FALSE;
  END IF;
  
  -- Increment counter
  UPDATE rate_limits
  SET request_count = request_count + 1
  WHERE key = p_key AND endpoint = p_endpoint;
  
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_rate_limit_context()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Even service_role must respect rate limits for sensitive operations
  -- This is called by Edge Functions before processing requests
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_rate_limit_secure(p_key text, p_endpoint text, p_max_requests integer DEFAULT 100, p_window_seconds integer DEFAULT 60, p_fail_closed boolean DEFAULT true)
 RETURNS TABLE(allowed boolean, remaining integer, reset_at timestamp with time zone, blocked boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_record rate_limits;
  v_window_start TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Check if rate_limits table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limits') THEN
    RETURN QUERY SELECT true, p_max_requests, v_now + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;

  v_window_start := v_now - (p_window_seconds || ' seconds')::INTERVAL;

  -- Check if blocked
  SELECT * INTO v_record
  FROM rate_limits
  WHERE key = p_key AND endpoint = p_endpoint
  FOR UPDATE;

  -- Check temporary block
  IF v_record IS NOT NULL AND v_record.blocked_until IS NOT NULL AND v_record.blocked_until > v_now THEN
    RETURN QUERY SELECT false, 0, v_record.blocked_until, true;
    RETURN;
  END IF;

  IF v_record IS NULL THEN
    -- First request
    INSERT INTO rate_limits (key, endpoint, request_count, window_start)
    VALUES (p_key, p_endpoint, 1, v_now);
    RETURN QUERY SELECT true, p_max_requests - 1, v_now + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;

  IF v_record.window_start < v_window_start THEN
    -- Window expired, reset
    UPDATE rate_limits
    SET request_count = 1,
        window_start = v_now,
        violation_count = GREATEST(0, COALESCE(violation_count, 0) - 1)
    WHERE key = p_key AND endpoint = p_endpoint;
    RETURN QUERY SELECT true, p_max_requests - 1, v_now + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;

  IF v_record.request_count >= p_max_requests THEN
    -- Rate limited - increment violation count
    UPDATE rate_limits
    SET violation_count = COALESCE(violation_count, 0) + 1,
        blocked_until = CASE
          WHEN COALESCE(violation_count, 0) >= 10 THEN v_now + INTERVAL '1 hour'
          WHEN COALESCE(violation_count, 0) >= 5 THEN v_now + INTERVAL '5 minutes'
          WHEN COALESCE(violation_count, 0) >= 3 THEN v_now + INTERVAL '1 minute'
          ELSE NULL
        END
    WHERE key = p_key AND endpoint = p_endpoint;

    RETURN QUERY SELECT false, 0, v_record.window_start + (p_window_seconds || ' seconds')::INTERVAL, false;
    RETURN;
  END IF;

  -- Increment counter
  UPDATE rate_limits
  SET request_count = request_count + 1
  WHERE key = p_key AND endpoint = p_endpoint;

  RETURN QUERY SELECT
    true,
    p_max_requests - v_record.request_count - 1,
    v_record.window_start + (p_window_seconds || ' seconds')::INTERVAL,
    false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_usage_limits(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org organizations%ROWTYPE;
  v_usage jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_org FROM organizations WHERE id = p_organization_id;
  v_usage := get_current_period_usage(p_organization_id);
  
  -- Check ledger limit
  IF v_org.max_ledgers > 0 AND (v_usage->>'ledgers')::int > v_org.max_ledgers THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'ledgers',
      'limit', v_org.max_ledgers,
      'current', (v_usage->>'ledgers')::int,
      'overage', (v_usage->>'ledgers')::int - v_org.max_ledgers
    );
  END IF;
  
  -- Check member limit
  IF v_org.max_team_members > 0 AND v_org.current_member_count > v_org.max_team_members THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'members',
      'limit', v_org.max_team_members,
      'current', v_org.current_member_count,
      'overage', v_org.current_member_count - v_org.max_team_members
    );
  END IF;
  
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'plan', v_org.plan,
    'usage', v_usage,
    'limits', jsonb_build_object(
      'ledgers', v_org.max_ledgers,
      'members', v_org.max_team_members
    ),
    'warnings', v_warnings,
    'has_warnings', jsonb_array_length(v_warnings) > 0
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_overage_billing_charge(p_organization_id uuid, p_period_start date, p_period_end date, p_amount_cents integer, p_currency text DEFAULT 'usd'::text, p_included_ledgers integer DEFAULT 1, p_included_team_members integer DEFAULT 1, p_current_ledger_count integer DEFAULT 0, p_current_member_count integer DEFAULT 0, p_additional_ledgers integer DEFAULT 0, p_additional_team_members integer DEFAULT 0, p_overage_ledger_price integer DEFAULT 2000, p_overage_team_member_price integer DEFAULT 2000, p_included_transactions integer DEFAULT 1000, p_current_transaction_count integer DEFAULT 0, p_additional_transactions integer DEFAULT 0, p_overage_transaction_price integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_row public.billing_overage_charges%rowtype;
BEGIN
  INSERT INTO public.billing_overage_charges (
    organization_id,
    period_start,
    period_end,
    currency,
    included_ledgers,
    included_team_members,
    current_ledger_count,
    current_member_count,
    additional_ledgers,
    additional_team_members,
    overage_ledger_price,
    overage_team_member_price,
    included_transactions,
    current_transaction_count,
    additional_transactions,
    overage_transaction_price,
    amount_cents,
    status,
    updated_at
  ) VALUES (
    p_organization_id,
    p_period_start,
    p_period_end,
    COALESCE(NULLIF(p_currency, ''), 'usd'),
    p_included_ledgers,
    p_included_team_members,
    p_current_ledger_count,
    p_current_member_count,
    p_additional_ledgers,
    p_additional_team_members,
    p_overage_ledger_price,
    p_overage_team_member_price,
    p_included_transactions,
    p_current_transaction_count,
    p_additional_transactions,
    p_overage_transaction_price,
    p_amount_cents,
    'queued',
    now()
  )
  ON CONFLICT (organization_id, period_start) DO UPDATE
    SET
      period_end = EXCLUDED.period_end,
      currency = EXCLUDED.currency,
      included_ledgers = EXCLUDED.included_ledgers,
      included_team_members = EXCLUDED.included_team_members,
      current_ledger_count = EXCLUDED.current_ledger_count,
      current_member_count = EXCLUDED.current_member_count,
      additional_ledgers = EXCLUDED.additional_ledgers,
      additional_team_members = EXCLUDED.additional_team_members,
      overage_ledger_price = EXCLUDED.overage_ledger_price,
      overage_team_member_price = EXCLUDED.overage_team_member_price,
      included_transactions = EXCLUDED.included_transactions,
      current_transaction_count = EXCLUDED.current_transaction_count,
      additional_transactions = EXCLUDED.additional_transactions,
      overage_transaction_price = EXCLUDED.overage_transaction_price,
      amount_cents = EXCLUDED.amount_cents,
      updated_at = now()
    WHERE public.billing_overage_charges.status IN ('queued', 'failed');

  UPDATE public.billing_overage_charges
  SET
    status = 'processing',
    attempts = attempts + 1,
    last_attempt_at = now(),
    error = NULL,
    updated_at = now()
  WHERE organization_id = p_organization_id
    AND period_start = p_period_start
    AND status IN ('queued', 'failed')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_processor_webhook_inbox(p_limit integer DEFAULT 25)
 RETURNS SETOF processor_webhook_inbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT i.id
    FROM public.processor_webhook_inbox i
    WHERE i.status = 'pending'
       OR (
         i.status = 'processing'
         AND i.processing_started_at IS NOT NULL
         AND i.processing_started_at <= (NOW() - interval '10 minutes')
       )
    ORDER BY i.received_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.processor_webhook_inbox i
  SET status = 'processing',
      attempts = i.attempts + 1,
      processing_started_at = NOW(),
      processing_error = NULL
  FROM cte
  WHERE i.id = cte.id
  RETURNING i.*;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_audit_log(p_retention_days integer DEFAULT 365)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_archived INTEGER;
  v_deleted INTEGER;
  v_cutoff TIMESTAMPTZ;
  v_financial_cutoff TIMESTAMPTZ;
BEGIN
  v_cutoff := NOW() - (p_retention_days || ' days')::INTERVAL;
  v_financial_cutoff := NOW() - INTERVAL '7 years';

  -- Step 1: Archive eligible records (that are not already archived)
  WITH to_archive AS (
    SELECT al.*
    FROM audit_log al
    WHERE al.created_at < v_cutoff
      -- Financial records: keep for 7 years
      AND NOT (al.risk_score >= 40 AND al.created_at > v_financial_cutoff)
      -- Only archive if not already in archive
      AND NOT EXISTS (
        SELECT 1 FROM audit_log_archive ala WHERE ala.id = al.id
      )
  ),
  inserted AS (
    INSERT INTO audit_log_archive
    SELECT * FROM to_archive
    RETURNING id
  )
  SELECT COUNT(*) INTO v_archived FROM inserted;

  -- Step 2: Delete only records that were successfully archived
  WITH deletable AS (
    SELECT al.id
    FROM audit_log al
    WHERE al.created_at < v_cutoff
      AND NOT (al.risk_score >= 40 AND al.created_at > v_financial_cutoff)
      -- Only delete if successfully archived
      AND EXISTS (
        SELECT 1 FROM audit_log_archive ala WHERE ala.id = al.id
      )
  ),
  deleted AS (
    DELETE FROM audit_log
    WHERE id IN (SELECT id FROM deletable)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RAISE NOTICE 'Audit cleanup: archived=%, deleted=%, retention=% days, financial_retention=7 years',
    v_archived, v_deleted, p_retention_days;

  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_authorization_decisions(p_older_than_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM authorization_decisions
  WHERE expires_at < NOW() - (p_older_than_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_nacha_files()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.nacha_files
    WHERE expires_at < NOW() - INTERVAL '24 hours'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;
  
  RAISE NOTICE 'Cleaned up % expired NACHA files', v_deleted;
  
  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_ledger_data(p_ledger_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete in dependency order
  DELETE FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE ledger_id = p_ledger_id);
  DELETE FROM entries WHERE account_id IN (SELECT id FROM accounts WHERE ledger_id = p_ledger_id);
  DELETE FROM invoices WHERE ledger_id = p_ledger_id;
  DELETE FROM transactions WHERE ledger_id = p_ledger_id;
  DELETE FROM accounts WHERE ledger_id = p_ledger_id;

  -- Recreate base accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'cash', 'platform', 'Cash'),
    (p_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue'),
    (p_ledger_id, 'accounts_receivable', 'platform', 'Accounts Receivable'),
    (p_ledger_id, 'accounts_payable', 'platform', 'Accounts Payable'),
    (p_ledger_id, 'revenue', 'platform', 'Revenue'),
    (p_ledger_id, 'expense', 'platform', 'Expenses');

  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '1 hour';
  
  RAISE NOTICE 'Rate limits cleanup completed at %', NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_creator_split(p_ledger_id uuid, p_creator_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE accounts
  SET 
    metadata = metadata - 'custom_split_percent',
    updated_at = NOW()
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id;
  
  RETURN FOUND;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.close_accounting_period(p_ledger_id uuid, p_period_end date, p_closed_by text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period_id UUID;
  v_snapshot_id UUID;
  v_trial_balance JSONB;
  v_hash TEXT;
BEGIN
  -- Find the period
  SELECT id INTO v_period_id
  FROM accounting_periods
  WHERE ledger_id = p_ledger_id
    AND period_end = p_period_end
    AND status = 'open';
  
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'No open period found ending on %', p_period_end;
  END IF;
  
  -- Create closing trial balance snapshot
  v_snapshot_id := create_trial_balance_snapshot(p_ledger_id, 'period_close');
  
  -- Get the snapshot data
  SELECT balances, balance_hash INTO v_trial_balance, v_hash
  FROM trial_balance_snapshots
  WHERE id = v_snapshot_id;
  
  -- Update period
  UPDATE accounting_periods
  SET status = 'closed',
      closed_at = NOW(),
      closed_by = p_closed_by,
      closing_trial_balance = v_trial_balance,
      closing_hash = v_hash,
      updated_at = NOW()
  WHERE id = v_period_id;
  
  RETURN v_period_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_fund_release(p_release_id uuid, p_stripe_transfer_id text, p_approved_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_release RECORD;
BEGIN
  SELECT * INTO v_release
  FROM escrow_releases
  WHERE id = p_release_id
    AND status IN ('pending', 'approved', 'processing');
  
  IF v_release IS NULL THEN
    RAISE EXCEPTION 'Release % not found or already completed', p_release_id;
  END IF;
  
  -- Update release record
  UPDATE escrow_releases
  SET 
    status = 'completed',
    stripe_transfer_id = p_stripe_transfer_id,
    approved_by = COALESCE(p_approved_by, approved_by),
    approved_at = COALESCE(approved_at, NOW()),
    executed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_release_id;
  
  -- Update entry
  UPDATE entries
  SET 
    release_status = 'released',
    released_at = NOW(),
    released_by = p_approved_by,
    release_transfer_id = p_stripe_transfer_id
  WHERE id = v_release.entry_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_release(p_release_id uuid, p_stripe_transfer_id text, p_approved_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_release RECORD;
BEGIN
  -- Get release request
  SELECT * INTO v_release
  FROM release_queue
  WHERE id = p_release_id
    AND status IN ('pending', 'processing');
  
  IF v_release IS NULL THEN
    RAISE EXCEPTION 'Release request not found or already processed: %', p_release_id;
  END IF;
  
  -- Update release queue
  UPDATE release_queue
  SET 
    status = 'completed',
    stripe_transfer_id = p_stripe_transfer_id,
    approved_by = COALESCE(p_approved_by, approved_by),
    approved_at = COALESCE(approved_at, NOW()),
    executed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_release_id;
  
  -- Update entry
  UPDATE entries
  SET 
    release_status = 'released',
    released_at = NOW(),
    released_by = p_approved_by,
    release_transfer_id = p_stripe_transfer_id
  WHERE id = v_release.entry_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_audit_entry(p_ledger_id uuid, p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_actor_type text DEFAULT 'api'::text, p_actor_id text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_request_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_risk_score integer DEFAULT 0, p_duration_ms integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_log (
    ledger_id,
    action,
    entity_type,
    entity_id,
    actor_type,
    actor_id,
    ip_address,
    user_agent,
    request_id,
    request_body,
    risk_score,
    duration_ms,
    created_at
  ) VALUES (
    p_ledger_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_actor_type,
    p_actor_id,
    p_ip_address,
    LEFT(p_user_agent, 500),
    p_request_id,
    p_metadata,
    p_risk_score,
    p_duration_ms,
    NOW()
  )
  RETURNING id INTO v_log_id;
  
  -- Alert on high-risk events
  IF p_risk_score >= 70 THEN
    INSERT INTO public.security_alerts (
      severity,
      alert_type,
      title,
      description,
      metadata
    ) VALUES (
      CASE 
        WHEN p_risk_score >= 90 THEN 'critical'
        WHEN p_risk_score >= 70 THEN 'warning'
        ELSE 'info'
      END,
      'high_risk_action',
      'High-risk action detected: ' || p_action,
      'A high-risk action was performed. Request ID: ' || COALESCE(p_request_id, 'unknown'),
      jsonb_build_object(
        'ledger_id', p_ledger_id,
        'action', p_action,
        'risk_score', p_risk_score,
        'ip_address', p_ip_address::text,
        'request_id', p_request_id
      )
    );
  END IF;
  
  RETURN v_log_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_ledger_for_organization(p_org_id uuid, p_business_name text, p_ledger_mode text DEFAULT 'marketplace'::text, p_livemode boolean DEFAULT false)
 RETURNS TABLE(id uuid, organization_id uuid, business_name text, ledger_mode text, status text, livemode boolean, api_key text, ledger_group_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_ledger_id UUID;
  v_api_key TEXT;
  v_ledger_group_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify user is member of this organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
    AND user_id = v_user_id
    AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User is not a member of this organization';
  END IF;

  -- Generate API key and ledger group ID
  v_api_key := 'sk_' || CASE WHEN p_livemode THEN 'live_' ELSE 'test_' END || encode(gen_random_bytes(24), 'hex');
  v_ledger_group_id := gen_random_uuid();

  -- Create the ledger
  INSERT INTO ledgers (
    organization_id,
    business_name,
    ledger_mode,
    status,
    livemode,
    api_key,
    ledger_group_id
  ) VALUES (
    p_org_id,
    p_business_name,
    p_ledger_mode,
    'active',
    p_livemode,
    v_api_key,
    v_ledger_group_id
  )
  RETURNING ledgers.id INTO v_ledger_id;

  -- Update organization ledger count
  UPDATE organizations
  SET current_ledger_count = current_ledger_count + 1
  WHERE organizations.id = p_org_id;

  -- Return the created ledger
  RETURN QUERY
  SELECT
    l.id,
    l.organization_id,
    l.business_name,
    l.ledger_mode,
    l.status,
    l.livemode,
    l.api_key,
    l.ledger_group_id,
    l.created_at
  FROM ledgers l
  WHERE l.id = v_ledger_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_notification(p_organization_id uuid, p_type text, p_title text, p_message text, p_user_id uuid DEFAULT NULL::uuid, p_ledger_id uuid DEFAULT NULL::uuid, p_action_url text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (
    organization_id,
    user_id,
    ledger_id,
    type,
    title,
    message,
    action_url,
    metadata
  ) VALUES (
    p_organization_id,
    p_user_id,
    p_ledger_id,
    p_type,
    p_title,
    p_message,
    p_action_url,
    p_metadata
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_organization_for_user(p_name text, p_slug text, p_plan text DEFAULT 'pro'::text, p_trial_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_max_ledgers integer DEFAULT 3, p_max_team_members integer DEFAULT 1)
 RETURNS TABLE(id uuid, name text, slug text, plan text, status text, trial_ends_at timestamp with time zone, max_ledgers integer, max_team_members integer, current_ledger_count integer, current_member_count integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_trial_ends TIMESTAMPTZ;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has an organization
  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  -- Set trial end date
  v_trial_ends := COALESCE(p_trial_ends_at, NOW() + INTERVAL '14 days');

  -- Create the organization
  INSERT INTO organizations (
    name,
    slug,
    plan,
    status,
    trial_ends_at,
    max_ledgers,
    max_team_members,
    current_ledger_count,
    current_member_count
  ) VALUES (
    p_name,
    p_slug,
    p_plan,
    'trialing',
    v_trial_ends,
    p_max_ledgers,
    p_max_team_members,
    0,
    1
  )
  RETURNING organizations.id INTO v_org_id;

  -- Add user as owner
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role,
    status
  ) VALUES (
    v_org_id,
    v_user_id,
    'owner',
    'active'
  );

  -- Return the created organization
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    o.plan,
    o.status,
    o.trial_ends_at,
    o.max_ledgers,
    o.max_team_members,
    o.current_ledger_count,
    o.current_member_count,
    o.created_at
  FROM organizations o
  WHERE o.id = v_org_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_organization_with_ledger(p_org_name text, p_org_slug text, p_plan text, p_trial_ends_at timestamp with time zone, p_max_ledgers integer, p_max_team_members integer, p_ledger_name text, p_ledger_mode text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_ledger_group_id UUID;
  v_test_api_key TEXT;
  v_live_api_key TEXT;
  v_test_ledger_id UUID;
  v_live_ledger_id UUID;
  v_result JSON;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Generate IDs and keys
  v_org_id := gen_random_uuid();
  v_ledger_group_id := gen_random_uuid();
  v_test_ledger_id := gen_random_uuid();
  v_live_ledger_id := gen_random_uuid();
  v_test_api_key := 'sk_test_' || replace(gen_random_uuid()::text, '-', '');
  v_live_api_key := 'sk_live_' || replace(gen_random_uuid()::text, '-', '');

  -- Create organization
  INSERT INTO organizations (
    id,
    name,
    slug,
    owner_id,
    plan,
    status,
    trial_ends_at,
    max_ledgers,
    max_team_members,
    current_ledger_count,
    current_member_count
  ) VALUES (
    v_org_id,
    p_org_name,
    p_org_slug,
    v_user_id,
    p_plan,
    'active',
    p_trial_ends_at,
    p_max_ledgers,
    p_max_team_members,
    1,
    1
  );

  -- Add user as owner
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role
  ) VALUES (
    v_org_id,
    v_user_id,
    'owner'
  );

  -- Create test ledger
  INSERT INTO ledgers (
    id,
    organization_id,
    business_name,
    ledger_mode,
    status,
    ledger_group_id,
    livemode,
    api_key_hash,
    settings
  ) VALUES (
    v_test_ledger_id,
    v_org_id,
    p_ledger_name,
    p_ledger_mode,
    'active',
    v_ledger_group_id,
    false,
    encode(sha256(v_test_api_key::bytea), 'hex'),
    '{"currency": "USD", "fiscal_year_start": 1}'::jsonb
  );

  -- Create live ledger
  INSERT INTO ledgers (
    id,
    organization_id,
    business_name,
    ledger_mode,
    status,
    ledger_group_id,
    livemode,
    api_key_hash,
    settings
  ) VALUES (
    v_live_ledger_id,
    v_org_id,
    p_ledger_name,
    p_ledger_mode,
    'active',
    v_ledger_group_id,
    true,
    encode(sha256(v_live_api_key::bytea), 'hex'),
    '{"currency": "USD", "fiscal_year_start": 1}'::jsonb
  );

  -- Create API key for test ledger
  INSERT INTO api_keys (
    ledger_id,
    name,
    key_hash,
    key_prefix,
    scopes,
    created_by
  ) VALUES (
    v_test_ledger_id,
    'Default Test Key',
    encode(sha256(v_test_api_key::bytea), 'hex'),
    substring(v_test_api_key from 1 for 12),
    ARRAY['read', 'write', 'admin'],
    v_user_id
  );

  -- Create API key for live ledger
  INSERT INTO api_keys (
    ledger_id,
    name,
    key_hash,
    key_prefix,
    scopes,
    created_by
  ) VALUES (
    v_live_ledger_id,
    'Default Live Key',
    encode(sha256(v_live_api_key::bytea), 'hex'),
    substring(v_live_api_key from 1 for 12),
    ARRAY['read', 'write', 'admin'],
    v_user_id
  );

  -- Return the created data (include full keys - only time they're visible)
  v_result := json_build_object(
    'organization_id', v_org_id,
    'test_api_key', v_test_api_key,
    'live_api_key', v_live_api_key,
    'test_ledger_id', v_test_ledger_id,
    'live_ledger_id', v_live_ledger_id
  );

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_organization_with_ledger(p_user_id uuid, p_org_name text, p_org_slug text, p_plan text, p_trial_ends_at timestamp with time zone, p_max_ledgers integer, p_max_team_members integer, p_ledger_name text, p_ledger_mode text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_ledger_group_id UUID;
  v_test_api_key TEXT;
  v_live_api_key TEXT;
  v_test_ledger_id UUID;
  v_live_ledger_id UUID;
  v_result JSON;
BEGIN
  -- Validate user_id is provided
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  -- Generate IDs and keys
  v_org_id := gen_random_uuid();
  v_ledger_group_id := gen_random_uuid();
  v_test_ledger_id := gen_random_uuid();
  v_live_ledger_id := gen_random_uuid();
  v_test_api_key := 'sk_test_' || replace(gen_random_uuid()::text, '-', '');
  v_live_api_key := 'sk_live_' || replace(gen_random_uuid()::text, '-', '');

  -- Create organization
  INSERT INTO organizations (
    id,
    name,
    slug,
    owner_id,
    plan,
    status,
    trial_ends_at,
    max_ledgers,
    max_team_members,
    current_ledger_count,
    current_member_count
  ) VALUES (
    v_org_id,
    p_org_name,
    p_org_slug,
    p_user_id,
    p_plan,
    'active',
    p_trial_ends_at,
    p_max_ledgers,
    p_max_team_members,
    1,
    1
  );

  -- Add user as owner
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role
  ) VALUES (
    v_org_id,
    p_user_id,
    'owner'
  );

  -- Create test ledger
  INSERT INTO ledgers (
    id,
    organization_id,
    business_name,
    ledger_mode,
    status,
    ledger_group_id,
    livemode,
    api_key_hash,
    settings
  ) VALUES (
    v_test_ledger_id,
    v_org_id,
    p_ledger_name,
    p_ledger_mode,
    'active',
    v_ledger_group_id,
    false,
    encode(sha256(v_test_api_key::bytea), 'hex'),
    '{"currency": "USD", "fiscal_year_start": 1}'::jsonb
  );

  -- Create live ledger
  INSERT INTO ledgers (
    id,
    organization_id,
    business_name,
    ledger_mode,
    status,
    ledger_group_id,
    livemode,
    api_key_hash,
    settings
  ) VALUES (
    v_live_ledger_id,
    v_org_id,
    p_ledger_name,
    p_ledger_mode,
    'active',
    v_ledger_group_id,
    true,
    encode(sha256(v_live_api_key::bytea), 'hex'),
    '{"currency": "USD", "fiscal_year_start": 1}'::jsonb
  );

  -- Create API key for test ledger
  INSERT INTO api_keys (
    ledger_id,
    name,
    key_hash,
    key_prefix,
    scopes,
    created_by
  ) VALUES (
    v_test_ledger_id,
    'Default Test Key',
    encode(sha256(v_test_api_key::bytea), 'hex'),
    substring(v_test_api_key from 1 for 12),
    ARRAY['read', 'write', 'admin'],
    p_user_id
  );

  -- Create API key for live ledger
  INSERT INTO api_keys (
    ledger_id,
    name,
    key_hash,
    key_prefix,
    scopes,
    created_by
  ) VALUES (
    v_live_ledger_id,
    'Default Live Key',
    encode(sha256(v_live_api_key::bytea), 'hex'),
    substring(v_live_api_key from 1 for 12),
    ARRAY['read', 'write', 'admin'],
    p_user_id
  );

  -- Return the created data
  v_result := json_build_object(
    'organization_id', v_org_id,
    'test_api_key', v_test_api_key,
    'live_api_key', v_live_api_key,
    'test_ledger_id', v_test_ledger_id,
    'live_ledger_id', v_live_ledger_id
  );

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_trial_balance_snapshot(p_ledger_id uuid, p_snapshot_type text DEFAULT 'on_demand'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balances JSONB;
  v_total_debits NUMERIC(14,2) := 0;
  v_total_credits NUMERIC(14,2) := 0;
  v_hash TEXT;
  v_previous_id UUID;
  v_previous_hash TEXT;
  v_snapshot_id UUID;
BEGIN
  -- Get all account balances as JSON
  SELECT jsonb_agg(jsonb_build_object(
    'account_id', id,
    'account_type', account_type,
    'entity_id', entity_id,
    'name', name,
    'balance', balance,
    'currency', currency
  ))
  INTO v_balances
  FROM accounts
  WHERE ledger_id = p_ledger_id AND is_active = true;
  
  -- Calculate totals
  SELECT 
    COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END), 0)
  INTO v_total_debits, v_total_credits
  FROM accounts
  WHERE ledger_id = p_ledger_id;
  
  -- Generate hash
  v_hash := encode(sha256(v_balances::text::bytea), 'hex');
  
  -- Get previous snapshot for chain
  SELECT id, balance_hash INTO v_previous_id, v_previous_hash
  FROM trial_balance_snapshots
  WHERE ledger_id = p_ledger_id
  ORDER BY snapshot_at DESC
  LIMIT 1;
  
  -- Insert snapshot
  INSERT INTO trial_balance_snapshots (
    ledger_id, snapshot_type, as_of_date, balances,
    total_debits, total_credits, balance_hash,
    previous_snapshot_id, previous_hash, chain_valid
  )
  VALUES (
    p_ledger_id, p_snapshot_type, CURRENT_DATE, v_balances,
    v_total_debits, v_total_credits, v_hash,
    v_previous_id, v_previous_hash, true
  )
  RETURNING id INTO v_snapshot_id;
  
  RETURN v_snapshot_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_creator_atomic(p_ledger_id uuid, p_creator_id text)
 RETURNS TABLE(out_account_id uuid, out_deleted boolean, out_error text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_account_id UUID;
  v_account_name TEXT;
  v_entry_count BIGINT;
BEGIN
  -- Lock the account row to prevent concurrent writes
  SELECT id, name INTO v_account_id, v_account_name
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id
    AND is_active = true
  FOR UPDATE;

  IF v_account_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Creator not found'::TEXT;
    RETURN;
  END IF;

  -- Count entries while row is locked
  SELECT count(*) INTO v_entry_count
  FROM public.entries
  WHERE account_id = v_account_id;

  IF v_entry_count > 0 THEN
    RETURN QUERY SELECT v_account_id, false, 'Cannot delete creator with existing transactions'::TEXT;
    RETURN;
  END IF;

  -- Soft delete
  UPDATE public.accounts
  SET is_active = false, updated_at = now()
  WHERE id = v_account_id;

  RETURN QUERY SELECT v_account_id, true, NULL::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_audit_gaps(p_start_seq bigint DEFAULT 1, p_end_seq bigint DEFAULT NULL::bigint)
 RETURNS TABLE(gap_start bigint, gap_end bigint, gap_size bigint)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH seq AS (
    SELECT
      a.seq_num,
      LEAD(a.seq_num) OVER (ORDER BY a.seq_num) AS next_seq
    FROM public.audit_log a
    WHERE a.seq_num >= p_start_seq
      AND (p_end_seq IS NULL OR a.seq_num <= p_end_seq)
  )
  SELECT
    s.seq_num + 1 AS gap_start,
    s.next_seq - 1 AS gap_end,
    s.next_seq - s.seq_num - 1 AS gap_size
  FROM seq s
  WHERE s.next_seq IS NOT NULL
    AND s.next_seq - s.seq_num > 1
  ORDER BY s.seq_num;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.diagnose_balance_sheet(p_ledger_id uuid)
 RETURNS TABLE(category text, account_type text, account_name text, debit_total numeric, credit_total numeric, net_balance numeric, expected_normal text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN a.account_type IN ('cash', 'accounts_receivable', 'inventory', 'prepaid_expense', 'fixed_asset', 'property', 'equipment') THEN 'ASSET'
      WHEN a.account_type IN ('accounts_payable', 'creator_balance', 'payee_balance', 'accrued_expense', 'tax_payable', 'unearned_revenue', 'long_term_debt', 'notes_payable') THEN 'LIABILITY'
      WHEN a.account_type IN ('owner_equity', 'retained_earnings', 'common_stock', 'additional_paid_in_capital') THEN 'EQUITY'
      WHEN a.account_type IN ('revenue', 'platform_revenue') THEN 'REVENUE'
      WHEN a.account_type = 'expense' THEN 'EXPENSE'
      ELSE 'OTHER'
    END as category,
    a.account_type::TEXT,
    a.name::TEXT,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) as debit_total,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) as credit_total,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END), 0) as net_balance,
    CASE
      WHEN a.account_type IN ('cash', 'accounts_receivable', 'inventory', 'prepaid_expense', 'fixed_asset', 'property', 'equipment', 'expense') THEN 'DEBIT'
      ELSE 'CREDIT'
    END as expected_normal
  FROM accounts a
  LEFT JOIN entries e ON e.account_id = a.id
  LEFT JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
  GROUP BY a.account_type, a.name, a.id
  ORDER BY category, account_type, a.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_ledger_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_max_ledgers INTEGER;
  v_current_count INTEGER;
  v_plan TEXT;
  v_trial_ends_at TIMESTAMPTZ;
  v_status TEXT;
BEGIN
  v_org_id := NEW.organization_id;
  
  -- ALLOW LEDGERS WITHOUT ORGANIZATION (API-only mode)
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get organization limits
  SELECT 
    max_ledgers, 
    current_ledger_count, 
    plan,
    trial_ends_at,
    status
  INTO 
    v_max_ledgers, 
    v_current_count, 
    v_plan,
    v_trial_ends_at,
    v_status
  FROM organizations
  WHERE id = v_org_id;
  
  -- Check if organization exists
  IF v_max_ledgers IS NULL THEN
    RAISE EXCEPTION 'Organization not found: %', v_org_id;
  END IF;
  
  -- Check organization status
  IF v_status = 'suspended' THEN
    RAISE EXCEPTION 'Organization is suspended. Please contact support.';
  END IF;
  
  IF v_status = 'canceled' THEN
    RAISE EXCEPTION 'Organization subscription is canceled. Please reactivate.';
  END IF;
  
  -- Check trial expiration
  IF v_plan = 'trial' AND v_trial_ends_at < NOW() THEN
    RAISE EXCEPTION 'Trial has expired. Please upgrade to continue creating ledgers.';
  END IF;
  
  -- Scale plan (-1) has unlimited ledgers
  IF v_max_ledgers = -1 THEN
    RETURN NEW;
  END IF;
  
  -- Check ledger limit (allow overage but track it)
  IF v_current_count >= v_max_ledgers THEN
    INSERT INTO billing_events (
      organization_id,
      stripe_event_type,
      description,
      stripe_data
    ) VALUES (
      v_org_id,
      'ledger_overage',
      'Ledger created beyond plan limit',
      jsonb_build_object(
        'plan', v_plan,
        'max_ledgers', v_max_ledgers,
        'current_count', v_current_count + 1,
        'overage_count', (v_current_count + 1) - v_max_ledgers,
        'ledger_id', NEW.id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_member_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_org_id UUID;
  v_max_members INTEGER;
  v_current_count INTEGER;
  v_plan TEXT;
  v_status TEXT;
BEGIN
  v_org_id := NEW.organization_id;

  -- Only check when membership becomes active.
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  SELECT
    max_team_members,
    current_member_count,
    plan,
    status
  INTO
    v_max_members,
    v_current_count,
    v_plan,
    v_status
  FROM public.organizations
  WHERE id = v_org_id;

  IF v_max_members IS NULL THEN
    RAISE EXCEPTION 'Organization not found: %', v_org_id;
  END IF;

  IF v_status IN ('suspended', 'canceled') THEN
    RAISE EXCEPTION 'Cannot add members to % organization', v_status;
  END IF;

  -- Unlimited plans have no overage.
  IF v_max_members = -1 THEN
    RETURN NEW;
  END IF;

  IF v_current_count >= v_max_members THEN
    INSERT INTO public.billing_events (
      organization_id,
      stripe_event_type,
      description,
      stripe_data
    ) VALUES (
      v_org_id,
      'team_member_overage',
      'Team member added beyond included limit',
      jsonb_build_object(
        'plan', v_plan,
        'max_team_members', v_max_members,
        'current_count', v_current_count + 1,
        'overage_count', (v_current_count + 1) - v_max_members,
        'member_user_id', NEW.user_id,
        'member_role', NEW.role
      )
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_wallet_nonnegative_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.balance < 0 THEN
    RAISE EXCEPTION 'Wallet balance cannot be negative: account % balance %',
      NEW.id, NEW.balance;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_pending_projections()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only trigger when status changes to 'invalidated'
  IF OLD.status = 'active' AND NEW.status = 'invalidated' THEN
    UPDATE projected_transactions
    SET status = 'expired'
    WHERE authorizing_instrument_id = NEW.id
    AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.export_1099_summary(p_ledger_id uuid, p_tax_year integer)
 RETURNS TABLE(entity_id text, entity_name text, total_paid numeric, requires_1099 boolean, w9_status text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.entity_id,
    a.name as entity_name,
    COALESCE(SUM(e.amount) FILTER (WHERE e.entry_type = 'debit'), 0) as total_paid,
    COALESCE(SUM(e.amount) FILTER (WHERE e.entry_type = 'debit'), 0) >= 600 as requires_1099,
    COALESCE(a.metadata->>'w9_status', 'unknown') as w9_status
  FROM accounts a
  LEFT JOIN entries e ON a.id = e.account_id
  LEFT JOIN transactions t ON e.transaction_id = t.id
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'creator_balance'
    AND a.entity_type IN ('creator', 'contractor')
    AND EXTRACT(YEAR FROM t.created_at) = p_tax_year
    AND t.transaction_type = 'payout'
    AND t.status = 'completed'
  GROUP BY a.entity_id, a.name, a.metadata->>'w9_status'
  HAVING COALESCE(SUM(e.amount) FILTER (WHERE e.entry_type = 'debit'), 0) > 0
  ORDER BY total_paid DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.export_audit_logs(p_ledger_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_include_archived boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_live JSONB;
  v_archived JSONB;
BEGIN
  -- Fetch live records
  SELECT COALESCE(jsonb_agg(row_to_json(al.*) ORDER BY al.created_at), '[]'::jsonb)
  INTO v_live
  FROM public.audit_log al
  WHERE al.ledger_id = p_ledger_id
    AND al.created_at >= p_start_date
    AND al.created_at <= p_end_date;

  -- Optionally fetch archived records
  IF p_include_archived THEN
    SELECT COALESCE(jsonb_agg(row_to_json(ala.*) ORDER BY ala.created_at), '[]'::jsonb)
    INTO v_archived
    FROM public.audit_log_archive ala
    WHERE ala.ledger_id = p_ledger_id
      AND ala.created_at >= p_start_date
      AND ala.created_at <= p_end_date;
  ELSE
    v_archived := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ledger_id', p_ledger_id,
    'date_range', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'exported_at', NOW(),
    'include_archived', p_include_archived,
    'live_records', v_live,
    'live_count', jsonb_array_length(v_live),
    'archived_records', v_archived,
    'archived_count', jsonb_array_length(v_archived)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.export_general_ledger(p_ledger_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(transaction_date timestamp with time zone, transaction_id uuid, transaction_type text, description text, reference_id text, account_name text, debit numeric, credit numeric, running_balance numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    t.created_at as transaction_date,
    t.id as transaction_id,
    t.transaction_type,
    t.description,
    t.reference_id,
    a.name as account_name,
    CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE NULL END as debit,
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE NULL END as credit,
    SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END) 
      OVER (PARTITION BY a.id ORDER BY t.created_at, t.id) as running_balance
  FROM transactions t
  JOIN entries e ON t.id = e.transaction_id
  JOIN accounts a ON e.account_id = a.id
  WHERE t.ledger_id = p_ledger_id
    AND t.created_at::date BETWEEN p_start_date AND p_end_date
    AND t.status = 'completed'
  ORDER BY t.created_at, t.id, a.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.export_profit_loss(p_ledger_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(category text, account_name text, amount numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH account_totals AS (
    SELECT 
      a.account_type,
      a.name,
      SUM(CASE 
        WHEN e.entry_type = 'credit' AND a.account_type IN ('revenue', 'platform_revenue', 'other_income') THEN e.amount
        WHEN e.entry_type = 'debit' AND a.account_type IN ('expense', 'processing_fees', 'cost_of_goods') THEN e.amount
        ELSE 0
      END) as total
    FROM accounts a
    LEFT JOIN entries e ON a.id = e.account_id
    LEFT JOIN transactions t ON e.transaction_id = t.id
    WHERE a.ledger_id = p_ledger_id
      AND t.created_at::date BETWEEN p_start_date AND p_end_date
      AND t.status = 'completed'
      AND a.account_type IN ('revenue', 'platform_revenue', 'other_income', 'expense', 'processing_fees', 'cost_of_goods')
    GROUP BY a.account_type, a.name
    HAVING SUM(CASE 
      WHEN e.entry_type = 'credit' AND a.account_type IN ('revenue', 'platform_revenue', 'other_income') THEN e.amount
      WHEN e.entry_type = 'debit' AND a.account_type IN ('expense', 'processing_fees', 'cost_of_goods') THEN e.amount
      ELSE 0
    END) > 0
  )
  SELECT 
    CASE 
      WHEN account_type IN ('revenue', 'platform_revenue', 'other_income') THEN 'REVENUE'
      ELSE 'EXPENSES'
    END as category,
    name as account_name,
    total as amount
  FROM account_totals
  ORDER BY 
    CASE WHEN account_type IN ('revenue', 'platform_revenue', 'other_income') THEN 1 ELSE 2 END,
    total DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.export_trial_balance(p_ledger_id uuid, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(account_name text, account_type text, debit_balance numeric, credit_balance numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.name as account_name,
    a.account_type,
    CASE 
      WHEN SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) > 
           SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)
      THEN SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) - 
           SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)
      ELSE 0
    END as debit_balance,
    CASE 
      WHEN SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) > 
           SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END)
      THEN SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) - 
           SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END)
      ELSE 0
    END as credit_balance
  FROM accounts a
  LEFT JOIN entries e ON a.id = e.account_id
  LEFT JOIN transactions t ON e.transaction_id = t.id AND t.created_at::date <= p_as_of_date
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true
  GROUP BY a.id, a.name, a.account_type
  HAVING SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) > 0
      OR SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) > 0
  ORDER BY 
    CASE a.account_type
      WHEN 'cash' THEN 1
      WHEN 'accounts_receivable' THEN 2
      WHEN 'inventory' THEN 3
      WHEN 'fixed_asset' THEN 4
      WHEN 'accounts_payable' THEN 5
      WHEN 'creator_balance' THEN 6
      WHEN 'reserve' THEN 7
      WHEN 'equity' THEN 8
      WHEN 'revenue' THEN 9
      WHEN 'platform_revenue' THEN 10
      WHEN 'expense' THEN 11
      WHEN 'processing_fees' THEN 12
      ELSE 99
    END,
    a.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fail_fund_release(p_release_id uuid, p_error_code text, p_error_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry_id UUID;
BEGIN
  -- Get entry_id and update release
  UPDATE escrow_releases
  SET 
    status = 'failed',
    stripe_error_code = p_error_code,
    stripe_error_message = p_error_message,
    updated_at = NOW()
  WHERE id = p_release_id
  RETURNING entry_id INTO v_entry_id;
  
  -- Revert entry to held
  UPDATE entries
  SET release_status = 'held'
  WHERE id = v_entry_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_imbalanced_transactions(p_ledger_id uuid)
 RETURNS TABLE(transaction_id uuid, transaction_type text, description text, created_at timestamp with time zone, total_debits numeric, total_credits numeric, imbalance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    t.id as transaction_id,
    t.transaction_type::TEXT,
    t.description::TEXT,
    t.created_at,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) as total_debits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) as total_credits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END), 0) as imbalance
  FROM transactions t
  LEFT JOIN entries e ON e.transaction_id = t.id
  WHERE t.ledger_id = p_ledger_id
    AND t.status = 'completed'
  GROUP BY t.id, t.transaction_type, t.description, t.created_at
  HAVING ABS(COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) -
             COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)) > 0.001
  ORDER BY t.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_matching_projection(p_ledger_id uuid, p_amount numeric, p_currency text, p_transaction_date date, p_date_tolerance integer DEFAULT 3)
 RETURNS TABLE(projection_id uuid, authorizing_instrument_id uuid, expected_date date, amount numeric, currency text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    pt.id AS projection_id,
    pt.authorizing_instrument_id,
    pt.expected_date,
    pt.amount,
    pt.currency
  FROM projected_transactions pt
  WHERE pt.ledger_id = p_ledger_id
    AND pt.status = 'pending'
    AND pt.amount = p_amount
    AND pt.currency = p_currency
    AND pt.expected_date BETWEEN (p_transaction_date - p_date_tolerance)
                              AND (p_transaction_date + p_date_tolerance)
  ORDER BY ABS(pt.expected_date - p_transaction_date)  -- Closest date first
  LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_orphaned_entries(p_ledger_id uuid)
 RETURNS TABLE(entry_id uuid, transaction_id uuid, account_id uuid, amount numeric, entry_type text, issue text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id as entry_id,
    e.transaction_id,
    e.account_id,
    e.amount,
    e.entry_type::TEXT,
    CASE
      WHEN t.id IS NULL THEN 'Missing transaction'
      WHEN t.ledger_id != p_ledger_id THEN 'Wrong ledger'
      WHEN t.status != 'completed' THEN 'Transaction not completed: ' || t.status
      ELSE 'Unknown issue'
    END as issue
  FROM entries e
  LEFT JOIN transactions t ON e.transaction_id = t.id
  LEFT JOIN accounts a ON e.account_id = a.id
  WHERE a.ledger_id = p_ledger_id
    AND (t.id IS NULL OR t.ledger_id != p_ledger_id OR t.status != 'completed');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fulfill_projection(p_projection_id uuid, p_transaction_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  -- Update projection status to fulfilled
  UPDATE projected_transactions
  SET status = 'fulfilled',
      matched_transaction_id = p_transaction_id
  WHERE id = p_projection_id
    AND status = 'pending'
  RETURNING TRUE INTO v_updated;

  -- Link transaction back to projection
  IF v_updated THEN
    UPDATE transactions
    SET projection_id = p_projection_id
    WHERE id = p_transaction_id;
  END IF;

  RETURN COALESCE(v_updated, FALSE);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_1099_documents(p_ledger_id uuid, p_tax_year integer)
 RETURNS TABLE(created integer, skipped integer, total_amount numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_creator RECORD;
  v_totals RECORD;
  v_created INTEGER := 0;
  v_skipped INTEGER := 0;
  v_total NUMERIC := 0;
BEGIN
  FOR v_creator IN
    SELECT DISTINCT a.entity_id
    FROM accounts a
    WHERE a.ledger_id = p_ledger_id
      AND a.account_type = 'creator_balance'
      AND a.is_active = true
  LOOP
    SELECT * INTO v_totals
    FROM calculate_1099_totals(p_ledger_id, v_creator.entity_id, p_tax_year);
    
    IF NOT v_totals.requires_1099 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    
    -- Create tax document with amounts only (no PII)
    INSERT INTO tax_documents (
      ledger_id, document_type, tax_year, recipient_type, recipient_id,
      gross_amount, transaction_count, monthly_amounts, status
    ) VALUES (
      p_ledger_id, '1099-K', p_tax_year, 'creator', v_creator.entity_id,
      v_totals.gross_payments, v_totals.transaction_count, v_totals.monthly_totals, 'calculated'
    )
    ON CONFLICT (ledger_id, document_type, tax_year, recipient_id) 
    DO UPDATE SET
      gross_amount = EXCLUDED.gross_amount,
      transaction_count = EXCLUDED.transaction_count,
      monthly_amounts = EXCLUDED.monthly_amounts,
      updated_at = NOW();
    
    v_created := v_created + 1;
    v_total := v_total + v_totals.gross_payments;
  END LOOP;
  
  RETURN QUERY SELECT v_created, v_skipped, v_total;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_cpa_export(p_ledger_id uuid, p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_summary JSONB;
  v_transactions JSONB;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Get summary
  SELECT jsonb_build_object(
    'transaction_count', COUNT(*),
    'total_volume', SUM(t.amount),
    'unique_accounts', COUNT(DISTINCT e.account_id)
  ) INTO v_summary
  FROM public.transactions t
  JOIN public.entries e ON t.id = e.transaction_id
  WHERE t.ledger_id = p_ledger_id
    AND t.created_at::date BETWEEN p_start_date AND p_end_date
    AND t.status = 'completed';

  -- Get transactions
  SELECT COALESCE(jsonb_agg(row_to_json(t.*)), '[]'::JSONB) INTO v_transactions
  FROM public.transactions t
  WHERE t.ledger_id = p_ledger_id
    AND t.created_at::date BETWEEN p_start_date AND p_end_date
    AND t.status = 'completed';

  RETURN jsonb_build_object(
    'summary', v_summary,
    'transactions', v_transactions
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_instrument_fingerprint(p_external_ref text, p_amount bigint, p_currency text, p_cadence text, p_counterparty_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_canonical TEXT;
BEGIN
  -- Create canonical string representation for consistent hashing
  v_canonical := COALESCE(p_external_ref, '') || '|' ||
                 COALESCE(p_amount::TEXT, '0') || '|' ||
                 COALESCE(UPPER(p_currency), 'USD') || '|' ||
                 COALESCE(LOWER(p_cadence), 'one_time') || '|' ||
                 COALESCE(LOWER(TRIM(p_counterparty_name)), '');

  -- Return SHA-256 hash
  RETURN encode(extensions.digest(v_canonical, 'sha256'), 'hex');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_projection_dates(p_start_date date, p_until_date date, p_cadence text)
 RETURNS TABLE(expected_date date)
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current DATE := p_start_date;
  v_interval INTERVAL;
BEGIN
  -- Determine interval based on cadence
  CASE p_cadence
    WHEN 'weekly' THEN v_interval := '7 days'::INTERVAL;
    WHEN 'bi_weekly' THEN v_interval := '14 days'::INTERVAL;
    WHEN 'monthly' THEN v_interval := '1 month'::INTERVAL;
    WHEN 'quarterly' THEN v_interval := '3 months'::INTERVAL;
    WHEN 'annual', 'yearly' THEN v_interval := '1 year'::INTERVAL;
    ELSE
      -- Unsupported cadence, return empty
      RETURN;
  END CASE;

  -- Generate dates
  WHILE v_current <= p_until_date LOOP
    expected_date := v_current;
    RETURN NEXT;
    v_current := v_current + v_interval;
  END LOOP;

  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_unique_slug(base_name text, table_name text DEFAULT 'organizations'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.generate_webhook_secret()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.secret IS NULL THEN
    NEW.secret := encode(gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_account_balance(p_account_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(
    SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END),
    0
  )
  FROM public.entries
  WHERE account_id = p_account_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_account_balances_raw(p_ledger_id uuid)
 RETURNS TABLE(account_id uuid, account_code text, account_name text, account_type text, total_debits numeric, total_credits numeric, net_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  RETURN QUERY
  SELECT
    a.id as account_id,
    a.account_type as account_code,
    a.name as account_name,
    a.account_type,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)::NUMERIC as total_debits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)::NUMERIC as total_credits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END), 0)::NUMERIC as net_balance
  FROM public.accounts a
  LEFT JOIN public.entries e ON a.id = e.account_id
  LEFT JOIN public.transactions t ON e.transaction_id = t.id AND t.status NOT IN ('voided', 'reversed', 'draft')
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true
  GROUP BY a.id, a.account_type, a.name
  HAVING COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) > 0
      OR COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) > 0
  ORDER BY a.account_type, a.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_active_policies(p_ledger_id uuid)
 RETURNS TABLE(id uuid, policy_type text, config jsonb, severity text, priority integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ap.id,
    ap.policy_type,
    ap.config,
    ap.severity,
    ap.priority
  FROM authorization_policies ap
  WHERE ap.ledger_id = p_ledger_id
    AND ap.is_active = true
  ORDER BY ap.priority ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_all_account_balances(p_ledger_id uuid)
 RETURNS TABLE(account_id uuid, account_name text, account_type text, entity_id text, balance numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as account_id,
    a.name as account_name,
    a.account_type,
    a.entity_id,
    COALESCE(
      SUM(
        CASE 
          WHEN e.entry_type = 'credit' THEN e.amount 
          ELSE -e.amount 
        END
      ), 
      0
    )::NUMERIC(14,2) as balance
  FROM accounts a
  LEFT JOIN entries e ON a.id = e.account_id
  LEFT JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true
  GROUP BY a.id, a.name, a.account_type, a.entity_id
  ORDER BY a.account_type, a.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_creator_balances(p_ledger_id uuid)
 RETURNS TABLE(creator_id text, creator_name text, total_earned numeric, total_paid numeric, held_amount numeric, available_balance numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.entity_id as creator_id,
    a.name as creator_name,
    -- Total earned = sum of all credits
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)::NUMERIC(14,2) as total_earned,
    -- Total paid = sum of all debits (payouts)
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)::NUMERIC(14,2) as total_paid,
    -- Held amount from held_funds table
    COALESCE(
      (SELECT SUM(hf.held_amount - hf.released_amount) 
       FROM held_funds hf 
       WHERE hf.creator_id = a.entity_id 
         AND hf.ledger_id = p_ledger_id
         AND hf.status IN ('held', 'partial')),
      0
    )::NUMERIC(14,2) as held_amount,
    -- Available = earned - paid - held
    (COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) -
     COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) -
     COALESCE(
       (SELECT SUM(hf.held_amount - hf.released_amount) 
        FROM held_funds hf 
        WHERE hf.creator_id = a.entity_id 
          AND hf.ledger_id = p_ledger_id
          AND hf.status IN ('held', 'partial')),
       0
     ))::NUMERIC(14,2) as available_balance
  FROM accounts a
  LEFT JOIN entries e ON a.id = e.account_id
  LEFT JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'creator_balance'
    AND a.is_active = true
  GROUP BY a.entity_id, a.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_creators_for_statements(p_ledger_id uuid, p_year integer, p_month integer)
 RETURNS TABLE(creator_id text, creator_name text, email text, total_earnings numeric, total_payouts numeric, balance numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.entity_id as creator_id,
    a.name as creator_name,
    (a.metadata->>'email')::TEXT as email,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) as total_earnings,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) as total_payouts,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END), 0) as balance
  FROM accounts a
  LEFT JOIN entries e ON e.account_id = a.id
  LEFT JOIN transactions t ON e.transaction_id = t.id
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'creator_balance'
    AND a.metadata->>'email' IS NOT NULL
    AND (t.id IS NULL OR (
      t.status NOT IN ('voided', 'reversed')
      AND EXTRACT(YEAR FROM t.created_at) = p_year
      AND EXTRACT(MONTH FROM t.created_at) = p_month
    ))
  GROUP BY a.id, a.entity_id, a.name, a.metadata
  HAVING COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_period_usage(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_result jsonb;
BEGIN
  -- Get current billing period from subscription
  SELECT current_period_start, current_period_end
  INTO v_period_start, v_period_end
  FROM subscriptions
  WHERE organization_id = p_organization_id
    AND status IN ('active', 'trialing')
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Default to current month if no subscription
  IF v_period_start IS NULL THEN
    v_period_start := date_trunc('month', now());
    v_period_end := date_trunc('month', now()) + interval '1 month';
  END IF;
  
  SELECT jsonb_build_object(
    'period_start', v_period_start,
    'period_end', v_period_end,
    'api_calls', COALESCE(SUM(api_calls), 0),
    'transactions', COALESCE(SUM(transactions_count), 0),
    'creators', (
      SELECT COUNT(DISTINCT entity_id) 
      FROM accounts 
      WHERE ledger_id IN (SELECT id FROM ledgers WHERE organization_id = p_organization_id)
        AND account_type = 'creator_balance'
    ),
    'ledgers', (
      SELECT COUNT(*) FROM ledgers WHERE organization_id = p_organization_id
    )
  ) INTO v_result
  FROM usage_aggregates
  WHERE organization_id = p_organization_id
    AND date >= v_period_start::date
    AND date < v_period_end::date;
  
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_deadlock_count()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(sum(deadlocks), 0)
  FROM pg_catalog.pg_stat_database;
$function$
;

CREATE OR REPLACE FUNCTION public.get_default_settings(p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_mode = 'marketplace' THEN
    RETURN '{
      "default_split_percent": 80,
      "platform_fee_percent": 20,
      "min_payout_amount": 10.00,
      "payout_schedule": "manual",
      "tax_withholding_percent": 0,
      "auto_create_creator_accounts": true
    }'::jsonb;
  ELSE
    -- Standard mode: 100% platform fee (all revenue goes to business)
    RETURN '{
      "platform_fee_percent": 100,
      "fiscal_year_start": "01-01",
      "default_tax_rate": 25,
      "track_sales_tax": false,
      "sales_tax_rate": 0,
      "invoice_prefix": "INV-",
      "invoice_next_number": 1001
    }'::jsonb;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_effective_split(p_ledger_id uuid, p_creator_id text, p_product_id text DEFAULT NULL::text)
 RETURNS TABLE(creator_percent numeric, platform_percent numeric, source text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_creator_custom NUMERIC(5,2);
  v_creator_tier TEXT;
  v_tier_percent NUMERIC(5,2);
  v_product_percent NUMERIC(5,2);
  v_product_creator_override NUMERIC(5,2);
  v_default_percent NUMERIC(5,2);
BEGIN
  -- Get creator's custom rate and tier
  SELECT 
    (a.metadata->>'custom_split_percent')::NUMERIC(5,2),
    a.metadata->>'tier'
  INTO v_creator_custom, v_creator_tier
  FROM accounts a
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'creator_balance'
    AND a.entity_id = p_creator_id;

  -- 1. Check creator's custom rate
  IF v_creator_custom IS NOT NULL THEN
    RETURN QUERY SELECT v_creator_custom, 100 - v_creator_custom, 'creator'::TEXT;
    RETURN;
  END IF;

  -- 2. Check product-specific rate (with creator override)
  IF p_product_id IS NOT NULL THEN
    SELECT 
      ps.creator_percent,
      (ps.creator_overrides->>p_creator_id)::NUMERIC(5,2)
    INTO v_product_percent, v_product_creator_override
    FROM product_splits ps
    WHERE ps.ledger_id = p_ledger_id
      AND ps.product_id = p_product_id
      AND (ps.effective_until IS NULL OR ps.effective_until > NOW());

    -- Product + creator override
    IF v_product_creator_override IS NOT NULL THEN
      RETURN QUERY SELECT v_product_creator_override, 100 - v_product_creator_override, 'product_creator'::TEXT;
      RETURN;
    END IF;

    -- Product default
    IF v_product_percent IS NOT NULL THEN
      RETURN QUERY SELECT v_product_percent, 100 - v_product_percent, 'product'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 3. Check tier-based rate
  IF v_creator_tier IS NOT NULL THEN
    SELECT ct.creator_percent INTO v_tier_percent
    FROM creator_tiers ct
    WHERE ct.ledger_id = p_ledger_id
      AND ct.tier_name = v_creator_tier;

    IF v_tier_percent IS NOT NULL THEN
      RETURN QUERY SELECT v_tier_percent, 100 - v_tier_percent, 'tier'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 4. Ledger default
  SELECT COALESCE((l.settings->>'default_split_percent')::NUMERIC(5,2), 80)
  INTO v_default_percent
  FROM ledgers l
  WHERE l.id = p_ledger_id;

  RETURN QUERY SELECT v_default_percent, 100 - v_default_percent, 'ledger_default'::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_escrow_summary(p_ledger_id uuid)
 RETURNS TABLE(venture_id text, total_held numeric, total_ready numeric, total_pending_release numeric, entry_count bigint, oldest_hold_date timestamp with time zone, unique_recipients bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    t.metadata->>'venture_id' as venture_id,
    SUM(e.amount) as total_held,
    SUM(CASE WHEN e.hold_until IS NULL OR e.hold_until <= NOW() THEN e.amount ELSE 0 END) as total_ready,
    SUM(CASE WHEN e.release_status = 'pending_release' THEN e.amount ELSE 0 END) as total_pending_release,
    COUNT(*) as entry_count,
    MIN(e.created_at) as oldest_hold_date,
    COUNT(DISTINCT a.entity_id) as unique_recipients
  FROM entries e
  JOIN accounts a ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id
  WHERE a.ledger_id = p_ledger_id
    AND e.release_status IN ('held', 'pending_release')
    AND e.entry_type = 'credit'
    AND a.account_type = 'creator_balance'
  GROUP BY t.metadata->>'venture_id';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_held_funds_dashboard(p_ledger_id uuid, p_venture_id text DEFAULT NULL::text, p_ready_only boolean DEFAULT false, p_limit integer DEFAULT 100)
 RETURNS TABLE(entry_id uuid, amount numeric, currency text, held_since timestamp with time zone, days_held integer, hold_reason text, hold_until timestamp with time zone, ready_for_release boolean, recipient_type text, recipient_id text, recipient_name text, has_connected_account boolean, stripe_account_id text, transaction_ref text, product_name text, venture_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as entry_id,
    e.amount,
    COALESCE(t.currency, 'USD') as currency,
    e.created_at as held_since,
    EXTRACT(DAY FROM NOW() - e.created_at)::INTEGER as days_held,
    e.hold_reason,
    e.hold_until,
    (e.hold_until IS NULL OR e.hold_until <= NOW()) as ready_for_release,
    a.entity_type as recipient_type,
    a.entity_id as recipient_id,
    a.name as recipient_name,
    (ca.id IS NOT NULL) as has_connected_account,
    ca.stripe_account_id,
    t.reference_id as transaction_ref,
    t.metadata->>'product_name' as product_name,
    t.metadata->>'venture_id' as venture_id
  FROM entries e
  JOIN accounts a ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id
  LEFT JOIN connected_accounts ca ON (
    ca.ledger_id = a.ledger_id 
    AND ca.entity_type = a.entity_type 
    AND ca.entity_id = a.entity_id
    AND ca.is_active = true
  )
  WHERE a.ledger_id = p_ledger_id
    AND e.release_status = 'held'
    AND e.entry_type = 'credit'
    AND a.account_type = 'creator_balance'
    AND (p_venture_id IS NULL OR t.metadata->>'venture_id' = p_venture_id)
    AND (NOT p_ready_only OR e.hold_until IS NULL OR e.hold_until <= NOW())
  ORDER BY e.created_at ASC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_held_funds_summary(p_ledger_id uuid)
 RETURNS TABLE(venture_id text, venture_name text, recipient_type text, recipient_id text, recipient_name text, total_held numeric, oldest_hold timestamp with time zone, ready_for_release numeric, entry_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    t.metadata->>'venture_id' as venture_id,
    v.name as venture_name,
    a.entity_type as recipient_type,
    a.entity_id as recipient_id,
    a.name as recipient_name,
    SUM(e.amount) as total_held,
    MIN(e.created_at) as oldest_hold,
    SUM(CASE WHEN e.hold_until <= NOW() THEN e.amount ELSE 0 END) as ready_for_release,
    COUNT(*) as entry_count
  FROM entries e
  JOIN accounts a ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id
  LEFT JOIN ventures v ON v.ledger_id = a.ledger_id AND v.venture_id = t.metadata->>'venture_id'
  WHERE a.ledger_id = p_ledger_id
    AND e.release_status = 'held'
    AND e.entry_type = 'credit'
  GROUP BY 
    t.metadata->>'venture_id',
    v.name,
    a.entity_type,
    a.entity_id,
    a.name
  ORDER BY total_held DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_lock_wait_count()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT count(*)
  FROM pg_catalog.pg_stat_activity
  WHERE wait_event_type = 'Lock'
    AND state = 'active';
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_account(p_ledger_id uuid, p_account_type text, p_name text DEFAULT NULL::text, p_entity_type text DEFAULT 'business'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id UUID;
  v_name TEXT;
BEGIN
  v_name := COALESCE(p_name, INITCAP(REPLACE(p_account_type, '_', ' ')));
  
  SELECT id INTO v_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = p_account_type
    AND entity_id IS NULL
  LIMIT 1;
  
  IF v_account_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES (p_ledger_id, p_account_type, p_entity_type, v_name, NULL)
    ON CONFLICT (ledger_id, account_type, entity_id) DO NOTHING
    RETURNING id INTO v_account_id;
    
    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id
      FROM accounts
      WHERE ledger_id = p_ledger_id
        AND account_type = p_account_type
        AND entity_id IS NULL
      LIMIT 1;
    END IF;
  END IF;
  
  RETURN v_account_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_ledger_account(p_ledger_id uuid, p_account_type text, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id UUID;
  v_name TEXT;
BEGIN
  v_name := COALESCE(p_name, INITCAP(REPLACE(p_account_type, '_', ' ')));
  
  -- Try to find existing account
  SELECT id INTO v_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = p_account_type
    AND entity_id IS NULL
  LIMIT 1;
  
  -- Create if not exists (with ON CONFLICT for the unique index)
  IF v_account_id IS NULL THEN
    BEGIN
      INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
      VALUES (p_ledger_id, p_account_type, 'business', v_name, NULL)
      RETURNING id INTO v_account_id;
    EXCEPTION WHEN unique_violation THEN
      -- Race condition: another process created it, fetch it
      SELECT id INTO v_account_id
      FROM accounts
      WHERE ledger_id = p_ledger_id
        AND account_type = p_account_type
        AND entity_id IS NULL
      LIMIT 1;
    END;
  END IF;
  
  RETURN v_account_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_reserve_account(p_ledger_id uuid, p_rule_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id uuid;
  v_account_name text;
  v_type text := COALESCE(NULLIF(p_rule_type, ''), 'reserve');
BEGIN
  v_account_name := CASE v_type
    WHEN 'tax_reserve' THEN 'Tax Withholding Reserve'
    WHEN 'refund_buffer' THEN 'Refund Reserve'
    WHEN 'platform_hold' THEN 'Platform Hold Reserve'
    WHEN 'compliance_hold' THEN 'Compliance Hold Reserve'
    WHEN 'dispute' THEN 'Dispute Reserve'
    ELSE 'Withholding Reserve'
  END;

  SELECT id INTO v_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'reserve'
    AND name = v_account_name;

  IF v_account_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, metadata)
    VALUES (
      p_ledger_id,
      'reserve',
      'platform',
      v_account_name,
      jsonb_build_object('reserve_type', v_type)
    )
    RETURNING id INTO v_account_id;
  END IF;

  RETURN v_account_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pending_webhooks(p_limit integer DEFAULT 100)
 RETURNS TABLE(delivery_id uuid, endpoint_url text, endpoint_secret text, event_type text, payload jsonb, attempts integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    wd.id as delivery_id,
    we.url as endpoint_url,
    we.secret as endpoint_secret,
    wd.event_type,
    wd.payload,
    wd.attempts
  FROM webhook_deliveries wd
  JOIN webhook_endpoints we ON wd.endpoint_id = we.id
  WHERE wd.status IN ('pending', 'retrying')
    AND wd.scheduled_at <= NOW()
    AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= NOW())
    AND wd.attempts < wd.max_attempts
    AND we.is_active = true
  ORDER BY wd.scheduled_at
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_plaid_token_from_vault(p_connection_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_token TEXT;
BEGIN
  -- Log access attempt
  INSERT INTO public.vault_access_log (secret_type, secret_id, accessed_by, access_granted)
  VALUES ('plaid_token', p_connection_id::text, current_user, true);
  
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'plaid_token_' || p_connection_id::text;
  
  RETURN v_token;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_processor_secret_key_from_vault(p_ledger_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vault_id UUID;
  v_secret TEXT;
  v_settings_secret TEXT;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Get vault ID from ledger
  SELECT processor_secret_key_vault_id,
         settings->>'processor_secret_key'
  INTO v_vault_id, v_settings_secret
  FROM ledgers
  WHERE id = p_ledger_id;

  -- If we have a vault ID, use it
  IF v_vault_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE id = v_vault_id;
    RETURN v_secret;
  END IF;

  -- Fallback to settings JSON for unmigrated ledgers
  RETURN v_settings_secret;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_quick_health_status(p_ledger_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'status', status,
    'last_check', run_at,
    'passed', passed_checks,
    'warnings', warning_checks,
    'failed', failed_checks
  ) INTO v_result
  FROM health_check_results
  WHERE ledger_id = p_ledger_id
  ORDER BY run_at DESC
  LIMIT 1;

  RETURN COALESCE(v_result, jsonb_build_object(
    'status', 'unknown',
    'message', 'No health check has been run yet'
  ));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rate_limit_offenders(p_min_violations integer DEFAULT 5)
 RETURNS TABLE(api_key_prefix text, endpoint text, violation_count integer, last_violation timestamp with time zone, is_blocked boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    LEFT(rl.key, 12) || '...' as api_key_prefix,
    rl.endpoint,
    rl.violation_count,
    rl.last_violation_at as last_violation,
    (rl.blocked_until IS NOT NULL AND rl.blocked_until > NOW()) as is_blocked
  FROM rate_limits rl
  WHERE rl.violation_count >= p_min_violations
  ORDER BY rl.violation_count DESC
  LIMIT 100;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_role_permissions(p_role text)
 RETURNS TABLE(can_write_transactions boolean, can_close_periods boolean, can_create_adjustments boolean, can_export boolean, can_view_all boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT
    CASE p_role
      WHEN 'owner' THEN true
      WHEN 'accountant' THEN true
      WHEN 'operator' THEN true
      WHEN 'readonly' THEN false
    END,
    CASE p_role
      WHEN 'owner' THEN true
      WHEN 'accountant' THEN true
      WHEN 'operator' THEN false
      WHEN 'readonly' THEN false
    END,
    CASE p_role
      WHEN 'owner' THEN true
      WHEN 'accountant' THEN true
      WHEN 'operator' THEN false
      WHEN 'readonly' THEN false
    END,
    CASE p_role
      WHEN 'owner' THEN true
      WHEN 'accountant' THEN true
      WHEN 'operator' THEN true
      WHEN 'readonly' THEN true
    END,
    true;  -- Everyone can view
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_stripe_reconciliation_summary(p_ledger_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_transactions', COUNT(*),
    'unmatched', COUNT(*) FILTER (WHERE match_status = 'unmatched'),
    'auto_matched', COUNT(*) FILTER (WHERE match_status = 'auto_matched'),
    'manually_matched', COUNT(*) FILTER (WHERE match_status = 'matched'),
    'reviewed', COUNT(*) FILTER (WHERE match_status = 'reviewed'),
    'excluded', COUNT(*) FILTER (WHERE match_status = 'excluded'),
    'by_type', jsonb_object_agg(stripe_type, type_count),
    'total_amount', SUM(amount),
    'total_fees', SUM(COALESCE(fee, 0))
  ) INTO v_result
  FROM (
    SELECT 
      match_status,
      stripe_type,
      amount,
      fee,
      COUNT(*) OVER (PARTITION BY stripe_type) as type_count
    FROM stripe_transactions
    WHERE ledger_id = p_ledger_id
  ) sub;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_stripe_secret_key_from_vault(p_ledger_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vault_id UUID;
  v_secret TEXT;
  v_settings_secret TEXT;
BEGIN
  -- Get vault ID from ledger
  SELECT stripe_secret_key_vault_id, 
         settings->>'stripe_secret_key'
  INTO v_vault_id, v_settings_secret
  FROM ledgers
  WHERE id = p_ledger_id;
  
  -- If we have a vault ID, use it
  IF v_vault_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE id = v_vault_id;
    RETURN v_secret;
  END IF;
  
  -- Fallback to settings JSON for unmigrated ledgers
  RETURN v_settings_secret;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_stripe_webhook_secret_from_vault(p_ledger_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_secret TEXT;
  v_vault_id UUID;
BEGIN
  -- Log access attempt
  INSERT INTO public.vault_access_log (secret_type, secret_id, accessed_by, access_granted)
  VALUES ('stripe_webhook', p_ledger_id::text, current_user, true);

  SELECT stripe_webhook_secret_vault_id INTO v_vault_id
  FROM public.ledgers
  WHERE id = p_ledger_id;
  
  IF v_vault_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE id = v_vault_id;
    
    IF v_secret IS NOT NULL THEN
      RETURN v_secret;
    END IF;
  END IF;
  
  -- Fallback to settings JSON (legacy)
  SELECT settings->>'stripe_webhook_secret' INTO v_secret
  FROM public.ledgers
  WHERE id = p_ledger_id;
  
  RETURN v_secret;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_organization(p_user_id uuid)
 RETURNS TABLE(organization_id uuid, organization_name text, organization_slug text, organization_plan text, user_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_organization_ids(p_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Auth guard: only allow querying your own memberships
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF p_user_id <> auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  RETURN QUERY
  SELECT organization_id
  FROM organization_members
  WHERE user_id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_webhook_endpoint_safe(p_endpoint_id uuid)
 RETURNS TABLE(id uuid, url text, description text, events text[], is_active boolean, secret_hint text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    we.id,
    we.url,
    we.description,
    we.events,
    we.is_active,
    '...' || RIGHT(we.secret, 4) as secret_hint,
    we.created_at
  FROM webhook_endpoints we
  WHERE we.id = p_endpoint_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_organization_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Instead of hard delete, preserve the slug forever
  -- Add to reserved_slugs to prevent reuse
  INSERT INTO reserved_slugs (slug, reason)
  VALUES (OLD.slug, 'Previously used by organization: ' || OLD.name || ' (deleted ' || NOW() || ')')
  ON CONFLICT (slug) DO NOTHING;
  
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_organization_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- On INSERT: generate slug if not provided
  IF TG_OP = 'INSERT' THEN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
      NEW.slug := generate_unique_slug(NEW.name);
    ELSE
      -- Normalize provided slug
      NEW.slug := lower(trim(NEW.slug));
      NEW.slug := regexp_replace(NEW.slug, '[^a-z0-9-]+', '', 'g');

      -- Check uniqueness (this runs with SECURITY DEFINER, so RLS bypassed)
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_plan_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  CASE NEW.plan
    WHEN 'trial' THEN
      NEW.max_ledgers := 1;
      NEW.max_team_members := 1;
    WHEN 'pro' THEN
      NEW.max_ledgers := 1;
      NEW.max_team_members := 1;
    WHEN 'business' THEN
      NEW.max_ledgers := 10;
      NEW.max_team_members := 10;
    WHEN 'scale' THEN
      NEW.max_ledgers := -1;
      NEW.max_team_members := -1;
    ELSE
      NEW.max_ledgers := 1;
      NEW.max_team_members := 1;
  END CASE;

  NEW.overage_ledger_price := COALESCE(NEW.overage_ledger_price, 2000);
  NEW.overage_team_member_price := COALESCE(NEW.overage_team_member_price, 2000);

  IF OLD.plan IS DISTINCT FROM NEW.plan THEN
    INSERT INTO public.billing_events (
      organization_id,
      stripe_event_type,
      description,
      stripe_data
    ) VALUES (
      NEW.id,
      'plan_changed',
      'Plan changed from ' || COALESCE(OLD.plan, 'none') || ' to ' || NEW.plan,
      jsonb_build_object(
        'old_plan', OLD.plan,
        'new_plan', NEW.plan,
        'old_limits', jsonb_build_object('ledgers', OLD.max_ledgers, 'members', OLD.max_team_members),
        'new_limits', jsonb_build_object('ledgers', NEW.max_ledgers, 'members', NEW.max_team_members)
      )
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hash_api_key(p_key text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN encode(sha256(p_key::bytea), 'hex');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_default_tiers(p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO creator_tiers (ledger_id, tier_name, tier_order, creator_percent, threshold_type, threshold_value, description)
  VALUES
    (p_ledger_id, 'starter', 1, 80, 'lifetime_earnings', 0, 'Default tier for new creators'),
    (p_ledger_id, 'bronze', 2, 82, 'lifetime_earnings', 1000, 'Unlocked at $1,000 lifetime earnings'),
    (p_ledger_id, 'silver', 3, 85, 'lifetime_earnings', 10000, 'Unlocked at $10,000 lifetime earnings'),
    (p_ledger_id, 'gold', 4, 88, 'lifetime_earnings', 50000, 'Unlocked at $50,000 lifetime earnings'),
    (p_ledger_id, 'platinum', 5, 90, 'lifetime_earnings', 100000, 'Unlocked at $100,000 lifetime earnings')
  ON CONFLICT (ledger_id, tier_name) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_expense_accounts(p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- No-op: handled by get_or_create_ledger_account on demand
  NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_expense_categories(p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- No-op: expense_categories table was never created
  NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_ledger_accounts(p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode TEXT;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Get ledger mode
  SELECT ledger_mode INTO v_mode FROM ledgers WHERE id = p_ledger_id;

  -- Idempotent: partial unique index unique_ledger_account_type_no_entity
  -- covers (ledger_id, account_type) WHERE entity_id IS NULL, so repeated
  -- calls safely skip already-existing platform accounts.
  IF v_mode = 'marketplace' THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES
      (p_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue', NULL),
      (p_ledger_id, 'creator_pool', 'reserve', 'Creator Pool', NULL),
      (p_ledger_id, 'processing_fees', 'reserve', 'Processing Fees', NULL),
      (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve', NULL),
      (p_ledger_id, 'refund_reserve', 'reserve', 'Refund Reserve', NULL),
      (p_ledger_id, 'cash', 'business', 'Operating Cash', NULL)
    ON CONFLICT (ledger_id, account_type) WHERE entity_id IS NULL DO NOTHING;
  ELSE
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES
      (p_ledger_id, 'revenue', 'business', 'Revenue', NULL),
      (p_ledger_id, 'expense', 'business', 'Expenses', NULL),
      (p_ledger_id, 'cash', 'business', 'Cash', NULL),
      (p_ledger_id, 'accounts_receivable', 'business', 'Accounts Receivable', NULL),
      (p_ledger_id, 'accounts_payable', 'business', 'Accounts Payable', NULL),
      (p_ledger_id, 'owner_equity', 'business', 'Owner Equity', NULL),
      (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve', NULL)
    ON CONFLICT (ledger_id, account_type) WHERE entity_id IS NULL DO NOTHING;
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- Log but don't fail
  RAISE NOTICE 'Could not initialize accounts for ledger %: %', p_ledger_id, SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_marketplace_accounts(p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Platform accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'cash', 'platform', 'Cash / Bank'),
    (p_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue'),
    (p_ledger_id, 'processing_fees', 'platform', 'Processing Fees');
  
  -- Creator liability
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'creator_pool', 'platform', 'Creator Liability Pool');
  
  -- Reserves
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Withholding Reserve'),
    (p_ledger_id, 'refund_reserve', 'reserve', 'Refund Reserve');
  
  -- Expense accounts (platforms have expenses too)
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'expense', 'platform', 'Operating Expenses'),
    (p_ledger_id, 'owner_equity', 'platform', 'Owner''s Equity'),
    (p_ledger_id, 'owner_draw', 'platform', 'Owner''s Draws'),
    (p_ledger_id, 'accounts_payable', 'platform', 'Accounts Payable');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_receipt_rules(p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- IRS: Meals always need receipts
  INSERT INTO receipt_rules (ledger_id, category_id, rule_name, always_required, irs_requirement, irs_reference, enforcement_level)
  SELECT p_ledger_id, id, 'Meals require receipts', true, true, 'Publication 463', 'warn'
  FROM expense_categories WHERE ledger_id = p_ledger_id AND code = 'meals';
  
  -- IRS: Travel always needs receipts
  INSERT INTO receipt_rules (ledger_id, category_id, rule_name, always_required, irs_requirement, irs_reference, enforcement_level)
  SELECT p_ledger_id, id, 'Travel requires receipts', true, true, 'Publication 463', 'warn'
  FROM expense_categories WHERE ledger_id = p_ledger_id AND code = 'travel';
  
  -- IRS: Lodging always needs receipts
  INSERT INTO receipt_rules (ledger_id, category_id, rule_name, always_required, irs_requirement, irs_reference, enforcement_level)
  SELECT p_ledger_id, id, 'Lodging requires receipts', true, true, 'Publication 463', 'warn'
  FROM expense_categories WHERE ledger_id = p_ledger_id AND code = 'lodging';
  
  -- General: Anything over $75 needs receipt
  INSERT INTO receipt_rules (ledger_id, rule_name, min_amount, irs_requirement, irs_reference, enforcement_level)
  VALUES (p_ledger_id, 'Expenses over $75 require receipts', 75, true, 'Publication 463', 'warn');
  
  -- Vehicle expenses
  INSERT INTO receipt_rules (ledger_id, category_id, rule_name, always_required, enforcement_level)
  SELECT p_ledger_id, id, 'Vehicle expenses require receipts', true, 'warn'
  FROM expense_categories WHERE ledger_id = p_ledger_id AND code = 'vehicle';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_standard_accounts(p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Asset accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'cash', 'business', 'Business Checking'),
    (p_ledger_id, 'accounts_receivable', 'business', 'Accounts Receivable');
  
  -- Liability accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'accounts_payable', 'business', 'Accounts Payable'),
    (p_ledger_id, 'credit_card', 'business', 'Business Credit Card'),
    (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve'),
    (p_ledger_id, 'sales_tax_payable', 'business', 'Sales Tax Payable');
  
  -- Equity accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'owner_equity', 'business', 'Owner''s Equity'),
    (p_ledger_id, 'owner_draw', 'business', 'Owner''s Draws');
  
  -- Revenue accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'revenue', 'business', 'Sales Revenue'),
    (p_ledger_id, 'other_income', 'business', 'Other Income');
  
  -- Expense account
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'expense', 'business', 'Operating Expenses');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_tax_buckets(p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tax_reserve_account UUID;
BEGIN
  -- Get or create tax reserve account
  SELECT id INTO v_tax_reserve_account
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'tax_reserve';
  
  -- Federal income tax (25% estimate)
  INSERT INTO tax_buckets (ledger_id, account_id, bucket_type, name, target_percentage)
  VALUES (p_ledger_id, v_tax_reserve_account, 'federal_income', 'Federal Income Tax', 25);
  
  -- Self-employment tax (15.3%)
  INSERT INTO tax_buckets (ledger_id, account_id, bucket_type, name, target_percentage)
  VALUES (p_ledger_id, v_tax_reserve_account, 'self_employment', 'Self-Employment Tax', 15.3);
  
  -- Quarterly estimated
  INSERT INTO tax_buckets (ledger_id, account_id, bucket_type, name, target_percentage)
  VALUES (p_ledger_id, v_tax_reserve_account, 'quarterly_estimated', 'Quarterly Estimated Taxes', 30);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_authorization_valid(p_decision_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_expires_at TIMESTAMPTZ;
  v_decision TEXT;
BEGIN
  SELECT expires_at, decision INTO v_expires_at, v_decision
  FROM authorization_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Expired decisions are invalid
  IF v_expires_at < NOW() THEN
    RETURN false;
  END IF;

  -- Only allowed or warn decisions are valid for proceeding
  RETURN v_decision IN ('allowed', 'warn');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_marketplace_ledger(p_ledger_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode TEXT;
BEGIN
  SELECT ledger_mode INTO v_mode
  FROM ledgers
  WHERE id = p_ledger_id;
  
  RETURN v_mode = 'marketplace';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_period_closed(p_ledger_id uuid, p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_closed BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM accounting_periods
    WHERE ledger_id = p_ledger_id
      AND p_date BETWEEN period_start AND period_end
      AND status IN ('closed', 'locked')
  ) INTO v_closed;
  
  RETURN COALESCE(v_closed, false);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_standard_ledger(p_ledger_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode TEXT;
BEGIN
  SELECT ledger_mode INTO v_mode
  FROM ledgers
  WHERE id = p_ledger_id;
  
  RETURN v_mode = 'standard' OR v_mode IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_valid_uuid(p_text text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
  IF p_text IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Try to cast to UUID, return true if succeeds
  PERFORM p_text::UUID;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_security_event(p_ledger_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_actor_type text, p_actor_id text, p_ip_address inet, p_user_agent text, p_details jsonb DEFAULT '{}'::jsonb, p_risk_score integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_log (
    ledger_id, action, entity_type, entity_id, 
    actor_type, actor_id, ip_address, user_agent, 
    request_body, risk_score
  ) VALUES (
    p_ledger_id, p_action, p_entity_type, p_entity_id,
    p_actor_type, p_actor_id, p_ip_address, p_user_agent,
    p_details, p_risk_score
  )
  RETURNING id INTO v_log_id;
  
  -- Alert on high-risk events
  IF p_risk_score >= 80 THEN
    RAISE NOTICE 'HIGH RISK EVENT: % on ledger % (score: %)', p_action, p_ledger_id, p_risk_score;
  END IF;
  
  RETURN v_log_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_service_role_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    INSERT INTO audit_log (
      ledger_id,
      action,
      entity_type,
      entity_id,
      actor_type,
      request_body
    ) VALUES (
      COALESCE(NEW.ledger_id, current_setting('app.current_ledger_id', true)::uuid),
      TG_OP || '_via_service_role',
      TG_TABLE_NAME,
      COALESCE(NEW.id::text, OLD.id::text),
      'service_role',
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'timestamp', now()
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Don't block operations if logging fails
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.manual_match_transaction(p_bank_transaction_id uuid, p_ledger_transaction_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Verify both exist and belong to same ledger
  IF NOT EXISTS (
    SELECT 1 FROM bank_transactions bt
    JOIN transactions t ON bt.ledger_id = t.ledger_id
    WHERE bt.id = p_bank_transaction_id
      AND t.id = p_ledger_transaction_id
  ) THEN
    RAISE EXCEPTION 'Invalid transaction IDs or ledger mismatch';
  END IF;
  
  UPDATE bank_transactions
  SET reconciliation_status = 'manual_match',
      matched_transaction_id = p_ledger_transaction_id,
      matched_at = NOW(),
      matched_by = 'user',
      match_confidence = 1.00
  WHERE id = p_bank_transaction_id;
  
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_entry_held(p_entry_id uuid, p_hold_reason text DEFAULT 'dispute_window'::text, p_hold_days integer DEFAULT 7)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE entries
  SET 
    release_status = 'held',
    hold_reason = p_hold_reason,
    hold_until = NOW() + (p_hold_days || ' days')::INTERVAL
  WHERE id = p_entry_id
    AND release_status = 'held';  -- Only if not already processed
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_webhook_delivered(p_delivery_id uuid, p_response_status integer, p_response_body text DEFAULT NULL::text, p_response_time_ms integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE webhook_deliveries
  SET 
    status = 'delivered',
    delivered_at = NOW(),
    response_status = p_response_status,
    response_body = p_response_body,
    response_time_ms = p_response_time_ms,
    attempts = attempts + 1
  WHERE id = p_delivery_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_webhook_failed(p_delivery_id uuid, p_response_status integer DEFAULT NULL::integer, p_response_body text DEFAULT NULL::text, p_response_time_ms integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_attempts INTEGER;
  v_max_attempts INTEGER;
  v_base_delay_seconds INTEGER;
  v_jitter_seconds INTEGER;
  v_retry_delay INTERVAL;
BEGIN
  SELECT wd.attempts, wd.max_attempts
    INTO v_attempts, v_max_attempts
    FROM public.webhook_deliveries wd
   WHERE wd.id = p_delivery_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 1m, 2m, 4m, 8m... capped at 4h.
  v_base_delay_seconds := LEAST(60 * CAST(POWER(2, GREATEST(v_attempts, 0)) AS INTEGER), 14400);

  -- Slow down on upstream throttling.
  IF p_response_status = 429 THEN
    v_base_delay_seconds := GREATEST(v_base_delay_seconds, 300);
  END IF;

  -- Small random jitter to prevent synchronized retries.
  v_jitter_seconds := FLOOR(RANDOM() * 31)::INTEGER; -- 0-30s
  v_retry_delay := make_interval(secs => v_base_delay_seconds + v_jitter_seconds);

  UPDATE public.webhook_deliveries
     SET status = CASE WHEN v_attempts + 1 >= v_max_attempts THEN 'failed' ELSE 'retrying' END,
         response_status = p_response_status,
         response_body = p_response_body,
         response_time_ms = p_response_time_ms,
         attempts = attempts + 1,
         next_retry_at = CASE
           WHEN v_attempts + 1 < v_max_attempts THEN NOW() + v_retry_delay
           ELSE NULL
         END
   WHERE id = p_delivery_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.merge_organization_settings_key(p_organization_id uuid, p_settings_key text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_updated JSONB;
BEGIN
  -- Allow service role without membership checks.
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Only owners/admins may patch org-level settings through this helper.
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = p_organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  UPDATE public.organizations o
  SET settings = jsonb_set(
    COALESCE(o.settings, '{}'::jsonb),
    ARRAY[p_settings_key],
    CASE
      -- Deep-merge when both the existing value and the patch are objects
      WHEN jsonb_typeof(p_patch) = 'object'
        AND jsonb_typeof(COALESCE(o.settings -> p_settings_key, '{}'::jsonb)) = 'object'
      THEN COALESCE(o.settings -> p_settings_key, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb)
      -- Replace entirely for scalar patches or when the existing value is a scalar
      ELSE p_patch
    END,
    true
  )
  WHERE o.id = p_organization_id
  RETURNING o.settings -> p_settings_key INTO v_updated;

  RETURN COALESCE(v_updated, '{}'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Audit log records are immutable and cannot be modified or deleted';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_instrument_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Authorizing instruments are immutable. Create a new instrument instead.';
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_linked_instrument_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE authorizing_instrument_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Cannot delete authorizing instrument that is linked to transactions';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_automatic_releases(p_ledger_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(held_fund_id uuid, creator_id text, amount numeric, success boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_held RECORD;
  v_result JSONB;
BEGIN
  FOR v_held IN
    SELECT hf.*
    FROM held_funds hf
    JOIN withholding_rules wr ON hf.withholding_rule_id = wr.id
    WHERE hf.status = 'held'
      AND hf.withholding_rule_id IS NOT NULL
      AND hf.release_eligible_at <= NOW()
      AND wr.release_trigger = 'automatic'
      AND (p_ledger_id IS NULL OR hf.ledger_id = p_ledger_id)
    ORDER BY hf.release_eligible_at ASC
  LOOP
    v_result := release_held_funds(v_held.id, 'Automatic release - hold period expired');

    held_fund_id := v_held.id;
    creator_id := v_held.creator_id;
    amount := v_held.held_amount;
    success := (v_result->>'success')::boolean;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_payout_atomic(p_ledger_id uuid, p_reference_id text, p_creator_id text, p_amount bigint, p_fees bigint DEFAULT 0, p_fees_paid_by text DEFAULT 'platform'::text, p_payout_method text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_reference_type text DEFAULT 'manual'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_creator_account_id  UUID;
  v_cash_account_id     UUID;
  v_fee_account_id      UUID;
  v_tx_id               UUID;
  v_payout_amount       NUMERIC(14,2);
  v_fees_amount         NUMERIC(14,2);
  v_net_to_creator      NUMERIC(14,2);
  v_fees_by_platform    NUMERIC(14,2);
  v_ledger_balance      NUMERIC(14,2);
  v_total_held          NUMERIC(14,2);
  v_available_balance   NUMERIC(14,2);
  v_new_balance         NUMERIC(14,2);
BEGIN
  v_payout_amount := p_amount / 100.0;
  v_fees_amount   := p_fees / 100.0;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'amount_must_be_positive');
  END IF;

  -- 1. Lock the creator account row to serialize concurrent payouts.
  --    Any other payout for this creator will block here until we commit.
  SELECT id INTO v_creator_account_id
    FROM public.accounts
   WHERE ledger_id = p_ledger_id
     AND account_type = 'creator_balance'
     AND entity_id = p_creator_id
     FOR UPDATE;

  IF v_creator_account_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'creator_not_found');
  END IF;

  -- 1b. Check for duplicate reference_id (under lock, before balance check).
  --     Returns 'duplicate' regardless of current balance state.
  SELECT id INTO v_tx_id
    FROM public.transactions
   WHERE ledger_id = p_ledger_id
     AND reference_id = p_reference_id;

  IF v_tx_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'transaction_id', v_tx_id
    );
  END IF;

  v_tx_id := NULL;  -- Reset for later INSERT RETURNING

  -- 2. Get cash account.
  SELECT id INTO v_cash_account_id
    FROM public.accounts
   WHERE ledger_id = p_ledger_id
     AND account_type = 'cash'
   LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'cash_account_not_found');
  END IF;

  -- 3. Calculate the creator's ledger balance (under the row lock).
  --    Excludes voided/reversed transactions.
  SELECT COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN e.entry_type = 'debit'  THEN e.amount ELSE 0 END), 0)
    INTO v_ledger_balance
    FROM public.entries e
    JOIN public.transactions t ON t.id = e.transaction_id
   WHERE e.account_id = v_creator_account_id
     AND t.status NOT IN ('voided', 'reversed');

  -- 4. Subtract held funds.
  SELECT COALESCE(SUM(held_amount - released_amount), 0)
    INTO v_total_held
    FROM public.held_funds
   WHERE ledger_id = p_ledger_id
     AND creator_id = p_creator_id
     AND status IN ('held', 'partial');

  v_available_balance := v_ledger_balance - v_total_held;

  -- 5. Insufficient balance guard.
  IF v_available_balance < v_payout_amount THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_balance',
      'ledger_balance', v_ledger_balance,
      'held_amount', v_total_held,
      'available', v_available_balance,
      'requested', v_payout_amount
    );
  END IF;

  -- 6. Calculate net amounts.
  v_net_to_creator   := v_payout_amount;
  v_fees_by_platform := 0;

  IF v_fees_amount > 0 AND p_fees_paid_by != 'creator' THEN
    v_fees_by_platform := v_fees_amount;
  ELSIF v_fees_amount > 0 THEN
    v_net_to_creator := v_payout_amount - v_fees_amount;
  END IF;

  -- 7. Insert the payout transaction.
  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'payout', p_reference_id, p_reference_type,
    COALESCE(p_description, 'Payout to ' || p_creator_id),
    v_payout_amount, 'USD', 'completed',
    jsonb_build_object(
      'creator_id', p_creator_id,
      'payout_method', p_payout_method,
      'fees', v_fees_amount,
      'net_to_creator', v_net_to_creator
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- 8. Insert entries: debit creator balance, credit cash.
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_creator_account_id, 'debit', v_payout_amount);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'credit', v_payout_amount + v_fees_by_platform);

  -- 9. Handle platform-paid fees.
  IF v_fees_by_platform > 0 THEN
    SELECT id INTO v_fee_account_id
      FROM public.accounts
     WHERE ledger_id = p_ledger_id
       AND account_type = 'processing_fees'
     LIMIT 1;

    IF v_fee_account_id IS NULL THEN
      INSERT INTO public.accounts (ledger_id, account_type, entity_type, name)
      VALUES (p_ledger_id, 'processing_fees', 'platform', 'Payout Fees')
      RETURNING id INTO v_fee_account_id;
    END IF;

    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_fee_account_id, 'debit', v_fees_by_platform);
  END IF;

  v_new_balance := v_available_balance - v_payout_amount;

  RETURN jsonb_build_object(
    'status', 'created',
    'transaction_id', v_tx_id,
    'gross_payout', v_payout_amount,
    'fees', v_fees_amount,
    'net_to_creator', v_net_to_creator,
    'previous_balance', v_available_balance,
    'new_balance', v_new_balance
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Duplicate reference_id — return existing transaction (idempotent)
    SELECT id INTO v_tx_id
      FROM public.transactions
     WHERE ledger_id = p_ledger_id
       AND reference_id = p_reference_id;

    RETURN jsonb_build_object(
      'status', 'duplicate',
      'transaction_id', v_tx_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_processor_refund(p_ledger_id uuid, p_original_tx_id uuid, p_charge_id text, p_reference_id text, p_description text, p_amount numeric, p_currency text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_original_amount  NUMERIC(14,2);
  v_already_refunded NUMERIC(14,2);
  v_new_tx_id        UUID;
  v_effective_meta   JSONB;
BEGIN
  SELECT t.amount
    INTO v_original_amount
    FROM public.transactions t
   WHERE t.id = p_original_tx_id
     AND t.ledger_id = p_ledger_id
   FOR UPDATE;

  IF v_original_amount IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'original_not_found'
    );
  END IF;

  SELECT COALESCE(SUM(t.amount), 0)
    INTO v_already_refunded
    FROM public.transactions t
   WHERE t.ledger_id = p_ledger_id
     AND t.transaction_type = 'refund'
     AND t.metadata->>'processor_charge_id' = p_charge_id;

  IF v_already_refunded + p_amount > v_original_amount * 1.005 THEN
    RETURN jsonb_build_object(
      'status', 'blocked',
      'already_refunded', v_already_refunded,
      'original_amount', v_original_amount
    );
  END IF;

  v_effective_meta :=
    COALESCE(p_metadata, '{}'::JSONB) ||
    jsonb_build_object('processor_charge_id', p_charge_id);

  BEGIN
    INSERT INTO public.transactions (
      ledger_id, transaction_type, reference_id, reference_type,
      description, amount, currency, status, reverses, metadata
    ) VALUES (
      p_ledger_id, 'refund', p_reference_id, 'processor_refund',
      p_description, p_amount, p_currency, 'completed',
      p_original_tx_id, v_effective_meta
    )
    RETURNING id INTO v_new_tx_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT t.id
        INTO v_new_tx_id
        FROM public.transactions t
       WHERE t.ledger_id = p_ledger_id
         AND t.reference_id = p_reference_id
       LIMIT 1;

      RETURN jsonb_build_object(
        'status', 'duplicate',
        'transaction_id', v_new_tx_id
      );
  END;

  IF v_already_refunded + p_amount >= v_original_amount THEN
    UPDATE public.transactions
       SET reversed_by = v_new_tx_id,
           status = CASE WHEN status = 'reversed' THEN status ELSE 'reversed' END
     WHERE id = p_original_tx_id
       AND reversed_by IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', 'created',
    'transaction_id', v_new_tx_id,
    'already_refunded', v_already_refunded,
    'is_full_refund', (v_already_refunded + p_amount >= v_original_amount)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_stripe_refund(p_ledger_id uuid, p_original_tx_id uuid, p_charge_id text, p_reference_id text, p_description text, p_amount numeric, p_currency text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original_amount  NUMERIC(14,2);
  v_already_refunded NUMERIC(14,2);
  v_new_tx_id        UUID;
BEGIN
  -- 1. Lock the original transaction row to serialize concurrent refunds
  --    for the same charge. Any other refund handler hitting this row will
  --    block here until this transaction commits or rolls back.
  SELECT amount INTO v_original_amount
    FROM transactions
   WHERE id = p_original_tx_id
     AND ledger_id = p_ledger_id
     FOR UPDATE;

  IF v_original_amount IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'original_not_found'
    );
  END IF;

  -- 2. Sum all existing refund transactions for this charge.
  --    This read is now consistent because the row lock serializes writers.
  SELECT COALESCE(SUM(amount), 0) INTO v_already_refunded
    FROM transactions
   WHERE ledger_id = p_ledger_id
     AND transaction_type = 'refund'
     AND metadata->>'stripe_charge_id' = p_charge_id;

  -- 3. Over-refund guard (0.5% tolerance for currency rounding)
  IF v_already_refunded + p_amount > v_original_amount * 1.005 THEN
    RETURN jsonb_build_object(
      'status', 'blocked',
      'already_refunded', v_already_refunded,
      'original_amount', v_original_amount
    );
  END IF;

  -- 4. Insert the refund transaction (unique constraint on reference_id
  --    is the final safety net for truly concurrent identical inserts).
  BEGIN
    INSERT INTO transactions (
      ledger_id, transaction_type, reference_id, reference_type,
      description, amount, currency, status, reverses, metadata
    ) VALUES (
      p_ledger_id, 'refund', p_reference_id, 'stripe_refund',
      p_description, p_amount, p_currency, 'completed',
      p_original_tx_id, p_metadata
    )
    RETURNING id INTO v_new_tx_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Another handler beat us — find the existing transaction
      SELECT id INTO v_new_tx_id
        FROM transactions
       WHERE ledger_id = p_ledger_id
         AND reference_id = p_reference_id;

      RETURN jsonb_build_object(
        'status', 'duplicate',
        'transaction_id', v_new_tx_id
      );
  END;

  -- 5. If this refund brings the total to >= original, mark as fully reversed.
  IF v_already_refunded + p_amount >= v_original_amount THEN
    UPDATE transactions
       SET reversed_by = v_new_tx_id
     WHERE id = p_original_tx_id
       AND reversed_by IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', 'created',
    'transaction_id', v_new_tx_id,
    'already_refunded', v_already_refunded,
    'is_full_refund', (v_already_refunded + p_amount >= v_original_amount)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_auto_releases(p_ledger_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_entry IN
    SELECT e.id
    FROM entries e
    JOIN accounts a ON e.account_id = a.id
    WHERE a.ledger_id = p_ledger_id
      AND e.release_status = 'held'
      AND e.entry_type = 'credit'
      AND e.hold_until IS NOT NULL
      AND e.hold_until <= NOW()
  LOOP
    BEGIN
      PERFORM request_fund_release(v_entry.id, NULL, 'auto');
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log but continue
      RAISE WARNING 'Failed to queue auto-release for entry %: %', v_entry.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_webhook(p_ledger_id uuid, p_event_type text, p_payload jsonb)
 RETURNS SETOF webhook_deliveries
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  INSERT INTO webhook_deliveries (endpoint_id, ledger_id, event_type, payload)
  SELECT 
    we.id,
    p_ledger_id,
    p_event_type,
    p_payload
  FROM webhook_endpoints we
  WHERE we.ledger_id = p_ledger_id
    AND we.is_active = true
    AND (we.events @> ARRAY[p_event_type] OR we.events @> ARRAY['*'])
  RETURNING *;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.receive_payment_atomic(p_ledger_id uuid, p_amount_cents bigint, p_reference_id text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text, p_description text DEFAULT 'Payment received'::text, p_currency text DEFAULT 'USD'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(status text, transaction_id uuid, amount_dollars numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cash_account_id UUID;
  v_ar_account_id UUID;
  v_transaction_id UUID;
  v_amount_dollars NUMERIC;
  v_existing_tx RECORD;
BEGIN
  -- Tenant isolation guard (defense-in-depth)
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Validate inputs
  IF p_ledger_id IS NULL THEN
    RAISE EXCEPTION 'ledger_id is required';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount must be a positive integer (cents)';
  END IF;

  -- Convert cents to dollars
  v_amount_dollars := p_amount_cents / 100.0;

  -- Resolve accounts (creates if missing)
  v_cash_account_id := get_or_create_ledger_account(p_ledger_id, 'cash', 'Cash / Bank');
  v_ar_account_id := get_or_create_ledger_account(p_ledger_id, 'accounts_receivable', 'Accounts Receivable');

  IF v_cash_account_id IS NULL OR v_ar_account_id IS NULL THEN
    RAISE EXCEPTION 'Failed to resolve required accounts';
  END IF;

  -- Insert transaction
  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'invoice_payment', p_reference_id,
    COALESCE(p_payment_method, 'payment'),
    p_description, v_amount_dollars, p_currency, 'completed',
    p_metadata
  )
  RETURNING id INTO v_transaction_id;

  -- Insert balanced entries (debit cash, credit AR) -- same transaction
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_transaction_id, v_cash_account_id, 'debit', v_amount_dollars),
    (v_transaction_id, v_ar_account_id, 'credit', v_amount_dollars);

  RETURN QUERY SELECT 'ok'::TEXT, v_transaction_id, v_amount_dollars;

EXCEPTION
  WHEN unique_violation THEN
    -- Idempotent: return existing transaction for duplicate reference_id
    SELECT t.id, t.amount INTO v_existing_tx
    FROM transactions t
    WHERE t.ledger_id = p_ledger_id
      AND t.reference_id = p_reference_id
    LIMIT 1;

    IF v_existing_tx.id IS NOT NULL THEN
      RETURN QUERY SELECT 'duplicate'::TEXT, v_existing_tx.id, v_existing_tx.amount;
    ELSE
      RAISE;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_api_usage(p_organization_id uuid, p_ledger_id uuid DEFAULT NULL::uuid, p_quantity integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO usage_records (
    organization_id,
    ledger_id,
    usage_type,
    quantity,
    period_start,
    period_end
  ) VALUES (
    p_organization_id,
    p_ledger_id,
    'api_calls',
    p_quantity,
    date_trunc('day', now()),
    date_trunc('day', now()) + interval '1 day'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_bill_payment_atomic(p_ledger_id uuid, p_amount_cents bigint, p_bill_transaction_id uuid DEFAULT NULL::uuid, p_vendor_name text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, message text, transaction_id uuid, amount_dollars numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cash_account_id UUID;
  v_ap_account_id UUID;
  v_transaction_id UUID;
  v_amount_dollars NUMERIC;
  v_description TEXT;
  v_original_bill RECORD;
BEGIN
  -- Validate amount
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN QUERY SELECT false, 'Payment amount must be positive'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;

  -- Get or create required accounts
  v_cash_account_id := get_or_create_ledger_account(p_ledger_id, 'cash', 'Cash / Bank');
  v_ap_account_id := get_or_create_ledger_account(p_ledger_id, 'accounts_payable', 'Accounts Payable');

  IF v_cash_account_id IS NULL OR v_ap_account_id IS NULL THEN
    RETURN QUERY SELECT false, 'Failed to create required accounts'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;

  v_amount_dollars := p_amount_cents / 100.0;

  -- Build description
  v_description := 'Bill payment';
  IF p_bill_transaction_id IS NOT NULL THEN
    SELECT description, merchant_name INTO v_original_bill
    FROM transactions
    WHERE id = p_bill_transaction_id AND ledger_id = p_ledger_id;

    IF FOUND AND v_original_bill.description IS NOT NULL THEN
      v_description := 'Payment: ' || v_original_bill.description;
    END IF;
  ELSIF p_vendor_name IS NOT NULL THEN
    v_description := 'Payment to ' || p_vendor_name;
  END IF;

  -- Create transaction
  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, merchant_name, metadata
  ) VALUES (
    p_ledger_id, 'bill_payment', p_reference_id, COALESCE(p_payment_method, 'payment'),
    v_description, v_amount_dollars, 'USD', 'completed', p_vendor_name,
    jsonb_build_object(
      'original_bill_id', p_bill_transaction_id,
      'payment_method', p_payment_method
    )
  )
  RETURNING id INTO v_transaction_id;

  -- Create double-entry: Debit AP (reduce liability), Credit Cash (reduce asset)
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_transaction_id, v_ap_account_id, 'debit', v_amount_dollars),
    (v_transaction_id, v_cash_account_id, 'credit', v_amount_dollars);

  RETURN QUERY SELECT true, ('Bill payment of $' || v_amount_dollars || ' recorded')::TEXT,
    v_transaction_id, v_amount_dollars;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, ('Error: ' || SQLERRM)::TEXT, NULL::UUID, NULL::NUMERIC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_invoice_payment_atomic(p_invoice_id uuid, p_ledger_id uuid, p_amount_cents bigint, p_payment_method text DEFAULT NULL::text, p_payment_date date DEFAULT NULL::date, p_reference_id text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, message text, transaction_id uuid, new_status text, amount_paid_total bigint, amount_due_remaining bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_cash_account_id UUID;
  v_ar_account_id UUID;
  v_transaction_id UUID;
  v_amount_dollars NUMERIC;
  v_new_amount_paid BIGINT;
  v_new_amount_due BIGINT;
  v_new_status TEXT;
  v_payment_date DATE;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN QUERY SELECT false, 'Invoice ID is required'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND ledger_id = p_ledger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invoice not found'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  IF v_invoice.status = 'void' THEN
    RETURN QUERY SELECT false, 'Cannot record payment on invoice with status: void'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  IF v_invoice.status = 'draft' THEN
    RETURN QUERY SELECT false, 'Cannot record payment on invoice with status: draft'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT false, 'Invoice is already fully paid'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN QUERY SELECT false, 'Payment amount must be positive'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  IF p_amount_cents > v_invoice.amount_due THEN
    RETURN QUERY SELECT false, ('Payment amount (' || p_amount_cents || ') exceeds amount due (' || v_invoice.amount_due || ')')::TEXT,
      NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  v_cash_account_id := get_or_create_ledger_account(p_ledger_id, 'cash', 'Cash / Bank');
  v_ar_account_id := get_or_create_ledger_account(p_ledger_id, 'accounts_receivable', 'Accounts Receivable');

  IF v_cash_account_id IS NULL OR v_ar_account_id IS NULL THEN
    RETURN QUERY SELECT false, 'Failed to create required accounts'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  v_amount_dollars := p_amount_cents / 100.0;
  v_payment_date := COALESCE(p_payment_date, CURRENT_DATE);
  v_new_amount_paid := v_invoice.amount_paid + p_amount_cents;
  v_new_amount_due := v_invoice.total_amount - v_new_amount_paid;
  v_new_status := CASE WHEN v_new_amount_due <= 0 THEN 'paid' ELSE 'partial' END;

  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'invoice_payment', p_reference_id, COALESCE(p_payment_method, 'payment'),
    'Payment received: Invoice ' || v_invoice.invoice_number, v_amount_dollars,
    v_invoice.currency, 'completed',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'original_invoice_id', v_invoice.transaction_id,  -- KEY FIX: Use transaction_id for AR matching
      'invoice_number', v_invoice.invoice_number,
      'customer_id', v_invoice.customer_id,
      'customer_name', v_invoice.customer_name,
      'payment_method', p_payment_method
    )
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_transaction_id, v_cash_account_id, 'debit', v_amount_dollars),
    (v_transaction_id, v_ar_account_id, 'credit', v_amount_dollars);

  INSERT INTO invoice_payments (
    invoice_id, transaction_id, amount, payment_date,
    payment_method, reference_id, notes
  ) VALUES (
    p_invoice_id, v_transaction_id, p_amount_cents, v_payment_date,
    p_payment_method, p_reference_id, p_notes
  );

  UPDATE invoices
  SET amount_paid = v_new_amount_paid,
      amount_due = v_new_amount_due,
      status = v_new_status,
      paid_at = CASE WHEN v_new_status = 'paid' THEN NOW() ELSE NULL END
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT true, ('Payment of $' || v_amount_dollars || ' recorded')::TEXT,
    v_transaction_id, v_new_status, v_new_amount_paid, v_new_amount_due;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, ('Error: ' || SQLERRM)::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_refund_atomic(p_ledger_id uuid, p_reference_id text, p_original_tx_id uuid, p_refund_amount bigint, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_result RECORD;
BEGIN
  SELECT *
    INTO v_result
    FROM public.record_refund_atomic_v2(
      p_ledger_id => p_ledger_id,
      p_reference_id => p_reference_id,
      p_original_tx_id => p_original_tx_id,
      p_refund_amount => p_refund_amount,
      p_reason => p_reason,
      p_refund_from => 'both',
      p_external_refund_id => NULL,
      p_metadata => '{}'::JSONB
    )
   LIMIT 1;

  IF v_result.out_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create refund transaction for reference %', p_reference_id;
  END IF;

  RETURN v_result.out_transaction_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_refund_atomic_v2(p_ledger_id uuid, p_reference_id text, p_original_tx_id uuid, p_refund_amount bigint DEFAULT NULL::bigint, p_reason text DEFAULT NULL::text, p_refund_from text DEFAULT 'both'::text, p_external_refund_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_entry_method text DEFAULT 'processor'::text)
 RETURNS TABLE(out_transaction_id uuid, out_refunded_cents bigint, out_from_creator_cents bigint, out_from_platform_cents bigint, out_is_full_refund boolean, out_status text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_original_tx             public.transactions%ROWTYPE;
  v_original_total_cents    BIGINT;
  v_already_refunded_cents  BIGINT;
  v_available_cents         BIGINT;
  v_refund_cents            BIGINT;
  v_refund_from             TEXT;
  v_creator_basis_cents     BIGINT := 0;
  v_platform_basis_cents    BIGINT := 0;
  v_from_creator_cents      BIGINT := 0;
  v_from_platform_cents     BIGINT := 0;
  v_creator_meta_text       TEXT;
  v_platform_meta_text      TEXT;
  v_cash_account_id         UUID;
  v_creator_account_id      UUID;
  v_platform_account_id     UUID;
  v_tx_id                   UUID;
  v_existing_tx_id          UUID;
  v_effective_metadata      JSONB;
  v_is_full_refund          BOOLEAN := FALSE;
  v_entry_method            TEXT;
BEGIN
  IF p_reference_id IS NULL OR LENGTH(TRIM(p_reference_id)) = 0 THEN
    RAISE EXCEPTION 'reference_id is required';
  END IF;

  -- Validate entry_method
  v_entry_method := COALESCE(NULLIF(TRIM(p_entry_method), ''), 'processor');
  IF v_entry_method NOT IN ('processor', 'manual', 'system', 'import') THEN
    v_entry_method := 'processor';
  END IF;

  SELECT t.*
    INTO v_original_tx
    FROM public.transactions t
   WHERE t.id = p_original_tx_id
     AND t.ledger_id = p_ledger_id
     AND t.transaction_type = 'sale'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original sale not found: %', p_original_tx_id;
  END IF;

  IF v_original_tx.status = 'reversed' THEN
    RAISE EXCEPTION 'Sale already reversed: %', p_original_tx_id;
  END IF;

  v_original_total_cents := ROUND(v_original_tx.amount * 100)::BIGINT;

  SELECT COALESCE(SUM(ROUND(t.amount * 100)::BIGINT), 0)
    INTO v_already_refunded_cents
    FROM public.transactions t
   WHERE t.ledger_id = p_ledger_id
     AND t.transaction_type = 'refund'
     AND t.reverses = p_original_tx_id
     AND t.status IN ('completed', 'reversed');

  v_available_cents := GREATEST(v_original_total_cents - v_already_refunded_cents, 0);
  IF v_available_cents <= 0 THEN
    RAISE EXCEPTION 'No refundable amount remaining for sale %', p_original_tx_id;
  END IF;

  IF p_refund_amount IS NULL THEN
    v_refund_cents := v_available_cents;
  ELSE
    IF p_refund_amount <= 0 THEN
      RAISE EXCEPTION 'Refund amount must be positive';
    END IF;
    v_refund_cents := p_refund_amount;
  END IF;

  IF v_refund_cents > v_available_cents THEN
    RAISE EXCEPTION 'Refund amount % exceeds remaining refundable amount %', v_refund_cents, v_available_cents;
  END IF;

  v_refund_from := LOWER(COALESCE(NULLIF(TRIM(p_refund_from), ''), 'both'));
  IF v_refund_from NOT IN ('both', 'platform_only', 'creator_only') THEN
    RAISE EXCEPTION 'Invalid refund_from value: %', v_refund_from;
  END IF;

  SELECT COALESCE(SUM(ROUND(e.amount * 100)::BIGINT), 0)
    INTO v_creator_basis_cents
    FROM public.entries e
    JOIN public.accounts a ON a.id = e.account_id
   WHERE e.transaction_id = p_original_tx_id
     AND e.entry_type = 'credit'
     AND a.account_type = 'creator_balance';

  SELECT COALESCE(SUM(ROUND(e.amount * 100)::BIGINT), 0)
    INTO v_platform_basis_cents
    FROM public.entries e
    JOIN public.accounts a ON a.id = e.account_id
   WHERE e.transaction_id = p_original_tx_id
     AND e.entry_type = 'credit'
     AND a.account_type = 'platform_revenue';

  v_creator_meta_text := v_original_tx.metadata->'amounts_cents'->>'creator';
  IF v_creator_basis_cents <= 0 AND v_creator_meta_text ~ '^[0-9]+$' THEN
    v_creator_basis_cents := v_creator_meta_text::BIGINT;
  END IF;

  v_platform_meta_text := v_original_tx.metadata->'amounts_cents'->>'platform';
  IF v_platform_basis_cents <= 0 AND v_platform_meta_text ~ '^[0-9]+$' THEN
    v_platform_basis_cents := v_platform_meta_text::BIGINT;
  END IF;

  IF v_refund_from = 'creator_only' THEN
    v_from_creator_cents := v_refund_cents;
    v_from_platform_cents := 0;
  ELSIF v_refund_from = 'platform_only' THEN
    v_from_creator_cents := 0;
    v_from_platform_cents := v_refund_cents;
  ELSE
    IF v_creator_basis_cents < 0 OR v_platform_basis_cents < 0 THEN
      RAISE EXCEPTION 'Invalid original split basis for sale %', p_original_tx_id;
    END IF;
    IF (v_creator_basis_cents + v_platform_basis_cents) <= 0 THEN
      RAISE EXCEPTION 'Unable to compute refund split basis for sale %', p_original_tx_id;
    END IF;

    v_from_creator_cents :=
      (v_refund_cents * v_creator_basis_cents) / (v_creator_basis_cents + v_platform_basis_cents);
    v_from_platform_cents := v_refund_cents - v_from_creator_cents;
  END IF;

  SELECT e.account_id
    INTO v_cash_account_id
    FROM public.entries e
    JOIN public.accounts a ON a.id = e.account_id
   WHERE e.transaction_id = p_original_tx_id
     AND e.entry_type = 'debit'
     AND a.account_type = 'cash'
   LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    SELECT a.id
      INTO v_cash_account_id
      FROM public.accounts a
     WHERE a.ledger_id = p_ledger_id
       AND a.account_type = 'cash'
     LIMIT 1;
  END IF;

  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Cash account not found for ledger %', p_ledger_id;
  END IF;

  IF v_from_creator_cents > 0 THEN
    SELECT e.account_id
      INTO v_creator_account_id
      FROM public.entries e
      JOIN public.accounts a ON a.id = e.account_id
     WHERE e.transaction_id = p_original_tx_id
       AND e.entry_type = 'credit'
       AND a.account_type = 'creator_balance'
     LIMIT 1;

    IF v_creator_account_id IS NULL THEN
      SELECT a.id
        INTO v_creator_account_id
        FROM public.accounts a
       WHERE a.ledger_id = p_ledger_id
         AND a.account_type = 'creator_balance'
         AND a.entity_id = COALESCE(v_original_tx.metadata->>'creator_id', '')
       LIMIT 1;
    END IF;

    IF v_creator_account_id IS NULL THEN
      RAISE EXCEPTION 'Creator account not found for sale %', p_original_tx_id;
    END IF;
  END IF;

  IF v_from_platform_cents > 0 THEN
    SELECT e.account_id
      INTO v_platform_account_id
      FROM public.entries e
      JOIN public.accounts a ON a.id = e.account_id
     WHERE e.transaction_id = p_original_tx_id
       AND e.entry_type = 'credit'
       AND a.account_type = 'platform_revenue'
     LIMIT 1;

    IF v_platform_account_id IS NULL THEN
      SELECT a.id
        INTO v_platform_account_id
        FROM public.accounts a
       WHERE a.ledger_id = p_ledger_id
         AND a.account_type = 'platform_revenue'
       LIMIT 1;
    END IF;

    IF v_platform_account_id IS NULL THEN
      RAISE EXCEPTION 'Platform revenue account not found for ledger %', p_ledger_id;
    END IF;
  END IF;

  v_effective_metadata :=
    COALESCE(p_metadata, '{}'::JSONB) ||
    jsonb_build_object(
      'original_sale_reference', v_original_tx.reference_id,
      'original_transaction_id', v_original_tx.id,
      'reason', p_reason,
      'refund_from', v_refund_from,
      'external_refund_id', p_external_refund_id,
      'breakdown', jsonb_build_object(
        'from_creator', v_from_creator_cents / 100.0,
        'from_platform', v_from_platform_cents / 100.0
      ),
      'breakdown_cents', jsonb_build_object(
        'from_creator', v_from_creator_cents,
        'from_platform', v_from_platform_cents
      )
    );

  INSERT INTO public.transactions (
    ledger_id,
    transaction_type,
    reference_id,
    reference_type,
    description,
    amount,
    currency,
    status,
    reverses,
    entry_method,
    metadata
  ) VALUES (
    p_ledger_id,
    'refund',
    p_reference_id,
    'refund',
    COALESCE(NULLIF(TRIM(p_reason), ''), 'Refund for ' || v_original_tx.reference_id),
    v_refund_cents / 100.0,
    COALESCE(v_original_tx.currency, 'USD'),
    'completed',
    p_original_tx_id,
    v_entry_method,
    v_effective_metadata
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'credit', v_refund_cents / 100.0);

  IF v_from_creator_cents > 0 THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_creator_account_id, 'debit', v_from_creator_cents / 100.0);
  END IF;

  IF v_from_platform_cents > 0 THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_platform_account_id, 'debit', v_from_platform_cents / 100.0);
  END IF;

  PERFORM 1
    FROM (
      SELECT
        COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) AS debits,
        COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) AS credits
      FROM public.entries e
      WHERE e.transaction_id = v_tx_id
    ) totals
   WHERE totals.debits <> totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  IF v_refund_cents = v_available_cents THEN
    UPDATE public.transactions
       SET reversed_by = v_tx_id,
           status = 'reversed'
     WHERE id = p_original_tx_id;
    v_is_full_refund := TRUE;
  END IF;

  RETURN QUERY
  SELECT
    v_tx_id,
    v_refund_cents,
    v_from_creator_cents,
    v_from_platform_cents,
    v_is_full_refund,
    'created'::TEXT;

EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id
      INTO v_existing_tx_id
      FROM public.transactions t
     WHERE t.ledger_id = p_ledger_id
       AND t.reference_id = p_reference_id
     LIMIT 1;

    IF v_existing_tx_id IS NULL THEN
      RAISE;
    END IF;

    RETURN QUERY
    SELECT
      v_existing_tx_id,
      0::BIGINT,
      0::BIGINT,
      0::BIGINT,
      FALSE,
      'duplicate'::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_sale_atomic(p_ledger_id uuid, p_reference_id text, p_creator_id text, p_gross_amount bigint, p_creator_amount bigint, p_platform_amount bigint, p_processing_fee bigint DEFAULT 0, p_product_id text DEFAULT NULL::text, p_product_name text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_entry_method text DEFAULT 'processor'::text)
 RETURNS TABLE(out_transaction_id uuid, out_creator_account_id uuid, out_creator_balance numeric)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_tx_id UUID;
  v_creator_account_id UUID;
  v_creator_is_active BOOLEAN;
  v_platform_account_id UUID;
  v_cash_account_id UUID;
  v_fee_account_id UUID;
  v_creator_balance NUMERIC(14,2);
  v_total_distributed BIGINT;
  v_entry_method TEXT;
BEGIN
  IF p_gross_amount <= 0 THEN
    RAISE EXCEPTION 'Gross amount must be positive: %', p_gross_amount;
  END IF;

  IF p_creator_amount < 0 OR p_platform_amount < 0 OR p_processing_fee < 0 THEN
    RAISE EXCEPTION 'Amounts cannot be negative';
  END IF;

  v_total_distributed := p_creator_amount + p_platform_amount + p_processing_fee;
  IF v_total_distributed != p_gross_amount THEN
    RAISE EXCEPTION 'Double-entry sum mismatch: creator(%) + platform(%) + fee(%) = % != gross(%)',
      p_creator_amount, p_platform_amount, p_processing_fee, v_total_distributed, p_gross_amount;
  END IF;

  -- Validate entry_method
  v_entry_method := COALESCE(NULLIF(TRIM(p_entry_method), ''), 'processor');
  IF v_entry_method NOT IN ('processor', 'manual', 'system', 'import') THEN
    v_entry_method := 'processor';
  END IF;

  SELECT id INTO v_platform_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'platform_revenue'
  LIMIT 1;

  SELECT id INTO v_cash_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'cash'
  LIMIT 1;

  IF v_platform_account_id IS NULL OR v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Platform accounts not initialized for ledger %', p_ledger_id;
  END IF;

  -- Look up creator account with FOR SHARE lock to prevent concurrent delete
  SELECT id, is_active INTO v_creator_account_id, v_creator_is_active
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id
  FOR SHARE;

  IF v_creator_account_id IS NOT NULL AND v_creator_is_active = false THEN
    RAISE EXCEPTION 'Creator % has been deleted', p_creator_id;
  END IF;

  IF v_creator_account_id IS NULL THEN
    INSERT INTO public.accounts (
      ledger_id, account_type, entity_id, entity_type, name
    ) VALUES (
      p_ledger_id, 'creator_balance', p_creator_id, 'creator', 'Creator ' || p_creator_id
    )
    RETURNING id INTO v_creator_account_id;
  END IF;

  IF p_processing_fee > 0 THEN
    SELECT id INTO v_fee_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id AND account_type = 'processing_fees'
    LIMIT 1;

    IF v_fee_account_id IS NULL THEN
      INSERT INTO public.accounts (
        ledger_id, account_type, entity_type, name
      ) VALUES (
        p_ledger_id, 'processing_fees', 'platform', 'Processing Fees'
      )
      RETURNING id INTO v_fee_account_id;
    END IF;
  END IF;

  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, entry_method, metadata
  ) VALUES (
    p_ledger_id, 'sale', p_reference_id, 'external',
    COALESCE(p_product_name, 'Sale for creator ' || p_creator_id),
    p_gross_amount / 100.0, 'USD', 'completed', v_entry_method,
    jsonb_build_object(
      'creator_id', p_creator_id,
      'product_id', p_product_id,
      'amounts_cents', jsonb_build_object(
        'gross', p_gross_amount,
        'creator', p_creator_amount,
        'platform', p_platform_amount,
        'fee', p_processing_fee
      )
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'debit', p_gross_amount / 100.0);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_creator_account_id, 'credit', p_creator_amount / 100.0);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_platform_account_id, 'credit', p_platform_amount / 100.0);

  IF p_processing_fee > 0 AND v_fee_account_id IS NOT NULL THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_fee_account_id, 'credit', p_processing_fee / 100.0);
  END IF;

  SELECT balance INTO v_creator_balance
  FROM public.accounts
  WHERE id = v_creator_account_id;

  PERFORM 1 FROM (
    SELECT
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) as debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) as credits
    FROM public.entries e
    WHERE e.transaction_id = v_tx_id
  ) AS totals
  WHERE totals.debits != totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  RETURN QUERY SELECT v_tx_id, v_creator_account_id, v_creator_balance;

EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id,
           (SELECT a.id FROM public.accounts a
            WHERE a.ledger_id = p_ledger_id
            AND a.account_type = 'creator_balance'
            AND a.entity_id = p_creator_id),
           (SELECT a.balance FROM public.accounts a
            WHERE a.ledger_id = p_ledger_id
            AND a.account_type = 'creator_balance'
            AND a.entity_id = p_creator_id)
    INTO v_tx_id, v_creator_account_id, v_creator_balance
    FROM public.transactions t
    WHERE t.ledger_id = p_ledger_id AND t.reference_id = p_reference_id;

    RETURN QUERY SELECT v_tx_id, v_creator_account_id, v_creator_balance;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_transaction_usage(p_organization_id uuid, p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO usage_records (
    organization_id,
    ledger_id,
    usage_type,
    quantity,
    period_start,
    period_end
  ) VALUES (
    p_organization_id,
    p_ledger_id,
    'transactions',
    1,
    date_trunc('day', now()),
    date_trunc('day', now()) + interval '1 day'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_dispute_lifecycle()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.dispute_lifecycle;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_payout_lifecycle()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.payout_lifecycle;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.register_connected_account(p_ledger_id uuid, p_entity_type text, p_entity_id text, p_stripe_account_id text, p_display_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id UUID;
BEGIN
  INSERT INTO connected_accounts (
    ledger_id,
    entity_type,
    entity_id,
    stripe_account_id,
    display_name,
    email,
    created_by
  ) VALUES (
    p_ledger_id,
    p_entity_type,
    p_entity_id,
    p_stripe_account_id,
    p_display_name,
    p_email,
    p_created_by
  )
  ON CONFLICT (ledger_id, entity_type, entity_id) 
  DO UPDATE SET
    stripe_account_id = EXCLUDED.stripe_account_id,
    display_name = COALESCE(EXCLUDED.display_name, connected_accounts.display_name),
    email = COALESCE(EXCLUDED.email, connected_accounts.email),
    updated_at = NOW()
  RETURNING id INTO v_account_id;
  
  RETURN v_account_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_held_funds(p_held_fund_id uuid, p_release_reason text DEFAULT 'Manual release'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_held RECORD;
  v_release_tx_id uuid;
  v_reserve_account_id uuid;
  v_creator_account_id uuid;
  v_rule_type text;
BEGIN
  SELECT * INTO v_held FROM held_funds WHERE id = p_held_fund_id;

  IF v_held IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Held fund not found');
  END IF;

  IF v_held.status = 'released' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already released');
  END IF;

  SELECT id INTO v_creator_account_id
  FROM accounts
  WHERE ledger_id = v_held.ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = v_held.creator_id;

  v_rule_type := CASE
    WHEN v_held.withholding_rule_id IS NULL THEN 'dispute'
    ELSE (SELECT rule_type FROM withholding_rules WHERE id = v_held.withholding_rule_id)
  END;

  SELECT get_or_create_reserve_account(v_held.ledger_id, v_rule_type)
  INTO v_reserve_account_id;

  INSERT INTO transactions (
    ledger_id,
    transaction_type,
    description,
    amount,
    status,
    metadata
  ) VALUES (
    v_held.ledger_id,
    'transfer',
    'Release held funds: ' || p_release_reason,
    v_held.held_amount - v_held.released_amount,
    'completed',
    jsonb_build_object(
      'held_fund_id', p_held_fund_id,
      'creator_id', v_held.creator_id,
      'release_reason', p_release_reason
    )
  )
  RETURNING id INTO v_release_tx_id;

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_release_tx_id, v_reserve_account_id, 'debit', v_held.held_amount - v_held.released_amount);

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_release_tx_id, v_creator_account_id, 'credit', v_held.held_amount - v_held.released_amount);

  UPDATE held_funds
  SET status = 'released',
      released_amount = held_amount,
      released_at = NOW(),
      release_transaction_id = v_release_tx_id,
      release_reason = p_release_reason,
      updated_at = NOW()
  WHERE id = p_held_fund_id;

  RETURN jsonb_build_object(
    'success', true,
    'released_amount', v_held.held_amount - v_held.released_amount,
    'release_transaction_id', v_release_tx_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.request_fund_release(p_entry_id uuid, p_requested_by uuid DEFAULT NULL::uuid, p_release_type text DEFAULT 'manual'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry RECORD;
  v_account RECORD;
  v_connected_account RECORD;
  v_release_id UUID;
  v_idempotency_key TEXT;
BEGIN
  -- Lock and get entry
  SELECT e.*, a.ledger_id, a.entity_type, a.entity_id, a.name
  INTO v_entry
  FROM entries e
  JOIN accounts a ON e.account_id = a.id
  WHERE e.id = p_entry_id
    AND e.release_status = 'held'
    AND e.entry_type = 'credit'
  FOR UPDATE OF e;
  
  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'Entry % not found, not held, or not a credit', p_entry_id;
  END IF;
  
  -- Get connected account
  SELECT * INTO v_connected_account
  FROM connected_accounts
  WHERE ledger_id = v_entry.ledger_id
    AND entity_type = v_entry.entity_type
    AND entity_id = v_entry.entity_id
    AND is_active = true;
  
  IF v_connected_account IS NULL THEN
    RAISE EXCEPTION 'No active connected account for % %', v_entry.entity_type, v_entry.entity_id;
  END IF;
  
  IF NOT v_connected_account.can_receive_transfers THEN
    RAISE EXCEPTION 'Connected account % cannot receive transfers', v_connected_account.stripe_account_id;
  END IF;
  
  -- Generate idempotency key
  v_idempotency_key := 'release_' || p_entry_id::TEXT || '_' || extract(epoch from now())::BIGINT::TEXT;
  
  -- Create release request
  INSERT INTO escrow_releases (
    ledger_id,
    entry_id,
    transaction_id,
    connected_account_id,
    recipient_stripe_account,
    recipient_entity_type,
    recipient_entity_id,
    amount,
    release_type,
    requested_by,
    idempotency_key
  ) VALUES (
    v_entry.ledger_id,
    p_entry_id,
    v_entry.transaction_id,
    v_connected_account.id,
    v_connected_account.stripe_account_id,
    v_entry.entity_type,
    v_entry.entity_id,
    v_entry.amount,
    p_release_type,
    p_requested_by,
    v_idempotency_key
  )
  RETURNING id INTO v_release_id;
  
  -- Mark entry as pending release
  UPDATE entries
  SET release_status = 'pending_release'
  WHERE id = p_entry_id;
  
  RETURN v_release_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.request_release(p_entry_id uuid, p_requested_by uuid DEFAULT NULL::uuid, p_release_type text DEFAULT 'manual'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry RECORD;
  v_transaction RECORD;
  v_recipient_account RECORD;
  v_release_id UUID;
  v_idempotency_key TEXT;
BEGIN
  -- Get entry details
  SELECT e.*, a.entity_id, a.entity_type, a.ledger_id
  INTO v_entry
  FROM entries e
  JOIN accounts a ON e.account_id = a.id
  WHERE e.id = p_entry_id
    AND e.release_status = 'held'
    AND e.entry_type = 'credit';  -- Only release credits (money owed to someone)
  
  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'Entry not found, not held, or not a credit: %', p_entry_id;
  END IF;
  
  -- Get transaction
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = v_entry.transaction_id;
  
  -- Find recipient's Stripe account
  SELECT * INTO v_recipient_account
  FROM stripe_connected_accounts
  WHERE ledger_id = v_entry.ledger_id
    AND entity_id = v_entry.entity_id
    AND status = 'active';
  
  -- Generate idempotency key
  v_idempotency_key := 'release_' || p_entry_id::TEXT || '_' || extract(epoch from now())::TEXT;
  
  -- Create release request
  INSERT INTO release_queue (
    ledger_id,
    entry_id,
    transaction_id,
    recipient_type,
    recipient_id,
    recipient_stripe_account_id,
    amount,
    currency,
    release_type,
    requested_by,
    idempotency_key
  ) VALUES (
    v_entry.ledger_id,
    p_entry_id,
    v_entry.transaction_id,
    v_entry.entity_type,
    v_entry.entity_id,
    v_recipient_account.stripe_account_id,
    v_entry.amount,
    'USD',
    p_release_type,
    p_requested_by,
    v_idempotency_key
  )
  RETURNING id INTO v_release_id;
  
  -- Mark entry as pending release
  UPDATE entries
  SET 
    release_status = 'pending_release',
    release_idempotency_key = v_idempotency_key
  WHERE id = p_entry_id;
  
  RETURN v_release_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.retry_stripe_fee_fetch(p_stripe_transaction_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_stripe_id TEXT;
BEGIN
  -- This function marks a transaction for re-processing
  -- The actual Stripe API call should be done in the Edge Function
  
  SELECT stripe_id INTO v_stripe_id
  FROM public.stripe_transactions
  WHERE id = p_stripe_transaction_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Transaction not found'::TEXT;
    RETURN;
  END IF;
  
  -- Mark for reprocessing by setting a flag
  UPDATE public.stripe_transactions
  SET raw_data = raw_data || '{"needs_fee_refresh": true}'::jsonb
  WHERE id = p_stripe_transaction_id;
  
  RETURN QUERY SELECT true, ('Marked for fee refresh: ' || v_stripe_id)::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rotate_webhook_secret(p_endpoint_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_new_secret TEXT;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.webhook_endpoints we ON we.ledger_id = l.id
      WHERE we.id = p_endpoint_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  v_new_secret := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.webhook_endpoints
  SET previous_secret = secret,
      secret = v_new_secret,
      rotated_at = NOW()
  WHERE id = p_endpoint_id;

  RETURN v_new_secret;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_all_health_checks(p_check_type text DEFAULT 'daily'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ledger RECORD;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  FOR v_ledger IN
    SELECT id, business_name
    FROM public.ledgers
    WHERE status = 'active'
  LOOP
    v_result := public.run_ledger_health_check(v_ledger.id, p_check_type);
    v_results := v_results || jsonb_build_object(
      'ledger_id', v_ledger.id,
      'business_name', v_ledger.business_name,
      'result', v_result
    );
  END LOOP;

  RETURN jsonb_build_object(
    'run_at', now(),
    'check_type', p_check_type,
    'ledger_count', jsonb_array_length(v_results),
    'results', v_results
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_audit_chain_verification()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_chain_result jsonb;
  v_gaps RECORD;
  v_gap_count integer := 0;
  v_gap_list jsonb := '[]'::jsonb;
  v_overall_status text := 'intact';
  v_result jsonb;
  v_max_seq bigint;
  v_start_seq bigint;
  v_verify_limit integer := 10000;
BEGIN
  -- Determine sliding window: latest 10,000 records
  SELECT COALESCE(MAX(seq_num), 0) INTO v_max_seq
  FROM public.audit_log
  WHERE seq_num IS NOT NULL;

  -- If fewer than v_verify_limit records, start from 1; otherwise slide
  v_start_seq := GREATEST(1, v_max_seq - v_verify_limit + 1);

  -- Step 1: Verify hash chain integrity (sliding window)
  v_chain_result := verify_audit_chain(v_start_seq, v_verify_limit);

  -- Step 2: Detect sequence gaps (full range — gaps are cheap to detect)
  FOR v_gaps IN
    SELECT gap_start, gap_end, gap_size
    FROM detect_audit_gaps(1, NULL)
  LOOP
    v_gap_count := v_gap_count + 1;
    v_gap_list := v_gap_list || jsonb_build_object(
      'gap_start', v_gaps.gap_start,
      'gap_end', v_gaps.gap_end,
      'gap_size', v_gaps.gap_size
    );
  END LOOP;

  -- Step 3: Determine overall status
  IF v_chain_result->>'status' != 'intact' OR v_gap_count > 0 THEN
    v_overall_status := 'broken';
  END IF;

  -- Step 4: Build result summary
  v_result := jsonb_build_object(
    'chain_status', v_chain_result->>'status',
    'records_verified', (v_chain_result->>'records_verified')::integer,
    'verified_range_start', v_start_seq,
    'verified_range_end', v_max_seq,
    'broken_at_seq', v_chain_result->'broken_at_seq',
    'gap_count', v_gap_count,
    'gaps', v_gap_list,
    'overall_status', v_overall_status,
    'verified_at', now()
  );

  -- Step 5: Always log the verification run
  INSERT INTO public.audit_log (action, entity_type, actor_type, actor_id, request_body)
  VALUES (
    'audit_chain_verification',
    'system',
    'system',
    'cron',
    v_result
  );

  -- Step 6: If broken, write a CRITICAL integrity alert
  IF v_overall_status = 'broken' THEN
    INSERT INTO public.audit_log (action, entity_type, actor_type, actor_id, request_body)
    VALUES (
      'audit_chain_integrity_alert',
      'system',
      'system',
      'cron',
      jsonb_build_object(
        'severity', 'CRITICAL',
        'chain_status', v_chain_result->>'status',
        'broken_at_seq', v_chain_result->'broken_at_seq',
        'chain_reason', v_chain_result->>'reason',
        'gap_count', v_gap_count,
        'gaps', v_gap_list,
        'message', 'Audit chain integrity failure detected — investigate immediately'
      )
    );
  END IF;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_ledger_health_check(p_ledger_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN public.run_ledger_health_check(p_ledger_id, 'manual'::TEXT);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_ledger_health_check(p_ledger_id uuid, p_check_type text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_check jsonb;
  v_passed integer := 0;
  v_warnings integer := 0;
  v_failed integer := 0;
  v_status text;
  v_result_id uuid;
BEGIN
  -- Auth guard (from 20260310_rpc_tenant_isolation)
  -- Allow service_role, postgres, and supabase_admin (cron runs as postgres)
  IF auth.role() <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- =========================================================================
  -- CHECK 1: Ledger Balance (Debits = Credits)
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'ledger_balance',
    'description', 'Total debits equal total credits',
    'status', CASE
      WHEN ABS(COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) -
               COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)) < 0.01
      THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object(
      'total_debits', COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0),
      'total_credits', COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0),
      'difference', ABS(COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) -
                        COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0))
    )
  ) INTO v_check
  FROM public.entries e
  JOIN public.transactions t ON e.transaction_id = t.id
  WHERE t.ledger_id = p_ledger_id
    AND t.status NOT IN ('voided', 'reversed');

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 2: Orphaned Entries (entries without valid transaction)
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'orphaned_entries',
    'description', 'No entries without valid transactions',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object(
      'orphaned_count', COUNT(*),
      'sample_ids', COALESCE(jsonb_agg(e.id) FILTER (WHERE e.id IS NOT NULL), '[]'::jsonb)
    )
  ) INTO v_check
  FROM public.entries e
  LEFT JOIN public.transactions t ON e.transaction_id = t.id
  WHERE t.id IS NULL
    OR t.ledger_id != p_ledger_id;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 3: Unbalanced Transactions (each txn debits = credits)
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'transaction_balance',
    'description', 'Each transaction balances (debits = credits)',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object(
      'unbalanced_count', COUNT(*),
      'unbalanced_ids', COALESCE(jsonb_agg(transaction_id), '[]'::jsonb)
    )
  ) INTO v_check
  FROM (
    SELECT
      e.transaction_id,
      ABS(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) -
          SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)) as diff
    FROM public.entries e
    JOIN public.transactions t ON e.transaction_id = t.id
    WHERE t.ledger_id = p_ledger_id
      AND t.status NOT IN ('voided', 'reversed')
    GROUP BY e.transaction_id
    HAVING ABS(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) -
               SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)) > 0.01
  ) unbalanced;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 4: Cash Account vs processor Balance
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'processor_balance_sync',
    'description', 'Cash account approximates processor available balance',
    'status', CASE
      WHEN bs.id IS NULL THEN 'skipped'
      WHEN ABS(cash_balance - processor_available) < 100 THEN 'passed'
      WHEN ABS(cash_balance - processor_available) < 1000 THEN 'warning'
      ELSE 'failed'
    END,
    'details', jsonb_build_object(
      'cash_account_balance', cash_balance,
      'processor_available_balance', processor_available,
      'difference', ABS(cash_balance - COALESCE(processor_available, 0)),
      'last_processor_sync', bs.snapshot_at
    )
  ) INTO v_check
  FROM (
    SELECT COALESCE(SUM(
      CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
    ), 0) as cash_balance
    FROM public.entries e
    JOIN public.transactions t ON e.transaction_id = t.id
    JOIN public.accounts a ON e.account_id = a.id
    WHERE t.ledger_id = p_ledger_id
      AND t.status NOT IN ('voided', 'reversed')
      AND a.account_type = 'cash'
  ) cb
  LEFT JOIN LATERAL (
    SELECT
      id,
      snapshot_at,
      (available->0->>'amount')::numeric / 100 as processor_available
    FROM public.processor_balance_snapshots
    WHERE ledger_id = p_ledger_id
    ORDER BY snapshot_at DESC
    LIMIT 1
  ) bs ON true;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' OR v_check->>'status' = 'skipped' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 5: Unmatched Bank Transactions (stale review queue)
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'bank_reconciliation_backlog',
    'description', 'Bank transactions awaiting review',
    'status', CASE
      WHEN COUNT(*) = 0 THEN 'passed'
      WHEN COUNT(*) < 10 THEN 'warning'
      ELSE 'failed'
    END,
    'details', jsonb_build_object(
      'unmatched_count', COUNT(*),
      'oldest_unmatched', MIN(created_at),
      'total_unmatched_amount', COALESCE(SUM(ABS(amount)), 0)
    )
  ) INTO v_check
  FROM public.bank_aggregator_transactions
  WHERE ledger_id = p_ledger_id
    AND match_status = 'unmatched'
    AND created_at < now() - interval '7 days';

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 6: Unmatched processor Transactions
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'processor_reconciliation_backlog',
    'description', 'processor transactions awaiting review',
    'status', CASE
      WHEN COUNT(*) = 0 THEN 'passed'
      WHEN COUNT(*) < 5 THEN 'warning'
      ELSE 'failed'
    END,
    'details', jsonb_build_object(
      'unmatched_count', COUNT(*),
      'oldest_unmatched', MIN(created_at),
      'total_unmatched_amount', COALESCE(SUM(ABS(amount)), 0)
    )
  ) INTO v_check
  FROM public.processor_transactions
  WHERE ledger_id = p_ledger_id
    AND match_status = 'unmatched'
    AND created_at < now() - interval '3 days';

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 7: Negative Account Balances (except liabilities)
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'negative_balances',
    'description', 'No unexpected negative balances',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'warning' END,
    'details', jsonb_build_object(
      'accounts_with_negative', COUNT(*),
      'accounts', COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', account_id,
        'account_type', account_type,
        'balance', balance
      )), '[]'::jsonb)
    )
  ) INTO v_check
  FROM (
    SELECT
      a.id as account_id,
      a.account_type,
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END) as balance
    FROM public.accounts a
    LEFT JOIN public.entries e ON e.account_id = a.id
    LEFT JOIN public.transactions t ON e.transaction_id = t.id AND t.status NOT IN ('voided', 'reversed')
    WHERE a.ledger_id = p_ledger_id
      AND a.account_type NOT IN ('creator_balance', 'payable', 'liability')
    GROUP BY a.id, a.account_type
    HAVING SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END) < -0.01
  ) neg;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 8: Failed Webhook Deliveries
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'webhook_delivery_health',
    'description', 'Webhook deliveries succeeding',
    'status', CASE
      WHEN failed_count = 0 THEN 'passed'
      WHEN failed_count < 5 THEN 'warning'
      ELSE 'failed'
    END,
    'details', jsonb_build_object(
      'failed_last_24h', failed_count,
      'success_rate', CASE WHEN total_count > 0
        THEN ROUND((1 - failed_count::numeric / total_count) * 100, 1)
        ELSE 100 END
    )
  ) INTO v_check
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
      COUNT(*) as total_count
    FROM public.webhook_deliveries
    WHERE ledger_id = p_ledger_id
      AND created_at > now() - interval '24 hours'
  ) wd;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 9: Pending Payouts Past Due
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'pending_payouts',
    'description', 'No payouts stuck in pending',
    'status', CASE
      WHEN COUNT(*) = 0 THEN 'passed'
      WHEN COUNT(*) < 3 THEN 'warning'
      ELSE 'failed'
    END,
    'details', jsonb_build_object(
      'stuck_count', COUNT(*),
      'oldest_pending', MIN(created_at),
      'total_pending_amount', COALESCE(SUM(amount), 0)
    )
  ) INTO v_check
  FROM public.payouts
  WHERE ledger_id = p_ledger_id
    AND status = 'pending'
    AND created_at < now() - interval '7 days';

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 10: Creator Balance Integrity
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'creator_balance_integrity',
    'description', 'Creator balances match ledger entries',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object(
      'mismatched_creators', COUNT(*),
      'sample_mismatches', COALESCE(jsonb_agg(jsonb_build_object(
        'creator_id', entity_id,
        'ledger_balance', ledger_balance,
        'expected', 'check entries manually'
      )) FILTER (WHERE entity_id IS NOT NULL), '[]'::jsonb)
    )
  ) INTO v_check
  FROM (
    SELECT
      a.entity_id,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END) as ledger_balance
    FROM public.accounts a
    LEFT JOIN public.entries e ON e.account_id = a.id
    LEFT JOIN public.transactions t ON e.transaction_id = t.id AND t.status NOT IN ('voided', 'reversed')
    WHERE a.ledger_id = p_ledger_id
      AND a.account_type = 'creator_balance'
    GROUP BY a.entity_id
    HAVING SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END) < -0.01
  ) cb;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- DETERMINE OVERALL STATUS
  -- =========================================================================
  IF v_failed > 0 THEN
    v_status := 'critical';
  ELSIF v_warnings > 0 THEN
    v_status := 'warning';
  ELSE
    v_status := 'healthy';
  END IF;

  -- =========================================================================
  -- STORE RESULTS
  -- =========================================================================
  INSERT INTO public.health_check_results (
    ledger_id,
    check_type,
    status,
    checks,
    total_checks,
    passed_checks,
    warning_checks,
    failed_checks
  ) VALUES (
    p_ledger_id,
    p_check_type,
    v_status,
    v_checks,
    v_passed + v_warnings + v_failed,
    v_passed,
    v_warnings,
    v_failed
  ) RETURNING id INTO v_result_id;

  RETURN jsonb_build_object(
    'result_id', v_result_id,
    'status', v_status,
    'summary', jsonb_build_object(
      'total', v_passed + v_warnings + v_failed,
      'passed', v_passed,
      'warnings', v_warnings,
      'failed', v_failed
    ),
    'checks', v_checks
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_money_invariants(p_ledger_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_balance_check JSONB;
  v_dup_check JSONB;
  v_de_check JSONB;
  v_overall TEXT := 'pass';
BEGIN
  v_balance_check := public.check_balance_invariants(p_ledger_id);
  v_dup_check := public.check_no_duplicate_references(p_ledger_id);
  v_de_check := public.check_double_entry_balance(p_ledger_id);

  IF v_balance_check->>'status' = 'fail'
     OR v_dup_check->>'status' = 'fail'
     OR v_de_check->>'status' = 'fail' THEN
    v_overall := 'fail';
  END IF;

  RETURN jsonb_build_object(
    'status', v_overall,
    'run_at', NOW(),
    'ledger_id', p_ledger_id,
    'checks', jsonb_build_array(v_balance_check, v_dup_check, v_de_check),
    'race_condition_stats', (
      SELECT jsonb_build_object(
        'total_events', COUNT(*),
        'last_24h', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),
        'last_7d', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'),
        'by_type', (
          SELECT jsonb_object_agg(event_type, cnt)
          FROM (
            SELECT event_type, COUNT(*) AS cnt
            FROM public.race_condition_events
            WHERE (p_ledger_id IS NULL OR ledger_id = p_ledger_id)
            GROUP BY event_type
          ) sub
        )
      )
      FROM public.race_condition_events
      WHERE (p_ledger_id IS NULL OR ledger_id = p_ledger_id)
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.safe_void_invoice(p_invoice_id uuid, p_ledger_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, message text, reversal_transaction_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_reversal_tx_id UUID;
  v_amount_to_reverse NUMERIC;
BEGIN
  -- Lock the invoice row to prevent concurrent modifications
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND ledger_id = p_ledger_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invoice not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Check if already void
  IF v_invoice.status = 'void' THEN
    RETURN QUERY SELECT false, 'Invoice is already void'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Cannot void fully paid invoices
  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT false, 'Cannot void a fully paid invoice. Issue a credit memo instead.'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Get AR and Revenue accounts
  SELECT id INTO v_ar_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'accounts_receivable' AND entity_id IS NULL
  LIMIT 1;
  
  SELECT id INTO v_revenue_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'revenue' AND entity_id IS NULL
  LIMIT 1;
  
  -- Calculate amount to reverse (unpaid portion)
  v_amount_to_reverse := v_invoice.amount_due / 100.0;
  
  -- Create reversal transaction if there's an amount to reverse
  IF v_amount_to_reverse > 0 AND v_ar_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
    INSERT INTO transactions (
      ledger_id, transaction_type, reference_id, reference_type,
      description, amount, currency, status, metadata
    ) VALUES (
      p_ledger_id, 'invoice_void', 'VOID-' || v_invoice.invoice_number, 'void',
      'Void: Invoice ' || v_invoice.invoice_number, v_amount_to_reverse,
      v_invoice.currency, 'completed',
      jsonb_build_object(
        'original_invoice_id', v_invoice.id,
        'original_transaction_id', v_invoice.transaction_id,
        'reason', COALESCE(p_reason, 'Voided by user')
      )
    )
    RETURNING id INTO v_reversal_tx_id;
    
    -- Create reversal entries: Credit AR, Debit Revenue
    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES 
      (v_reversal_tx_id, v_ar_account_id, 'credit', v_amount_to_reverse),
      (v_reversal_tx_id, v_revenue_account_id, 'debit', v_amount_to_reverse);
  END IF;
  
  -- Update invoice status atomically
  UPDATE invoices
  SET status = 'void',
      voided_at = NOW(),
      void_reason = p_reason
  WHERE id = p_invoice_id;
  
  RETURN QUERY SELECT true, 'Invoice voided successfully'::TEXT, v_reversal_tx_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.send_invoice_atomic(p_invoice_id uuid, p_ledger_id uuid)
 RETURNS TABLE(success boolean, message text, transaction_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_transaction_id UUID;
  v_amount_dollars NUMERIC;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN QUERY SELECT false, 'Invoice ID is required'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND ledger_id = p_ledger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invoice not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF v_invoice.status != 'draft' THEN
    RETURN QUERY SELECT false, ('Invoice cannot be sent from status: ' || v_invoice.status)::TEXT, NULL::UUID;
    RETURN;
  END IF;

  v_ar_account_id := get_or_create_ledger_account(p_ledger_id, 'accounts_receivable', 'Accounts Receivable');
  v_revenue_account_id := get_or_create_ledger_account(p_ledger_id, 'revenue', 'Revenue');

  IF v_ar_account_id IS NULL OR v_revenue_account_id IS NULL THEN
    RETURN QUERY SELECT false, 'Failed to create required accounts'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  v_amount_dollars := v_invoice.total_amount / 100.0;

  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'invoice', v_invoice.invoice_number, 'invoice',
    'Invoice ' || v_invoice.invoice_number || ' - ' || v_invoice.customer_name,
    v_amount_dollars, v_invoice.currency, 'completed',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'customer_id', v_invoice.customer_id,
      'customer_name', v_invoice.customer_name
    )
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_transaction_id, v_ar_account_id, 'debit', v_amount_dollars),
    (v_transaction_id, v_revenue_account_id, 'credit', v_amount_dollars);

  UPDATE invoices
  SET status = 'sent',
      sent_at = NOW(),
      transaction_id = v_transaction_id
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT true, 'Invoice sent and AR entry created'::TEXT, v_transaction_id;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, ('Error: ' || SQLERRM)::TEXT, NULL::UUID;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_creator_split(p_ledger_id uuid, p_creator_id text, p_creator_percent numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update the creator's account metadata
  UPDATE accounts
  SET 
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{custom_split_percent}',
      to_jsonb(p_creator_percent)
    ),
    updated_at = NOW()
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id;
  
  RETURN FOUND;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_creator_tier(p_ledger_id uuid, p_creator_id text, p_tier_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Verify tier exists
  IF NOT EXISTS (
    SELECT 1 FROM creator_tiers 
    WHERE ledger_id = p_ledger_id AND tier_name = p_tier_name
  ) THEN
    RAISE EXCEPTION 'Tier % does not exist', p_tier_name;
  END IF;

  -- Update the creator's account metadata
  UPDATE accounts
  SET 
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{tier}',
      to_jsonb(p_tier_name)
    ),
    updated_at = NOW()
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id;
  
  RETURN FOUND;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_default_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only set if settings is empty or default
  IF NEW.settings IS NULL OR NEW.settings = '{}'::jsonb OR NEW.settings = '{
    "default_platform_fee_percent": 20,
    "tax_withholding_percent": 0,
    "min_payout_amount": 10.00,
    "payout_schedule": "manual"
  }'::jsonb THEN
    NEW.settings := get_default_settings(NEW.ledger_mode);
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.should_trigger_breach_alert(p_ledger_id uuid, p_coverage_ratio numeric, p_shortfall numeric)
 RETURNS TABLE(config_id uuid, channel text, config jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ac.id,
    ac.channel,
    ac.config
  FROM alert_configurations ac
  WHERE ac.ledger_id = p_ledger_id
    AND ac.alert_type = 'breach_risk'
    AND ac.is_active = true
    AND (
      -- Check coverage ratio threshold (default 0.5 = 50%)
      p_coverage_ratio < COALESCE((ac.thresholds->>'coverage_ratio_below')::numeric, 0.5)
      OR
      -- Check shortfall threshold (default 0 = any shortfall)
      p_shortfall > COALESCE((ac.thresholds->>'shortfall_above')::numeric, 0)
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.store_bank_aggregator_token_in_vault(p_connection_id uuid, p_access_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Auth guard (defense-in-depth: already restricted to service_role via GRANT)
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.bank_aggregator_connections bac ON bac.ledger_id = l.id
      WHERE bac.id = p_connection_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Delete any existing secret for this connection (rotation support)
  DELETE FROM vault.secrets
  WHERE name = 'bank_aggregator_token_' || p_connection_id::TEXT;

  -- Store in vault
  BEGIN
    INSERT INTO vault.secrets (secret, name, description)
    VALUES (
      p_access_token,
      'bank_aggregator_token_' || p_connection_id::TEXT,
      'Bank aggregator access token for connection ' || p_connection_id::TEXT
    )
    RETURNING id INTO v_secret_id;

    -- Atomically update connection record
    UPDATE public.bank_aggregator_connections
    SET access_token_vault_id = v_secret_id,
        access_token = '[ENCRYPTED]'
    WHERE id = p_connection_id;

    RETURN v_secret_id;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Vault access not available - token not stored securely';
    RETURN NULL;
  END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.store_processor_secret_key_in_vault(p_ledger_id uuid, p_secret_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vault_id UUID;
  v_secret_name TEXT;
  v_existing_vault_id UUID;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  v_secret_name := 'processor_sk_' || p_ledger_id::TEXT;

  -- Check if there's an existing vault entry
  SELECT processor_secret_key_vault_id INTO v_existing_vault_id
  FROM ledgers
  WHERE id = p_ledger_id;

  -- If exists, update the vault entry
  IF v_existing_vault_id IS NOT NULL THEN
    UPDATE vault.secrets
    SET secret = p_secret_key,
        updated_at = NOW()
    WHERE id = v_existing_vault_id;
    RETURN v_existing_vault_id;
  END IF;

  -- Insert new vault entry
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (
    v_secret_name,
    p_secret_key,
    'processor secret key for ledger ' || p_ledger_id::TEXT
  )
  RETURNING id INTO v_vault_id;

  -- Update ledger with vault reference and remove from settings
  UPDATE ledgers
  SET processor_secret_key_vault_id = v_vault_id,
      settings = settings - 'processor_secret_key'
  WHERE id = p_ledger_id;

  RETURN v_vault_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.store_processor_webhook_secret_in_vault(p_endpoint_id uuid, p_secret text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Auth guard (defense-in-depth: already restricted to service_role via GRANT)
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.webhook_endpoints we ON we.ledger_id = l.id
      WHERE we.id = p_endpoint_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Try to store in vault, return NULL if permissions not available
  BEGIN
    INSERT INTO vault.secrets (secret, name, description)
    VALUES (
      p_secret,
      'processor_webhook_' || p_endpoint_id::TEXT,
      'processor webhook secret for endpoint ' || p_endpoint_id::TEXT
    )
    RETURNING id INTO v_secret_id;

    RETURN v_secret_id;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Vault access not available - secret not stored securely';
    RETURN NULL;
  END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.store_stripe_secret_key_in_vault(p_ledger_id uuid, p_secret_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vault_id UUID;
  v_secret_name TEXT;
  v_existing_vault_id UUID;
BEGIN
  v_secret_name := 'stripe_sk_' || p_ledger_id::TEXT;
  
  -- Check if there's an existing vault entry
  SELECT stripe_secret_key_vault_id INTO v_existing_vault_id
  FROM ledgers
  WHERE id = p_ledger_id;
  
  -- If exists, update the vault entry
  IF v_existing_vault_id IS NOT NULL THEN
    UPDATE vault.secrets
    SET secret = p_secret_key,
        updated_at = NOW()
    WHERE id = v_existing_vault_id;
    RETURN v_existing_vault_id;
  END IF;
  
  -- Insert new vault entry
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (
    v_secret_name,
    p_secret_key,
    'Stripe secret key for ledger ' || p_ledger_id::TEXT
  )
  RETURNING id INTO v_vault_id;
  
  -- Update ledger with vault reference and remove from settings
  UPDATE ledgers
  SET stripe_secret_key_vault_id = v_vault_id,
      settings = settings - 'stripe_secret_key'  -- Remove from JSON
  WHERE id = p_ledger_id;
  
  RETURN v_vault_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_connected_account_status(p_stripe_account_id text, p_charges_enabled boolean, p_payouts_enabled boolean, p_details_submitted boolean, p_requirements_current jsonb DEFAULT '[]'::jsonb, p_requirements_past_due jsonb DEFAULT '[]'::jsonb, p_requirements_pending jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_status TEXT;
BEGIN
  -- Determine status based on Stripe fields
  IF p_charges_enabled AND p_payouts_enabled THEN
    v_new_status := 'enabled';
  ELSIF p_details_submitted THEN
    v_new_status := 'restricted';
  ELSE
    v_new_status := 'pending';
  END IF;
  
  UPDATE connected_accounts
  SET 
    stripe_status = v_new_status,
    charges_enabled = p_charges_enabled,
    payouts_enabled = p_payouts_enabled,
    details_submitted = p_details_submitted,
    requirements_current = p_requirements_current,
    requirements_past_due = p_requirements_past_due,
    requirements_pending = p_requirements_pending,
    -- Enable transfers/payouts only when fully verified
    can_receive_transfers = (v_new_status = 'enabled'),
    updated_at = NOW()
  WHERE stripe_account_id = p_stripe_account_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_subscription_from_stripe(p_organization_id uuid, p_stripe_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_subscription_id uuid;
BEGIN
  INSERT INTO subscriptions (
    organization_id,
    stripe_subscription_id,
    stripe_customer_id,
    stripe_price_id,
    plan,
    status,
    current_period_start,
    current_period_end,
    cancel_at,
    canceled_at,
    trial_start,
    trial_end,
    quantity
  ) VALUES (
    p_organization_id,
    p_stripe_data->>'id',
    p_stripe_data->>'customer',
    p_stripe_data->'items'->'data'->0->'price'->>'id',
    COALESCE(p_stripe_data->'metadata'->>'plan', 'pro'),
    p_stripe_data->>'status',
    to_timestamp((p_stripe_data->>'current_period_start')::bigint),
    to_timestamp((p_stripe_data->>'current_period_end')::bigint),
    CASE WHEN p_stripe_data->>'cancel_at' IS NOT NULL 
      THEN to_timestamp((p_stripe_data->>'cancel_at')::bigint) END,
    CASE WHEN p_stripe_data->>'canceled_at' IS NOT NULL 
      THEN to_timestamp((p_stripe_data->>'canceled_at')::bigint) END,
    CASE WHEN p_stripe_data->>'trial_start' IS NOT NULL 
      THEN to_timestamp((p_stripe_data->>'trial_start')::bigint) END,
    CASE WHEN p_stripe_data->>'trial_end' IS NOT NULL 
      THEN to_timestamp((p_stripe_data->>'trial_end')::bigint) END,
    COALESCE((p_stripe_data->'items'->'data'->0->>'quantity')::int, 1)
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at = EXCLUDED.cancel_at,
    canceled_at = EXCLUDED.canceled_at,
    quantity = EXCLUDED.quantity,
    updated_at = now()
  RETURNING id INTO v_subscription_id;
  
  -- Update organization
  UPDATE organizations
  SET 
    stripe_subscription_id = p_stripe_data->>'id',
    plan = COALESCE(p_stripe_data->'metadata'->>'plan', plan),
    status = CASE 
      WHEN p_stripe_data->>'status' IN ('active', 'trialing') THEN 'active'
      WHEN p_stripe_data->>'status' = 'past_due' THEN 'past_due'
      WHEN p_stripe_data->>'status' = 'canceled' THEN 'canceled'
      ELSE status
    END,
    updated_at = now()
  WHERE id = p_organization_id;
  
  RETURN v_subscription_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.test_concurrent_payouts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_test_ledger_id UUID;
  v_test_org_id UUID;
  v_test_owner_id UUID;
  v_creator_account_id UUID;
  v_cash_account_id UUID;
  v_result1 JSONB;
  v_result2 JSONB;
  v_result3 JSONB;
  v_dup_result JSONB;
  v_balance_check JSONB;
  v_final_balance NUMERIC(14,2);
  v_assertions JSONB := '[]'::jsonb;
  v_all_passed BOOLEAN := true;
BEGIN
  -- =========================================================================
  -- SETUP: Create a test ledger with a known creator balance of $100.00
  -- =========================================================================

  -- Create a minimal test user to satisfy owner_id FK
  v_test_owner_id := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token)
  VALUES (v_test_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '__test_concurrent_' || v_test_owner_id::text || '@test.local', '', NOW(), NOW(), NOW(), '', '');

  -- Create test org (disable triggers to avoid missing trigger functions on remote)
  ALTER TABLE public.organizations DISABLE TRIGGER USER;
  INSERT INTO public.organizations (name, slug, owner_id, plan, status, max_ledgers, current_ledger_count, max_team_members, current_member_count)
  VALUES ('__test_concurrent_org__', 'test-concurrent-' || replace(v_test_owner_id::text, '-', ''), v_test_owner_id, 'trial', 'active', 10, 0, 5, 1)
  RETURNING id INTO v_test_org_id;
  ALTER TABLE public.organizations ENABLE TRIGGER USER;

  -- Create test ledger (disable triggers to avoid missing trigger functions)
  ALTER TABLE public.ledgers DISABLE TRIGGER USER;
  INSERT INTO public.ledgers (organization_id, business_name, api_key_hash, status)
  VALUES (v_test_org_id, '__test_concurrent_ledger__', encode(extensions.gen_random_bytes(32), 'hex'), 'active')
  RETURNING id INTO v_test_ledger_id;
  ALTER TABLE public.ledgers ENABLE TRIGGER USER;

  -- Create accounts
  INSERT INTO accounts (ledger_id, account_type, entity_id, entity_type, name)
  VALUES (v_test_ledger_id, 'creator_balance', '__test_creator__', 'creator', 'Test Creator')
  RETURNING id INTO v_creator_account_id;

  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  VALUES (v_test_ledger_id, 'cash', 'platform', 'Cash')
  RETURNING id INTO v_cash_account_id;

  -- Seed $100.00 balance via a sale transaction + entries
  DECLARE
    v_seed_tx_id UUID;
  BEGIN
    INSERT INTO transactions (ledger_id, transaction_type, reference_id, amount, currency, status, metadata)
    VALUES (v_test_ledger_id, 'sale', '__test_seed_sale__', 100.00, 'USD', 'completed',
            '{"creator_id": "__test_creator__"}'::jsonb)
    RETURNING id INTO v_seed_tx_id;

    INSERT INTO entries (transaction_id, account_id, entry_type, amount) VALUES
      (v_seed_tx_id, v_cash_account_id, 'debit', 100.00),
      (v_seed_tx_id, v_creator_account_id, 'credit', 100.00);
  END;

  -- =========================================================================
  -- TEST 1: First payout of $60 should succeed
  -- =========================================================================
  v_result1 := process_payout_atomic(
    v_test_ledger_id, '__test_payout_1__', '__test_creator__',
    6000, 0, 'platform', NULL, 'Test payout 1', 'test'
  );

  IF v_result1->>'status' = 'created' THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_1_succeeds', 'passed', true,
      'detail', 'First $60 payout created successfully'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_1_succeeds', 'passed', false,
      'detail', 'Expected created, got: ' || (v_result1->>'status')
    );
  END IF;

  -- =========================================================================
  -- TEST 2: Second payout of $60 should fail (only $40 remaining)
  -- =========================================================================
  v_result2 := process_payout_atomic(
    v_test_ledger_id, '__test_payout_2__', '__test_creator__',
    6000, 0, 'platform', NULL, 'Test payout 2', 'test'
  );

  IF v_result2->>'status' = 'insufficient_balance' THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_2_blocked', 'passed', true,
      'detail', 'Second $60 payout correctly rejected (insufficient balance)',
      'available', v_result2->'available'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_2_blocked', 'passed', false,
      'detail', 'Expected insufficient_balance, got: ' || (v_result2->>'status')
    );
  END IF;

  -- =========================================================================
  -- TEST 3: Payout of remaining $40 should succeed
  -- =========================================================================
  v_result3 := process_payout_atomic(
    v_test_ledger_id, '__test_payout_3__', '__test_creator__',
    4000, 0, 'platform', NULL, 'Test payout 3', 'test'
  );

  IF v_result3->>'status' = 'created' AND (v_result3->>'new_balance')::numeric = 0 THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_3_drains_balance', 'passed', true,
      'detail', 'Third $40 payout succeeded, balance is now $0.00'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_3_drains_balance', 'passed', false,
      'detail', 'Expected created with balance 0, got: ' || (v_result3->>'status') || ' balance: ' || COALESCE(v_result3->>'new_balance', 'null')
    );
  END IF;

  -- =========================================================================
  -- TEST 4: Duplicate reference_id returns idempotent result
  -- =========================================================================
  v_dup_result := process_payout_atomic(
    v_test_ledger_id, '__test_payout_1__', '__test_creator__',
    6000, 0, 'platform', NULL, 'Duplicate attempt', 'test'
  );

  IF v_dup_result->>'status' = 'duplicate' AND v_dup_result->>'transaction_id' = v_result1->>'transaction_id' THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'duplicate_idempotent', 'passed', true,
      'detail', 'Duplicate reference_id returned original transaction_id'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'duplicate_idempotent', 'passed', false,
      'detail', 'Expected duplicate with matching tx_id, got: ' || (v_dup_result->>'status')
    );
  END IF;

  -- =========================================================================
  -- TEST 5: Balance invariant holds (no negative balances)
  -- =========================================================================
  v_balance_check := check_balance_invariants(v_test_ledger_id);

  IF v_balance_check->>'status' = 'pass' THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'no_negative_balances', 'passed', true,
      'detail', 'Balance invariant holds: no negative balances'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'no_negative_balances', 'passed', false,
      'detail', v_balance_check->'details'
    );
  END IF;

  -- =========================================================================
  -- TEST 6: Verify final computed balance equals $0
  -- =========================================================================
  SELECT COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)
    INTO v_final_balance
    FROM entries e
    JOIN transactions t ON t.id = e.transaction_id
   WHERE e.account_id = v_creator_account_id
     AND t.status NOT IN ('voided', 'reversed');

  IF v_final_balance = 0 THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'final_balance_zero', 'passed', true,
      'detail', 'Creator balance is exactly $0.00 after all payouts'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'final_balance_zero', 'passed', false,
      'detail', 'Expected $0.00, got: $' || v_final_balance::text
    );
  END IF;

  -- =========================================================================
  -- CLEANUP: Remove all test data
  -- =========================================================================
  DELETE FROM entries WHERE transaction_id IN (
    SELECT id FROM transactions WHERE ledger_id = v_test_ledger_id
  );
  DELETE FROM transactions WHERE ledger_id = v_test_ledger_id;
  DELETE FROM accounts WHERE ledger_id = v_test_ledger_id;
  DELETE FROM ledgers WHERE id = v_test_ledger_id;
  DELETE FROM organizations WHERE id = v_test_org_id;
  DELETE FROM auth.users WHERE id = v_test_owner_id;

  -- =========================================================================
  -- RESULT
  -- =========================================================================
  RETURN jsonb_build_object(
    'status', CASE WHEN v_all_passed THEN 'pass' ELSE 'fail' END,
    'tests_run', jsonb_array_length(v_assertions),
    'tests_passed', (SELECT COUNT(*) FROM jsonb_array_elements(v_assertions) AS elem WHERE (elem->>'passed')::boolean = true),
    'assertions', v_assertions
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.track_transaction_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get organization from ledger
  SELECT organization_id INTO v_org_id
  FROM ledgers WHERE id = NEW.ledger_id;
  
  IF v_org_id IS NOT NULL THEN
    PERFORM record_transaction_usage(v_org_id, NEW.ledger_id);
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_audit_log_chain_hash_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_prev_hash TEXT;
  v_payload TEXT;
BEGIN
  -- Assign monotonic sequence number
  NEW.seq_num := nextval('audit_log_seq_num_seq');

  -- Fetch previous record's hash
  SELECT row_hash INTO v_prev_hash
  FROM audit_log
  WHERE seq_num = NEW.seq_num - 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := 'GENESIS';
  END IF;

  NEW.prev_hash := v_prev_hash;

  -- Build canonical payload for hashing
  v_payload := NEW.seq_num::TEXT || '|'
    || NEW.prev_hash || '|'
    || COALESCE(NEW.action, '') || '|'
    || COALESCE(NEW.entity_id::TEXT, '') || '|'
    || COALESCE(NEW.created_at::TEXT, '') || '|'
    || COALESCE(NEW.ledger_id::TEXT, '') || '|'
    || COALESCE(NEW.actor_id, '') || '|'
    || COALESCE(NEW.ip_address::TEXT, '');

  -- Compute SHA-256 hash
  NEW.row_hash := encode(extensions.digest(v_payload::bytea, 'sha256'), 'hex');

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_audit_log_immutable_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- Allow superuser roles for emergency maintenance
  IF current_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_log records are immutable — % blocked for role %',
    TG_OP, current_user
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_entries_immutability_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_tx_status TEXT;
  v_tx_id UUID;
BEGIN
  -- Use OLD for both UPDATE and DELETE
  v_tx_id := OLD.transaction_id;

  SELECT status INTO v_tx_status
  FROM public.transactions
  WHERE id = v_tx_id;

  IF v_tx_status IN ('completed', 'voided', 'reversed') THEN
    RAISE EXCEPTION 'Cannot modify entries for % transaction %',
      v_tx_status, v_tx_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_payout_negative_balance_guard_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_account_type TEXT;
  v_tx_type TEXT;
  v_ledger_balance NUMERIC(14,2);
  v_held_funds NUMERIC(14,2);
  v_available NUMERIC(14,2);
  v_entity_id TEXT;
  v_ledger_id UUID;
BEGIN
  -- Early exit: only guard debit entries
  IF NEW.entry_type != 'debit' THEN
    RETURN NEW;
  END IF;

  -- Look up account type
  SELECT account_type, entity_id, ledger_id
  INTO v_account_type, v_entity_id, v_ledger_id
  FROM public.accounts
  WHERE id = NEW.account_id;

  -- Early exit: only guard creator_balance accounts
  IF v_account_type != 'creator_balance' THEN
    RETURN NEW;
  END IF;

  -- Look up transaction type
  SELECT transaction_type INTO v_tx_type
  FROM public.transactions
  WHERE id = NEW.transaction_id;

  -- Early exit: only guard payout transactions
  IF v_tx_type != 'payout' THEN
    RETURN NEW;
  END IF;

  -- Compute ledger balance (credits - debits) for this account
  -- Exclude voided/reversed transactions
  SELECT
    COALESCE(
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)
      - SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END),
      0
    )
  INTO v_ledger_balance
  FROM public.entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE e.account_id = NEW.account_id
    AND t.status NOT IN ('voided', 'reversed');

  -- Compute held funds for this creator
  SELECT COALESCE(SUM(held_amount - released_amount), 0)
  INTO v_held_funds
  FROM public.held_funds
  WHERE ledger_id = v_ledger_id
    AND creator_id = v_entity_id
    AND status IN ('held', 'partial');

  v_available := v_ledger_balance - v_held_funds;

  IF v_available - NEW.amount < -0.005 THEN
    RAISE EXCEPTION 'Payout would result in negative balance: available=%, debit=%, shortfall=%',
      v_available, NEW.amount, NEW.amount - v_available
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_match_stripe_payout()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only process deposits that might be Stripe payouts
  IF NEW.amount > 0 AND (
    UPPER(COALESCE(NEW.name, '')) LIKE '%STRIPE%'
  ) THEN
    -- Try to find a matching Stripe payout
    UPDATE plaid_transactions pt
    SET 
      stripe_payout_id = st.stripe_id,
      is_stripe_payout = true,
      match_status = 'matched',
      matched_transaction_id = st.transaction_id,
      match_confidence = 0.95
    FROM stripe_transactions st
    WHERE pt.id = NEW.id
      AND st.ledger_id = NEW.ledger_id
      AND st.stripe_type = 'payout'
      AND st.status = 'paid'
      AND st.bank_transaction_id IS NULL
      AND ABS(st.amount) BETWEEN (NEW.amount - 0.01) AND (NEW.amount + 0.01)
      AND NEW.date::date BETWEEN 
        ((st.raw_data->>'arrival_date')::date - 3) AND 
        ((st.raw_data->>'arrival_date')::date + 3);

    -- Update the Stripe transaction side
    UPDATE stripe_transactions st
    SET 
      bank_transaction_id = NEW.id,
      bank_matched_at = NOW()
    WHERE st.ledger_id = NEW.ledger_id
      AND st.stripe_type = 'payout'
      AND st.status = 'paid'
      AND st.bank_transaction_id IS NULL
      AND ABS(st.amount) BETWEEN (NEW.amount - 0.01) AND (NEW.amount + 0.01)
      AND NEW.date::date BETWEEN 
        ((st.raw_data->>'arrival_date')::date - 3) AND 
        ((st.raw_data->>'arrival_date')::date + 3)
      AND (
        UPPER(COALESCE(NEW.name, '')) LIKE '%STRIPE%'
      );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unmatch_transaction(p_bank_transaction_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE bank_transactions
  SET reconciliation_status = 'unmatched',
      matched_transaction_id = NULL,
      matched_at = NULL,
      matched_by = NULL,
      match_confidence = NULL
  WHERE id = p_bank_transaction_id;
  
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_account_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_type TEXT;
  v_is_debit_normal BOOLEAN;
BEGIN
  -- Get the account type
  SELECT account_type INTO v_account_type
  FROM accounts
  WHERE id = NEW.account_id;
  
  -- Determine if this is a debit-normal or credit-normal account
  -- DEBIT-NORMAL accounts: Debits INCREASE balance, Credits DECREASE balance
  --   - Assets: cash, accounts_receivable, inventory, prepaid_expense, etc.
  --   - Expenses: expense, processing_fees, cost_of_goods_sold, etc.
  -- CREDIT-NORMAL accounts: Credits INCREASE balance, Debits DECREASE balance
  --   - Liabilities: accounts_payable, creator_balance, tax_payable, etc.
  --   - Equity: owner_equity, retained_earnings, etc.
  --   - Revenue: revenue, platform_revenue, income, etc.
  
  v_is_debit_normal := v_account_type IN (
    -- Assets (Debit-Normal)
    'cash',
    'bank',
    'bank_account',
    'petty_cash',
    'undeposited_funds',
    'accounts_receivable',
    'inventory',
    'prepaid_expense',
    'fixed_asset',
    'property',
    'equipment',
    'asset',
    'other_asset',
    
    -- Expenses (Debit-Normal)
    'expense',
    'processing_fees',
    'cost_of_goods_sold',
    'cogs',
    'payroll',
    'rent',
    'utilities',
    'insurance',
    'depreciation',
    'taxes',
    'interest_expense',
    'other_expense',
    'loss',
    
    -- Contra accounts that are debit-normal
    'owner_draw',
    
    -- Reserves that act like assets
    'refund_reserve',
    'tax_reserve',
    'reserve'
  );
  
  -- Apply the correct balance update logic
  IF v_is_debit_normal THEN
    -- Debit-normal: Debits increase, Credits decrease
    IF NEW.entry_type = 'debit' THEN
      UPDATE accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    ELSE
      UPDATE accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    END IF;
  ELSE
    -- Credit-normal: Credits increase, Debits decrease
    IF NEW.entry_type = 'credit' THEN
      UPDATE accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    ELSE
      UPDATE accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    END IF;
  END IF;
  
  -- Update running balance on the entry
  NEW.running_balance := (SELECT balance FROM accounts WHERE id = NEW.account_id);
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_contractor_ytd()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update contractor totals
  UPDATE contractors
  SET 
    ytd_payments = (
      SELECT COALESCE(SUM(amount), 0)
      FROM contractor_payments
      WHERE contractor_id = NEW.contractor_id
        AND tax_year = EXTRACT(YEAR FROM CURRENT_DATE)
    ),
    lifetime_payments = lifetime_payments + NEW.amount,
    needs_1099 = (
      SELECT COALESCE(SUM(amount), 0) >= 600
      FROM contractor_payments
      WHERE contractor_id = NEW.contractor_id
        AND tax_year = EXTRACT(YEAR FROM CURRENT_DATE)
    ),
    updated_at = NOW()
  WHERE id = NEW.contractor_id;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_org_ledger_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_org_member_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_organization_id uuid, p_required_role text DEFAULT 'member'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.validate_api_key_secure(p_provided_key text)
 RETURNS TABLE(ledger_id uuid, business_name text, ledger_mode text, status text, settings jsonb, organization_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hash TEXT;
BEGIN
  -- Hash the provided key
  v_hash := encode(sha256(p_provided_key::bytea), 'hex');
  
  -- Look up by hash
  RETURN QUERY
  SELECT 
    l.id,
    l.business_name,
    l.ledger_mode,
    l.status,
    l.settings,
    l.organization_id
  FROM ledgers l
  WHERE l.api_key_hash = v_hash;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_double_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  total_debits NUMERIC(14,2);
  total_credits NUMERIC(14,2);
BEGIN
  -- Calculate totals for this transaction
  SELECT 
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
  INTO total_debits, total_credits
  FROM entries
  WHERE transaction_id = NEW.transaction_id;
  
  -- For now, just log - we'll validate at commit time
  -- This allows building transactions with multiple inserts
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_double_entry_at_commit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_debits NUMERIC(14,2);
  v_credits NUMERIC(14,2);
BEGIN
  SELECT 
    COALESCE(SUM(amount) FILTER (WHERE entry_type = 'debit'), 0),
    COALESCE(SUM(amount) FILTER (WHERE entry_type = 'credit'), 0)
  INTO v_debits, v_credits
  FROM public.entries
  WHERE transaction_id = NEW.transaction_id;
  
  IF ABS(v_debits - v_credits) > 0.01 THEN
    RAISE EXCEPTION 'Double-entry violation for transaction %: debits (%) != credits (%)', 
      NEW.transaction_id, v_debits, v_credits;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_double_entry_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_remaining INTEGER;
  v_total_debits NUMERIC(14,2);
  v_total_credits NUMERIC(14,2);
BEGIN
  -- Count remaining entries for this transaction
  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
  INTO v_remaining, v_total_debits, v_total_credits
  FROM public.entries
  WHERE transaction_id = OLD.transaction_id;

  -- If no entries remain, the transaction is fully cleaned up — allow it
  IF v_remaining = 0 THEN
    RETURN OLD;
  END IF;

  -- If some entries remain, they must still balance
  IF ABS(v_total_debits - v_total_credits) > 0.01 THEN
    RAISE EXCEPTION 'Delete would leave transaction % unbalanced: debits=%, credits=%',
      OLD.transaction_id, v_total_debits, v_total_credits
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_webhook_signature(p_endpoint_id uuid, p_signature text, p_payload text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_endpoint RECORD;
  v_expected_current TEXT;
  v_expected_previous TEXT;
BEGIN
  -- Auth guard
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.webhook_endpoints we ON we.ledger_id = l.id
      WHERE we.id = p_endpoint_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  SELECT * INTO v_endpoint
  FROM public.webhook_endpoints
  WHERE id = p_endpoint_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check current secret
  v_expected_current := 'sha256=' || encode(
    extensions.hmac(p_payload::bytea, v_endpoint.secret::bytea, 'sha256'),
    'hex'
  );

  IF p_signature = v_expected_current THEN
    RETURN TRUE;
  END IF;

  -- Check previous secret if rotation happened recently
  IF v_endpoint.previous_secret IS NOT NULL THEN
    v_expected_previous := 'sha256=' || encode(
      extensions.hmac(p_payload::bytea, v_endpoint.previous_secret::bytea, 'sha256'),
      'hex'
    );

    IF p_signature = v_expected_previous THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_start_seq bigint DEFAULT 1, p_limit integer DEFAULT 10000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_rec RECORD;
  v_expected_hash TEXT;
  v_payload TEXT;
  v_prev_hash TEXT := NULL;
  v_count INTEGER := 0;
  v_broken_at BIGINT := NULL;
BEGIN
  FOR v_rec IN
    SELECT seq_num, prev_hash, row_hash, action, entity_id,
           created_at, ledger_id, actor_id, ip_address
    FROM public.audit_log
    WHERE seq_num >= p_start_seq
    ORDER BY seq_num ASC
    LIMIT p_limit
  LOOP
    v_count := v_count + 1;

    -- Determine expected prev_hash
    IF v_prev_hash IS NULL THEN
      -- First record in our window: check if it references GENESIS or the prior record
      IF v_rec.seq_num = 1 THEN
        IF v_rec.prev_hash != 'GENESIS' THEN
          RETURN jsonb_build_object(
            'status', 'broken',
            'broken_at_seq', v_rec.seq_num,
            'reason', 'First record prev_hash is not GENESIS',
            'records_verified', v_count
          );
        END IF;
        v_prev_hash := 'GENESIS';
      ELSE
        -- Starting mid-chain, trust the stored prev_hash for the first record
        v_prev_hash := v_rec.prev_hash;
      END IF;
    ELSE
      -- Verify prev_hash matches what we computed for the previous record
      IF v_rec.prev_hash != v_prev_hash THEN
        RETURN jsonb_build_object(
          'status', 'broken',
          'broken_at_seq', v_rec.seq_num,
          'reason', 'prev_hash mismatch',
          'records_verified', v_count
        );
      END IF;
    END IF;

    -- Recompute hash for current record
    v_payload := v_rec.seq_num::TEXT || '|'
      || COALESCE(v_rec.prev_hash, 'GENESIS') || '|'
      || COALESCE(v_rec.action, '') || '|'
      || COALESCE(v_rec.entity_id::TEXT, '') || '|'
      || COALESCE(v_rec.created_at::TEXT, '') || '|'
      || COALESCE(v_rec.ledger_id::TEXT, '') || '|'
      || COALESCE(v_rec.actor_id, '') || '|'
      || COALESCE(v_rec.ip_address::TEXT, '');

    v_expected_hash := encode(extensions.digest(v_payload::bytea, 'sha256'), 'hex');

    IF v_rec.row_hash != v_expected_hash THEN
      RETURN jsonb_build_object(
        'status', 'broken',
        'broken_at_seq', v_rec.seq_num,
        'reason', 'row_hash mismatch',
        'records_verified', v_count
      );
    END IF;

    -- This record's hash becomes the expected prev_hash for the next record
    v_prev_hash := v_rec.row_hash;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'intact',
    'broken_at_seq', NULL,
    'records_verified', v_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_ledger_balanced(p_ledger_id uuid)
 RETURNS TABLE(total_debits numeric, total_credits numeric, is_balanced boolean, difference numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)::NUMERIC as total_debits,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)::NUMERIC as total_credits,
    (COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) = 
     COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0))::BOOLEAN as is_balanced,
    ABS(COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0))::NUMERIC as difference
  FROM entries e
  JOIN transactions t ON e.transaction_id = t.id
  WHERE t.ledger_id = p_ledger_id
    AND t.status NOT IN ('voided', 'reversed', 'draft');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_ledger_integrity(p_ledger_id uuid)
 RETURNS TABLE(is_balanced boolean, total_debits numeric, total_credits numeric, difference numeric, account_count integer, transaction_count integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_debits NUMERIC(14,2);
  v_credits NUMERIC(14,2);
  v_accounts INTEGER;
  v_transactions INTEGER;
BEGIN
  -- Sum all debit balances (positive)
  SELECT COALESCE(SUM(balance), 0) INTO v_debits
  FROM accounts
  WHERE ledger_id = p_ledger_id AND balance > 0;
  
  -- Sum all credit balances (negative, so we negate)
  SELECT COALESCE(ABS(SUM(balance)), 0) INTO v_credits
  FROM accounts
  WHERE ledger_id = p_ledger_id AND balance < 0;
  
  -- Count accounts and transactions
  SELECT COUNT(*) INTO v_accounts FROM accounts WHERE ledger_id = p_ledger_id;
  SELECT COUNT(*) INTO v_transactions FROM transactions WHERE ledger_id = p_ledger_id;
  
  RETURN QUERY SELECT 
    v_debits = v_credits,
    v_debits,
    v_credits,
    v_debits - v_credits,
    v_accounts,
    v_transactions;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.void_invoice_atomic(p_invoice_id uuid, p_ledger_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, message text, reversal_transaction_id uuid, reversed_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_reversal_tx_id UUID;
  v_amount_to_reverse NUMERIC;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN QUERY SELECT false, 'Invoice ID is required'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;

  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND ledger_id = p_ledger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invoice not found'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;

  IF v_invoice.status = 'void' THEN
    RETURN QUERY SELECT false, 'Invoice is already void'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;

  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT false, 'Cannot void a fully paid invoice. Issue a credit memo instead.'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;

  IF v_invoice.status = 'draft' OR v_invoice.transaction_id IS NULL THEN
    UPDATE invoices
    SET status = 'void',
        voided_at = NOW(),
        void_reason = p_reason
    WHERE id = p_invoice_id;

    RETURN QUERY SELECT true, 'Draft invoice voided (no AR to reverse)'::TEXT, NULL::UUID, 0::NUMERIC;
    RETURN;
  END IF;

  v_ar_account_id := get_or_create_ledger_account(p_ledger_id, 'accounts_receivable', 'Accounts Receivable');
  v_revenue_account_id := get_or_create_ledger_account(p_ledger_id, 'revenue', 'Revenue');

  IF v_ar_account_id IS NULL OR v_revenue_account_id IS NULL THEN
    RETURN QUERY SELECT false, 'Required accounts not found'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;

  v_amount_to_reverse := v_invoice.amount_due / 100.0;

  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, reverses, metadata
  ) VALUES (
    p_ledger_id, 'invoice_void', 'VOID-' || v_invoice.invoice_number, 'void',
    'Void: Invoice ' || v_invoice.invoice_number, v_amount_to_reverse,
    v_invoice.currency, 'completed', v_invoice.transaction_id,
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'original_invoice_id', v_invoice.transaction_id,  -- Use transaction_id for AR matching
      'reason', COALESCE(p_reason, 'Voided by user'),
      'original_amount', v_invoice.total_amount / 100.0,
      'amount_paid', v_invoice.amount_paid / 100.0,
      'amount_reversed', v_amount_to_reverse
    )
  )
  RETURNING id INTO v_reversal_tx_id;

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_reversal_tx_id, v_ar_account_id, 'credit', v_amount_to_reverse),
    (v_reversal_tx_id, v_revenue_account_id, 'debit', v_amount_to_reverse);

  UPDATE invoices
  SET status = 'void',
      voided_at = NOW(),
      void_reason = p_reason
  WHERE id = p_invoice_id;

  UPDATE transactions
  SET reversed_by = v_reversal_tx_id
  WHERE id = v_invoice.transaction_id;

  RETURN QUERY SELECT true, 'Invoice voided and AR reversed'::TEXT, v_reversal_tx_id, v_amount_to_reverse;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, ('Error: ' || SQLERRM)::TEXT, NULL::UUID, NULL::NUMERIC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.wallet_deposit_atomic(p_ledger_id uuid, p_user_id text, p_amount bigint, p_reference_id text, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(out_transaction_id uuid, out_wallet_account_id uuid, out_wallet_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tx_id             UUID;
  v_wallet_account_id UUID;
  v_cash_account_id   UUID;
  v_wallet_balance    NUMERIC(14,2);
  v_amount_major      NUMERIC(14,2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit amount must be positive: %', p_amount;
  END IF;

  v_amount_major := p_amount / 100.0;

  -- Get-or-create wallet account (race-safe: ON CONFLICT DO NOTHING + re-select)
  SELECT id INTO v_wallet_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'user_wallet'
    AND entity_id = p_user_id;

  IF v_wallet_account_id IS NULL THEN
    INSERT INTO public.accounts (ledger_id, account_type, entity_id, entity_type, name)
    VALUES (p_ledger_id, 'user_wallet', p_user_id, 'customer', 'User Wallet')
    ON CONFLICT (ledger_id, account_type, entity_id) WHERE entity_id IS NOT NULL
    DO NOTHING;

    -- Re-select: either we inserted or a concurrent tx did
    SELECT id INTO v_wallet_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'user_wallet'
      AND entity_id = p_user_id;
  END IF;

  IF v_wallet_account_id IS NULL THEN
    RAISE EXCEPTION 'Failed to get or create wallet account for user %', p_user_id;
  END IF;

  -- Get cash account
  SELECT id INTO v_cash_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'cash'
    AND entity_id IS NULL
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Cash account not initialized for ledger %', p_ledger_id;
  END IF;

  -- Create transaction
  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'deposit', p_reference_id, 'wallet',
    COALESCE(p_description, 'Wallet deposit for user ' || p_user_id),
    v_amount_major, 'USD', 'completed',
    jsonb_build_object(
      'user_id', p_user_id,
      'operation', 'wallet_deposit',
      'amount_cents', p_amount
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- Double-entry: DEBIT cash (increase asset), CREDIT user_wallet (increase liability)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'debit', v_amount_major);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_wallet_account_id, 'credit', v_amount_major);

  -- Record internal transfer
  INSERT INTO public.internal_transfers (
    ledger_id, transaction_id, from_account_id, to_account_id,
    amount, currency, transfer_type, description, executed_at
  ) VALUES (
    p_ledger_id, v_tx_id, v_cash_account_id, v_wallet_account_id,
    v_amount_major, 'USD', 'wallet_deposit',
    COALESCE(p_description, 'Wallet deposit'), NOW()
  );

  -- Read wallet balance (updated by trigger)
  SELECT balance INTO v_wallet_balance
  FROM public.accounts
  WHERE id = v_wallet_account_id;

  -- Balance invariant check
  PERFORM 1 FROM (
    SELECT
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) AS debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) AS credits
    FROM public.entries e
    WHERE e.transaction_id = v_tx_id
  ) AS totals
  WHERE totals.debits != totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  RETURN QUERY SELECT v_tx_id, v_wallet_account_id, v_wallet_balance;

EXCEPTION
  WHEN unique_violation THEN
    -- Idempotency: duplicate reference_id means this deposit was already processed
    SELECT t.id,
           (SELECT a.id FROM public.accounts a
            WHERE a.ledger_id = p_ledger_id
            AND a.account_type = 'user_wallet'
            AND a.entity_id = p_user_id),
           (SELECT a.balance FROM public.accounts a
            WHERE a.ledger_id = p_ledger_id
            AND a.account_type = 'user_wallet'
            AND a.entity_id = p_user_id)
    INTO v_tx_id, v_wallet_account_id, v_wallet_balance
    FROM public.transactions t
    WHERE t.ledger_id = p_ledger_id AND t.reference_id = p_reference_id;

    RETURN QUERY SELECT v_tx_id, v_wallet_account_id, v_wallet_balance;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.wallet_transfer_atomic(p_ledger_id uuid, p_from_user_id text, p_to_user_id text, p_amount bigint, p_reference_id text, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(out_transaction_id uuid, out_from_balance numeric, out_to_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tx_id            UUID;
  v_from_account_id  UUID;
  v_to_account_id    UUID;
  v_from_balance     NUMERIC(14,2);
  v_to_balance       NUMERIC(14,2);
  v_amount_major     NUMERIC(14,2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive: %', p_amount;
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to self';
  END IF;

  v_amount_major := p_amount / 100.0;

  -- Get sender wallet (must exist). FOR UPDATE prevents concurrent balance checks
  -- from both passing before either deducts.
  SELECT id, balance INTO v_from_account_id, v_from_balance
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'user_wallet'
    AND entity_id = p_from_user_id
  FOR UPDATE;

  IF v_from_account_id IS NULL THEN
    RAISE EXCEPTION 'Sender wallet not found for user %', p_from_user_id;
  END IF;

  -- Overdraft protection
  IF v_from_balance < v_amount_major THEN
    RAISE EXCEPTION 'Insufficient wallet balance: % < %', v_from_balance, v_amount_major;
  END IF;

  -- Get-or-create recipient wallet (race-safe: ON CONFLICT DO NOTHING + re-select)
  SELECT id INTO v_to_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'user_wallet'
    AND entity_id = p_to_user_id;

  IF v_to_account_id IS NULL THEN
    INSERT INTO public.accounts (ledger_id, account_type, entity_id, entity_type, name)
    VALUES (p_ledger_id, 'user_wallet', p_to_user_id, 'customer', 'User Wallet')
    ON CONFLICT (ledger_id, account_type, entity_id) WHERE entity_id IS NOT NULL
    DO NOTHING;

    -- Re-select: either we inserted or a concurrent tx did
    SELECT id INTO v_to_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'user_wallet'
      AND entity_id = p_to_user_id;
  END IF;

  IF v_to_account_id IS NULL THEN
    RAISE EXCEPTION 'Failed to get or create recipient wallet for user %', p_to_user_id;
  END IF;

  -- Create transaction
  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'transfer', p_reference_id, 'wallet',
    COALESCE(p_description, 'Wallet transfer from ' || p_from_user_id || ' to ' || p_to_user_id),
    v_amount_major, 'USD', 'completed',
    jsonb_build_object(
      'from_user_id', p_from_user_id,
      'to_user_id', p_to_user_id,
      'operation', 'wallet_transfer',
      'amount_cents', p_amount
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- Double-entry: DEBIT from_wallet (decrease sender), CREDIT to_wallet (increase recipient)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_from_account_id, 'debit', v_amount_major);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_to_account_id, 'credit', v_amount_major);

  -- Record internal transfer
  INSERT INTO public.internal_transfers (
    ledger_id, transaction_id, from_account_id, to_account_id,
    amount, currency, transfer_type, description, executed_at
  ) VALUES (
    p_ledger_id, v_tx_id, v_from_account_id, v_to_account_id,
    v_amount_major, 'USD', 'wallet_transfer',
    COALESCE(p_description, 'Wallet transfer'), NOW()
  );

  -- Read updated balances
  SELECT balance INTO v_from_balance
  FROM public.accounts WHERE id = v_from_account_id;

  SELECT balance INTO v_to_balance
  FROM public.accounts WHERE id = v_to_account_id;

  -- Balance invariant check
  PERFORM 1 FROM (
    SELECT
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) AS debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) AS credits
    FROM public.entries e
    WHERE e.transaction_id = v_tx_id
  ) AS totals
  WHERE totals.debits != totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  RETURN QUERY SELECT v_tx_id, v_from_balance, v_to_balance;

EXCEPTION
  WHEN unique_violation THEN
    -- Idempotency: duplicate reference_id means this transfer was already processed
    SELECT t.id INTO v_tx_id
    FROM public.transactions t
    WHERE t.ledger_id = p_ledger_id AND t.reference_id = p_reference_id;

    SELECT balance INTO v_from_balance
    FROM public.accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'user_wallet'
      AND entity_id = p_from_user_id;

    SELECT balance INTO v_to_balance
    FROM public.accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'user_wallet'
      AND entity_id = p_to_user_id;

    RETURN QUERY SELECT v_tx_id, v_from_balance, v_to_balance;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.wallet_withdraw_atomic(p_ledger_id uuid, p_user_id text, p_amount bigint, p_reference_id text, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(out_transaction_id uuid, out_wallet_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tx_id             UUID;
  v_wallet_account_id UUID;
  v_cash_account_id   UUID;
  v_wallet_balance    NUMERIC(14,2);
  v_amount_major      NUMERIC(14,2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be positive: %', p_amount;
  END IF;

  v_amount_major := p_amount / 100.0;

  -- Get wallet account (must exist). FOR UPDATE serializes concurrent withdrawals
  -- so two balance checks can't both pass before either deducts.
  SELECT id, balance INTO v_wallet_account_id, v_wallet_balance
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'user_wallet'
    AND entity_id = p_user_id
  FOR UPDATE;

  IF v_wallet_account_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
  END IF;

  -- Overdraft protection
  IF v_wallet_balance < v_amount_major THEN
    RAISE EXCEPTION 'Insufficient wallet balance: % < %', v_wallet_balance, v_amount_major;
  END IF;

  -- Get cash account
  SELECT id INTO v_cash_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'cash'
    AND entity_id IS NULL
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Cash account not initialized for ledger %', p_ledger_id;
  END IF;

  -- Create transaction
  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'withdrawal', p_reference_id, 'wallet',
    COALESCE(p_description, 'Wallet withdrawal for user ' || p_user_id),
    v_amount_major, 'USD', 'completed',
    jsonb_build_object(
      'user_id', p_user_id,
      'operation', 'wallet_withdrawal',
      'amount_cents', p_amount
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- Double-entry: DEBIT user_wallet (decrease liability), CREDIT cash (decrease asset)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_wallet_account_id, 'debit', v_amount_major);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'credit', v_amount_major);

  -- Record internal transfer
  INSERT INTO public.internal_transfers (
    ledger_id, transaction_id, from_account_id, to_account_id,
    amount, currency, transfer_type, description, executed_at
  ) VALUES (
    p_ledger_id, v_tx_id, v_wallet_account_id, v_cash_account_id,
    v_amount_major, 'USD', 'wallet_withdrawal',
    COALESCE(p_description, 'Wallet withdrawal'), NOW()
  );

  -- Read updated wallet balance
  SELECT balance INTO v_wallet_balance
  FROM public.accounts
  WHERE id = v_wallet_account_id;

  -- Balance invariant check
  PERFORM 1 FROM (
    SELECT
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) AS debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) AS credits
    FROM public.entries e
    WHERE e.transaction_id = v_tx_id
  ) AS totals
  WHERE totals.debits != totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  RETURN QUERY SELECT v_tx_id, v_wallet_balance;

EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id,
           (SELECT a.balance FROM public.accounts a
            WHERE a.ledger_id = p_ledger_id
            AND a.account_type = 'user_wallet'
            AND a.entity_id = p_user_id)
    INTO v_tx_id, v_wallet_balance
    FROM public.transactions t
    WHERE t.ledger_id = p_ledger_id AND t.reference_id = p_reference_id;

    RETURN QUERY SELECT v_tx_id, v_wallet_balance;
END;
$function$
;

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER trigger_accounting_periods_updated BEFORE UPDATE ON accounting_periods FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_periods_updated BEFORE UPDATE ON accounting_periods FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_wallet_nonneg_balance BEFORE INSERT OR UPDATE OF balance, account_type ON accounts FOR EACH ROW WHEN (new.account_type = 'user_wallet'::text) EXECUTE FUNCTION enforce_wallet_nonnegative_balance();
CREATE TRIGGER trigger_api_scopes_updated BEFORE UPDATE ON api_key_scopes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_audit_log_chain_hash BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION trg_audit_log_chain_hash_fn();
CREATE TRIGGER trg_audit_log_immutable BEFORE DELETE OR UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION trg_audit_log_immutable_fn();
CREATE TRIGGER trg_audit_log_archive_immutable BEFORE DELETE OR UPDATE ON audit_log_archive FOR EACH ROW EXECUTE FUNCTION trg_audit_log_immutable_fn();
CREATE TRIGGER enforce_instrument_immutability BEFORE UPDATE ON authorizing_instruments FOR EACH ROW EXECUTE FUNCTION prevent_instrument_update();
CREATE TRIGGER prevent_instrument_delete_if_linked BEFORE DELETE ON authorizing_instruments FOR EACH ROW EXECUTE FUNCTION prevent_linked_instrument_delete();
CREATE TRIGGER trigger_expire_projections_on_invalidation AFTER UPDATE ON authorizing_instruments FOR EACH ROW EXECUTE FUNCTION expire_pending_projections();
CREATE TRIGGER trigger_bank_accounts_updated BEFORE UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_bank_connections_updated BEFORE UPDATE ON bank_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_budgets_updated BEFORE UPDATE ON budget_envelopes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_contractor_payment_ytd AFTER INSERT ON contractor_payments FOR EACH ROW EXECUTE FUNCTION update_contractor_ytd();
CREATE TRIGGER trigger_contractors_updated BEFORE UPDATE ON contractors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_payout_summaries_updated BEFORE UPDATE ON creator_payout_summaries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_creator_tiers_updated BEFORE UPDATE ON creator_tiers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE CONSTRAINT TRIGGER enforce_double_entry AFTER INSERT ON entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_double_entry_at_commit();
CREATE CONSTRAINT TRIGGER trg_entries_double_entry_delete AFTER DELETE ON entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_double_entry_on_delete();
CREATE TRIGGER trg_entries_immutability BEFORE DELETE OR UPDATE ON entries FOR EACH ROW EXECUTE FUNCTION trg_entries_immutability_fn();
CREATE TRIGGER trg_payout_negative_balance_guard BEFORE INSERT ON entries FOR EACH ROW EXECUTE FUNCTION trg_payout_negative_balance_guard_fn();
CREATE TRIGGER trigger_update_balance BEFORE INSERT ON entries FOR EACH ROW EXECUTE FUNCTION update_account_balance();
CREATE TRIGGER trigger_expense_categories_updated BEFORE UPDATE ON expense_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_held_funds_updated BEFORE UPDATE ON held_funds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_service_role_ledgers AFTER INSERT OR DELETE OR UPDATE ON ledgers FOR EACH ROW EXECUTE FUNCTION log_service_role_access();
CREATE TRIGGER trigger_create_ledger_accounts AFTER INSERT ON ledgers FOR EACH ROW EXECUTE FUNCTION auto_create_ledger_accounts();
CREATE TRIGGER trigger_enforce_ledger_limit BEFORE INSERT ON ledgers FOR EACH ROW EXECUTE FUNCTION enforce_ledger_limit();
CREATE TRIGGER trigger_ledger_count AFTER INSERT OR DELETE ON ledgers FOR EACH ROW EXECUTE FUNCTION update_org_ledger_count();
CREATE TRIGGER trigger_ledgers_updated BEFORE UPDATE ON ledgers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_set_default_settings BEFORE INSERT ON ledgers FOR EACH ROW EXECUTE FUNCTION set_default_settings();
CREATE TRIGGER trigger_mileage_updated BEFORE UPDATE ON mileage_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_enforce_member_limit BEFORE INSERT OR UPDATE ON organization_members FOR EACH ROW EXECUTE FUNCTION enforce_member_limit();
CREATE TRIGGER trigger_member_count AFTER INSERT OR DELETE OR UPDATE ON organization_members FOR EACH ROW EXECUTE FUNCTION update_org_member_count();
CREATE TRIGGER trigger_handle_plan_change BEFORE UPDATE OF plan ON organizations FOR EACH ROW EXECUTE FUNCTION handle_plan_change();
CREATE TRIGGER trigger_organization_slug BEFORE INSERT OR UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION handle_organization_slug();
CREATE TRIGGER trigger_organizations_updated BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_preserve_slug_on_delete BEFORE DELETE ON organizations FOR EACH ROW EXECUTE FUNCTION handle_organization_delete();
CREATE TRIGGER audit_service_role_payouts AFTER INSERT OR DELETE OR UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION log_service_role_access();
CREATE TRIGGER trigger_payouts_updated BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_match_stripe_payout AFTER INSERT ON plaid_transactions FOR EACH ROW EXECUTE FUNCTION trigger_match_stripe_payout();
CREATE TRIGGER trigger_product_splits_updated BEFORE UPDATE ON product_splits FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_receipt_rules_updated BEFORE UPDATE ON receipt_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_reconciliation_periods_updated BEFORE UPDATE ON reconciliation_periods FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_reconciliation_updated BEFORE UPDATE ON reconciliation_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_reconciliation_rules_updated BEFORE UPDATE ON reconciliation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_recon_sessions_updated BEFORE UPDATE ON reconciliation_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_recurring_templates_updated BEFORE UPDATE ON recurring_expense_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_stripe_links_updated BEFORE UPDATE ON stripe_account_links FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER stripe_transactions_updated_at BEFORE UPDATE ON stripe_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_subscriptions_updated BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_tax_buckets_updated BEFORE UPDATE ON tax_buckets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_service_role_transactions AFTER INSERT OR DELETE OR UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION log_service_role_access();
CREATE TRIGGER trigger_check_period_closed BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION check_period_not_closed();
CREATE TRIGGER trigger_check_transaction_period_lock BEFORE INSERT OR UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION check_period_lock();
CREATE TRIGGER trigger_transaction_usage AFTER INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION track_transaction_usage();
CREATE TRIGGER trigger_user_profiles_updated BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER vault_access_log_no_delete BEFORE DELETE ON vault_access_log FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
CREATE TRIGGER vault_access_log_no_update BEFORE UPDATE ON vault_access_log FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
CREATE TRIGGER trigger_webhook_secret BEFORE INSERT ON webhook_endpoints FOR EACH ROW EXECUTE FUNCTION generate_webhook_secret();
CREATE TRIGGER trigger_withholding_rules_updated BEFORE UPDATE ON withholding_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjustment_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_sensitive_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorizing_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_match_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_overage_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_payout_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drift_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_check_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.held_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mileage_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nacha_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_monitor_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_file_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_schedule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_processor_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processor_webhook_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projected_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_condition_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserved_slugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_score_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runway_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withholding_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY Ledger isolation ON public.accounting_periods AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.accounts AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Org members can view accounts ON public.accounts AS PERMISSIVE FOR SELECT TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Ledger isolation ON public.adjustment_journals AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY alert_configurations_service_all ON public.alert_configurations AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY alert_configurations_user_delete ON public.alert_configurations AS PERMISSIVE FOR DELETE TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY alert_configurations_user_insert ON public.alert_configurations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY alert_configurations_user_select ON public.alert_configurations AS PERMISSIVE FOR SELECT TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY alert_configurations_user_update ON public.alert_configurations AS PERMISSIVE FOR UPDATE TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY alert_history_service_all ON public.alert_history AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY alert_history_user_select ON public.alert_history AS PERMISSIVE FOR SELECT TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY Ledger isolation ON public.api_key_scopes AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY authenticated_insert_api_keys ON public.api_keys AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY authenticated_select_api_keys ON public.api_keys AS PERMISSIVE FOR SELECT TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY service_role_api_keys ON public.api_keys AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY audit_log_service_only ON public.audit_log AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Service role has full access to audit_log_archive ON public.audit_log_archive AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY Service role only ON public.audit_sensitive_fields AS PERMISSIVE FOR ALL TO service_role USING (true);
CREATE POLICY authorizing_instruments_service_all ON public.authorizing_instruments AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authorizing_instruments_user_insert ON public.authorizing_instruments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY authorizing_instruments_user_select ON public.authorizing_instruments AS PERMISSIVE FOR SELECT TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY Auto match rules via org membership ON public.auto_match_rules AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Ledger isolation ON public.bank_accounts AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.bank_connections AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.bank_statement_lines AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.bank_statements AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.bank_transactions AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Owners can view billing events ON public.billing_events AS PERMISSIVE FOR SELECT TO public USING ((organization_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text) AND (om.role = 'owner'::text)))));
CREATE POLICY Org owners view billing overage charges ON public.billing_overage_charges AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = billing_overage_charges.organization_id) AND (om.user_id = auth.uid()) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY Service role billing overage charges ON public.billing_overage_charges AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Ledger isolation ON public.budget_envelopes AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Service role has full access to connected_accounts ON public.connected_accounts AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY Ledger isolation ON public.contractor_payments AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.contractors AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.creator_payout_summaries AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.creator_tiers AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY cron_jobs_service_only ON public.cron_jobs AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY service_role_full_access_drift_alerts ON public.drift_alerts AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY email_log_service_only ON public.email_log AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Ledger isolation ON public.entries AS PERMISSIVE FOR ALL TO public USING ((transaction_id IN ( SELECT transactions.id
   FROM transactions
  WHERE (transactions.ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid))));
CREATE POLICY Org members can view entries ON public.entries AS PERMISSIVE FOR SELECT TO public USING ((transaction_id IN ( SELECT t.id
   FROM ((transactions t
     JOIN ledgers l ON ((l.id = t.ledger_id)))
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Service role has full access to escrow_releases ON public.escrow_releases AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY Ledger isolation ON public.expense_attachments AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.expense_categories AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Health check results via org membership ON public.health_check_results AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Service role health_check_results ON public.health_check_results AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Ledger isolation ON public.held_funds AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY idempotency_keys_service_only ON public.idempotency_keys AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Import templates via org membership ON public.import_templates AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Ledger isolation ON public.internal_transfers AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY invoice_payments_service_role_full_access ON public.invoice_payments AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY invoices_service_role_full_access ON public.invoices AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Org admins can insert ledgers ON public.ledgers AS PERMISSIVE FOR INSERT TO public WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.status = 'active'::text) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY Org admins can update ledgers ON public.ledgers AS PERMISSIVE FOR UPDATE TO public USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.status = 'active'::text) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY Org members can view ledgers ON public.ledgers AS PERMISSIVE FOR SELECT TO public USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.status = 'active'::text)))));
CREATE POLICY Org owners can delete ledgers ON public.ledgers AS PERMISSIVE FOR DELETE TO public USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.status = 'active'::text) AND (organization_members.role = 'owner'::text)))));
CREATE POLICY Ledger isolation ON public.mileage_entries AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY NACHA files via org membership ON public.nacha_files AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (om.status = 'active'::text)))));
CREATE POLICY Service role full access ON public.notifications AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY Users can update own notifications ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING (((organization_id IN ( SELECT get_user_organization_ids(auth.uid()) AS get_user_organization_ids)) AND ((user_id IS NULL) OR (user_id = auth.uid()))));
CREATE POLICY Users can view org notifications ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING (((organization_id IN ( SELECT get_user_organization_ids(auth.uid()) AS get_user_organization_ids)) AND ((user_id IS NULL) OR (user_id = auth.uid()))));
CREATE POLICY Ledger isolation ON public.opening_balances AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Service role ops_monitor_runs ON public.ops_monitor_runs AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Admins can create invitations ON public.organization_invitations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((organization_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY Admins can update invitations ON public.organization_invitations AS PERMISSIVE FOR UPDATE TO public USING ((organization_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY Admins can view invitations ON public.organization_invitations AS PERMISSIVE FOR SELECT TO public USING ((organization_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY Anyone can view invite by token ON public.organization_invites AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY Org admins can create invites ON public.organization_invites AS PERMISSIVE FOR INSERT TO public WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY members_delete ON public.organization_members AS PERMISSIVE FOR DELETE TO authenticated USING ((organization_id IN ( SELECT get_user_organization_ids(auth.uid()) AS get_user_organization_ids)));
CREATE POLICY members_insert ON public.organization_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY members_select_org ON public.organization_members AS PERMISSIVE FOR SELECT TO authenticated USING ((organization_id IN ( SELECT get_user_organization_ids(auth.uid()) AS get_user_organization_ids)));
CREATE POLICY members_select_own ON public.organization_members AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY members_update ON public.organization_members AS PERMISSIVE FOR UPDATE TO authenticated USING ((organization_id IN ( SELECT get_user_organization_ids(auth.uid()) AS get_user_organization_ids)));
CREATE POLICY org_delete ON public.organizations AS PERMISSIVE FOR DELETE TO authenticated USING ((id IN ( SELECT get_user_organization_ids(auth.uid()) AS get_user_organization_ids)));
CREATE POLICY org_insert ON public.organizations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY org_select ON public.organizations AS PERMISSIVE FOR SELECT TO authenticated USING ((id IN ( SELECT get_user_organization_ids(auth.uid()) AS get_user_organization_ids)));
CREATE POLICY org_update ON public.organizations AS PERMISSIVE FOR UPDATE TO authenticated USING ((id IN ( SELECT get_user_organization_ids(auth.uid()) AS get_user_organization_ids))) WITH CHECK ((id IN ( SELECT get_user_organization_ids(auth.uid()) AS get_user_organization_ids)));
CREATE POLICY Org members view payment methods ON public.payment_methods AS PERMISSIVE FOR SELECT TO public USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.status = 'active'::text)))));
CREATE POLICY Service role payment_methods ON public.payment_methods AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY payout_executions_service_only ON public.payout_executions AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Org admins can view download logs ON public.payout_file_downloads AS PERMISSIVE FOR SELECT TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY Service role can insert download logs ON public.payout_file_downloads AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY Service role has full access to payout_requests ON public.payout_requests AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_full_access ON public.payout_schedule_runs AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY Ledger isolation ON public.payouts AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Org members can view payouts ON public.payouts AS PERMISSIVE FOR SELECT TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Service role has full access to pending_processor_refunds ON public.pending_processor_refunds AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY Plaid connections via org membership ON public.plaid_connections AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Plaid transactions via org membership ON public.plaid_transactions AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Anyone can view prices ON public.prices AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
CREATE POLICY Service role prices ON public.prices AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY pricing_plans_admin_delete ON public.pricing_plans AS PERMISSIVE FOR DELETE TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY pricing_plans_admin_update ON public.pricing_plans AS PERMISSIVE FOR UPDATE TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY pricing_plans_admin_write ON public.pricing_plans AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY pricing_plans_read_all ON public.pricing_plans AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY Service role processor_webhook_inbox ON public.processor_webhook_inbox AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Ledger isolation ON public.product_splits AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Anyone can view products ON public.products AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
CREATE POLICY Service role products ON public.products AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY projected_transactions_service_all ON public.projected_transactions AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY projected_transactions_user_insert ON public.projected_transactions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY projected_transactions_user_select ON public.projected_transactions AS PERMISSIVE FOR SELECT TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY projected_transactions_user_update ON public.projected_transactions AS PERMISSIVE FOR UPDATE TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid())))) WITH CHECK ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY Service role has full access to race_condition_events ON public.race_condition_events AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY rate_limits_service_only ON public.rate_limits AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Ledger isolation ON public.receipt_rules AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.receipts AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.reconciliation_periods AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.reconciliation_records AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.reconciliation_rules AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY service_role_full_access_recon_runs ON public.reconciliation_runs AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY Ledger isolation ON public.reconciliation_sessions AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Ledger isolation ON public.recurring_expense_templates AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY release_queue_api_key_access ON public.release_queue AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT ledgers.id
   FROM ledgers
  WHERE (ledgers.api_key_hash = ((current_setting('request.headers'::text, true))::json ->> 'x-api-key-hash'::text)))));
CREATE POLICY Ledger isolation ON public.report_exports AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY reserved_slugs_read_all ON public.reserved_slugs AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY authorization_decisions_service_all ON public.risk_evaluations AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authorization_decisions_user_select ON public.risk_evaluations AS PERMISSIVE FOR SELECT TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY service_role_full_access_risk_evaluations ON public.risk_evaluations AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authorization_policies_service_all ON public.risk_policies AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authorization_policies_user_delete ON public.risk_policies AS PERMISSIVE FOR DELETE TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY authorization_policies_user_insert ON public.risk_policies AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY authorization_policies_user_select ON public.risk_policies AS PERMISSIVE FOR SELECT TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY authorization_policies_user_update ON public.risk_policies AS PERMISSIVE FOR UPDATE TO authenticated USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE (om.user_id = auth.uid()))));
CREATE POLICY service_role_full_access_risk_policies ON public.risk_policies AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY Risk score definitions are readable by authenticated users ON public.risk_score_definitions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY Ledger isolation ON public.runway_snapshots AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Only admins can view security alerts ON public.security_alerts AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.user_id = auth.uid()) AND (om.role = 'owner'::text) AND (om.status = 'active'::text)))));
CREATE POLICY Ledger isolation ON public.stripe_account_links AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Service role stripe_balance_snapshots ON public.stripe_balance_snapshots AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Stripe balance snapshots via org membership ON public.stripe_balance_snapshots AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY stripe_accounts_api_key_access ON public.stripe_connected_accounts AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT ledgers.id
   FROM ledgers
  WHERE (ledgers.api_key_hash = ((current_setting('request.headers'::text, true))::json ->> 'x-api-key-hash'::text)))));
CREATE POLICY Service role stripe_events ON public.stripe_events AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Stripe events via org membership ON public.stripe_events AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Service role stripe_transactions ON public.stripe_transactions AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Stripe transactions via org membership ON public.stripe_transactions AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Service role subscription_items ON public.subscription_items AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Org members can view subscriptions ON public.subscriptions AS PERMISSIVE FOR SELECT TO public USING ((organization_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Ledger isolation ON public.tax_buckets AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Tax docs via ledger membership ON public.tax_documents AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Ledger isolation ON public.transactions AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Org members can insert transactions ON public.transactions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))))));
CREATE POLICY Org members can view transactions ON public.transactions AS PERMISSIVE FOR SELECT TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Ledger isolation ON public.trial_balance_snapshots AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));
CREATE POLICY Org members view aggregates ON public.usage_aggregates AS PERMISSIVE FOR SELECT TO public USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.status = 'active'::text)))));
CREATE POLICY Service role usage_aggregates ON public.usage_aggregates AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Org members view usage ON public.usage_records AS PERMISSIVE FOR SELECT TO public USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.status = 'active'::text)))));
CREATE POLICY Service role usage_records ON public.usage_records AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Users can update own profile ON public.user_profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));
CREATE POLICY Users can view own profile ON public.user_profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));
CREATE POLICY Service role insert access ON public.vault_access_log AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY Service role read access ON public.vault_access_log AS PERMISSIVE FOR SELECT TO service_role USING (true);
CREATE POLICY ventures_api_key_access ON public.ventures AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT ledgers.id
   FROM ledgers
  WHERE (ledgers.api_key_hash = ((current_setting('request.headers'::text, true))::json ->> 'x-api-key-hash'::text)))));
CREATE POLICY Webhook deliveries via org membership ON public.webhook_deliveries AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY Webhook endpoints via org membership ON public.webhook_endpoints AS PERMISSIVE FOR ALL TO public USING ((ledger_id IN ( SELECT l.id
   FROM (ledgers l
     JOIN organization_members om ON ((om.organization_id = l.organization_id)))
  WHERE ((om.user_id = auth.uid()) AND (om.status = 'active'::text)))));
CREATE POLICY webhook_events_service_only ON public.webhook_events AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY Ledger isolation ON public.withholding_rules AS PERMISSIVE FOR ALL TO public USING ((ledger_id = (current_setting('app.current_ledger_id'::text, true))::uuid));

-- ============================================
-- GRANTS
-- ============================================
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.accounting_periods TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.accounting_periods TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.accounting_periods TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.accounts TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.accounts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.accounts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.adjustment_journals TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.adjustment_journals TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.adjustment_journals TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.alert_configurations TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.alert_configurations TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.alert_configurations TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.alert_history TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.alert_history TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.alert_history TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_key_scopes TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_key_scopes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_key_scopes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_keys TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_keys TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.api_keys TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_log TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_log TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_log TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_log_archive TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_log_archive TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_log_archive TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_sensitive_fields TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_sensitive_fields TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.audit_sensitive_fields TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.authorizing_instruments TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.authorizing_instruments TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.authorizing_instruments TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.auto_match_rules TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.auto_match_rules TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.auto_match_rules TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_accounts TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_accounts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_accounts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_connections TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_connections TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_connections TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_statement_lines TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_statement_lines TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_statement_lines TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_statements TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_statements TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_statements TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_transactions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_transactions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bank_transactions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.billing_events TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.billing_events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.billing_events TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.billing_overage_charges TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.billing_overage_charges TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.billing_overage_charges TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.budget_envelopes TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.budget_envelopes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.budget_envelopes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.checkout_sessions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.checkout_sessions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.checkout_sessions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.compliance_access_patterns TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.compliance_access_patterns TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.compliance_access_patterns TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.compliance_financial_activity TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.compliance_financial_activity TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.compliance_financial_activity TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.compliance_security_summary TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.compliance_security_summary TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.compliance_security_summary TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.connected_accounts TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.connected_accounts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.connected_accounts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.contractor_payments TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.contractor_payments TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.contractor_payments TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.contractors TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.contractors TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.contractors TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.creator_payout_summaries TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.creator_payout_summaries TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.creator_payout_summaries TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.creator_tiers TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.creator_tiers TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.creator_tiers TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.cron_jobs TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.cron_jobs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.cron_jobs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.drift_alerts TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.drift_alerts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.drift_alerts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.email_log TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.email_log TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.email_log TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.entries TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.entries TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.entries TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.escrow_releases TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.escrow_releases TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.escrow_releases TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.expense_attachments TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.expense_attachments TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.expense_attachments TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.expense_categories TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.expense_categories TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.expense_categories TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.health_check_results TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.health_check_results TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.health_check_results TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.held_funds TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.held_funds TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.held_funds TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.held_funds_summary TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.held_funds_summary TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.held_funds_summary TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.idempotency_keys TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.idempotency_keys TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.idempotency_keys TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.import_templates TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.import_templates TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.import_templates TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.internal_transfers TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.internal_transfers TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.internal_transfers TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.invoice_payments TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.invoice_payments TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.invoice_payments TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.invoices TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.invoices TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.invoices TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ledgers TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ledgers TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ledgers TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.mileage_entries TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.mileage_entries TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.mileage_entries TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.nacha_files TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.nacha_files TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.nacha_files TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notifications TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notifications TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notifications TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.opening_balances TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.opening_balances TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.opening_balances TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_monitor_runs TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_monitor_runs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_monitor_runs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_invitations TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_invitations TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_invitations TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_invites TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_invites TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_invites TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_members TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_members TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_members TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_plan_status TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_plan_status TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_plan_status TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organizations TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organizations TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organizations TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.orphaned_transactions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.orphaned_transactions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.orphaned_transactions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payment_methods TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payment_methods TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payment_methods TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_executions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_executions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_executions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_file_downloads TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_file_downloads TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_file_downloads TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_requests TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_requests TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_requests TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_schedule_runs TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_schedule_runs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payout_schedule_runs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payouts TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payouts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payouts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pending_processor_refunds TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pending_processor_refunds TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pending_processor_refunds TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.plaid_connections TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.plaid_connections TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.plaid_connections TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.plaid_transactions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.plaid_transactions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.plaid_transactions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.prices TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.prices TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.prices TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pricing_plans TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pricing_plans TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pricing_plans TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.processor_webhook_inbox TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.processor_webhook_inbox TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.processor_webhook_inbox TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.product_splits TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.product_splits TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.product_splits TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.products TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.products TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.products TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.projected_transactions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.projected_transactions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.projected_transactions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.race_condition_events TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.race_condition_events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.race_condition_events TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.rate_limits TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.rate_limits TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.rate_limits TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.receipt_rules TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.receipt_rules TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.receipt_rules TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.receipts TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.receipts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.receipts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_periods TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_periods TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_periods TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_records TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_records TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_records TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_rules TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_rules TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_rules TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_runs TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_runs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_runs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_sessions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_sessions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_sessions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_summary TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_summary TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reconciliation_summary TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.recurring_expense_templates TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.recurring_expense_templates TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.recurring_expense_templates TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.release_queue TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.release_queue TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.release_queue TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.report_exports TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.report_exports TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.report_exports TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reserved_slugs TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reserved_slugs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reserved_slugs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.risk_evaluations TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.risk_policies TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.risk_score_definitions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.risk_score_definitions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.risk_score_definitions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.runway_snapshots TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.runway_snapshots TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.runway_snapshots TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_alerts TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_alerts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_alerts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_dashboard TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_dashboard TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_dashboard TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_events_hourly TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_events_hourly TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_events_hourly TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_summary_hourly TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_summary_hourly TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_summary_hourly TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_top_offending_ips TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_top_offending_ips TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_top_offending_ips TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_account_links TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_account_links TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_account_links TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_balance_snapshots TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_balance_snapshots TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_balance_snapshots TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_connected_accounts TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_connected_accounts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_connected_accounts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_events TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_events TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_fee_reconciliation_status TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_fee_reconciliation_status TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_fee_reconciliation_status TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_transactions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_transactions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stripe_transactions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscription_items TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscription_items TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscription_items TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscriptions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscriptions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscriptions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tax_buckets TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tax_buckets TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tax_buckets TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tax_documents TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tax_documents TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tax_documents TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transactions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transactions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transactions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transactions_needing_fee_reconciliation TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transactions_needing_fee_reconciliation TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transactions_needing_fee_reconciliation TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transactions_pending_reference_cleanup TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transactions_pending_reference_cleanup TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transactions_pending_reference_cleanup TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.trial_balance_snapshots TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.trial_balance_snapshots TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.trial_balance_snapshots TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.usage_aggregates TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.usage_aggregates TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.usage_aggregates TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.usage_records TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.usage_records TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.usage_records TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_profiles TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_profiles TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_profiles TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.v_payout_reconciliation TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.v_payout_reconciliation TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.v_payout_reconciliation TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.vault_access_log TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.vault_access_log TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.vault_access_log TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ventures TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ventures TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ventures TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_deliveries TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_deliveries TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_deliveries TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_endpoints TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_endpoints TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_endpoints TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_events TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.webhook_events TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.withholding_rules TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.withholding_rules TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.withholding_rules TO service_role;

GRANT EXECUTE ON FUNCTION public.account_balances_as_of TO anon;
GRANT EXECUTE ON FUNCTION public.account_balances_as_of TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_balances_as_of TO service_role;
GRANT EXECUTE ON FUNCTION public.account_balances_for_period TO anon;
GRANT EXECUTE ON FUNCTION public.account_balances_for_period TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_balances_for_period TO service_role;
GRANT EXECUTE ON FUNCTION public.aggregate_daily_usage TO anon;
GRANT EXECUTE ON FUNCTION public.aggregate_daily_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_daily_usage TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_dispute_hold TO anon;
GRANT EXECUTE ON FUNCTION public.apply_dispute_hold TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_dispute_hold TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_withholding_to_sale TO anon;
GRANT EXECUTE ON FUNCTION public.apply_withholding_to_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_withholding_to_sale TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_create_ledger_accounts TO anon;
GRANT EXECUTE ON FUNCTION public.auto_create_ledger_accounts TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_create_ledger_accounts TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_lines TO anon;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_lines TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_lines TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_transaction TO anon;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_transaction TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_match_plaid_transaction TO anon;
GRANT EXECUTE ON FUNCTION public.auto_match_plaid_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_match_plaid_transaction TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_promote_creators TO anon;
GRANT EXECUTE ON FUNCTION public.auto_promote_creators TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_creators TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_release_ready_funds TO anon;
GRANT EXECUTE ON FUNCTION public.auto_release_ready_funds TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_release_ready_funds TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_1099_totals TO anon;
GRANT EXECUTE ON FUNCTION public.calculate_1099_totals TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_1099_totals TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_runway TO anon;
GRANT EXECUTE ON FUNCTION public.calculate_runway TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_runway TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_sale_split TO anon;
GRANT EXECUTE ON FUNCTION public.calculate_sale_split TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_sale_split TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_split TO anon;
GRANT EXECUTE ON FUNCTION public.calculate_split TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_split TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_trial_balance TO anon;
GRANT EXECUTE ON FUNCTION public.calculate_trial_balance TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_trial_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.can_add_ledger TO anon;
GRANT EXECUTE ON FUNCTION public.can_add_ledger TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_add_ledger TO service_role;
GRANT EXECUTE ON FUNCTION public.can_org_create_ledger TO anon;
GRANT EXECUTE ON FUNCTION public.can_org_create_ledger TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_org_create_ledger TO service_role;
GRANT EXECUTE ON FUNCTION public.check_auto_match_conditions TO anon;
GRANT EXECUTE ON FUNCTION public.check_auto_match_conditions TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_auto_match_conditions TO service_role;
GRANT EXECUTE ON FUNCTION public.check_balance_equation TO anon;
GRANT EXECUTE ON FUNCTION public.check_balance_equation TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_balance_equation TO service_role;
GRANT EXECUTE ON FUNCTION public.check_balance_invariants TO anon;
GRANT EXECUTE ON FUNCTION public.check_balance_invariants TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_balance_invariants TO service_role;
GRANT EXECUTE ON FUNCTION public.check_double_entry_balance TO anon;
GRANT EXECUTE ON FUNCTION public.check_double_entry_balance TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_double_entry_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.check_no_duplicate_references TO anon;
GRANT EXECUTE ON FUNCTION public.check_no_duplicate_references TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_no_duplicate_references TO service_role;
GRANT EXECUTE ON FUNCTION public.check_period_lock TO anon;
GRANT EXECUTE ON FUNCTION public.check_period_lock TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_period_lock TO service_role;
GRANT EXECUTE ON FUNCTION public.check_period_not_closed TO anon;
GRANT EXECUTE ON FUNCTION public.check_period_not_closed TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_period_not_closed TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_context TO anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_context TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_context TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_secure TO anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_secure TO service_role;
GRANT EXECUTE ON FUNCTION public.check_usage_limits TO anon;
GRANT EXECUTE ON FUNCTION public.check_usage_limits TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_usage_limits TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_overage_billing_charge TO anon;
GRANT EXECUTE ON FUNCTION public.claim_overage_billing_charge TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_overage_billing_charge TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_processor_webhook_inbox TO anon;
GRANT EXECUTE ON FUNCTION public.claim_processor_webhook_inbox TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_processor_webhook_inbox TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_audit_log TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_audit_log TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_authorization_decisions TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_authorization_decisions TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_authorization_decisions TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_nacha_files TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_nacha_files TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_nacha_files TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_ledger_data TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_creator_split TO anon;
GRANT EXECUTE ON FUNCTION public.clear_creator_split TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_creator_split TO service_role;
GRANT EXECUTE ON FUNCTION public.close_accounting_period TO anon;
GRANT EXECUTE ON FUNCTION public.close_accounting_period TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_accounting_period TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_fund_release TO anon;
GRANT EXECUTE ON FUNCTION public.complete_fund_release TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_fund_release TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_release TO anon;
GRANT EXECUTE ON FUNCTION public.complete_release TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_release TO service_role;
GRANT EXECUTE ON FUNCTION public.create_audit_entry TO anon;
GRANT EXECUTE ON FUNCTION public.create_audit_entry TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_audit_entry TO service_role;
GRANT EXECUTE ON FUNCTION public.create_ledger_for_organization TO anon;
GRANT EXECUTE ON FUNCTION public.create_ledger_for_organization TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_ledger_for_organization TO service_role;
GRANT EXECUTE ON FUNCTION public.create_notification TO anon;
GRANT EXECUTE ON FUNCTION public.create_notification TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification TO service_role;
GRANT EXECUTE ON FUNCTION public.create_organization_for_user TO anon;
GRANT EXECUTE ON FUNCTION public.create_organization_for_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_for_user TO service_role;
GRANT EXECUTE, EXECUTE ON FUNCTION public.create_organization_with_ledger TO anon;
GRANT EXECUTE, EXECUTE ON FUNCTION public.create_organization_with_ledger TO authenticated;
GRANT EXECUTE, EXECUTE ON FUNCTION public.create_organization_with_ledger TO service_role;
GRANT EXECUTE ON FUNCTION public.create_trial_balance_snapshot TO anon;
GRANT EXECUTE ON FUNCTION public.create_trial_balance_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trial_balance_snapshot TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_creator_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.delete_creator_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_creator_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_audit_gaps TO anon;
GRANT EXECUTE ON FUNCTION public.detect_audit_gaps TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_audit_gaps TO service_role;
GRANT EXECUTE ON FUNCTION public.diagnose_balance_sheet TO anon;
GRANT EXECUTE ON FUNCTION public.diagnose_balance_sheet TO authenticated;
GRANT EXECUTE ON FUNCTION public.diagnose_balance_sheet TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_ledger_limit TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_ledger_limit TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_ledger_limit TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_member_limit TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_member_limit TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_member_limit TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_wallet_nonnegative_balance TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_wallet_nonnegative_balance TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_wallet_nonnegative_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_pending_projections TO anon;
GRANT EXECUTE ON FUNCTION public.expire_pending_projections TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_projections TO service_role;
GRANT EXECUTE ON FUNCTION public.export_1099_summary TO anon;
GRANT EXECUTE ON FUNCTION public.export_1099_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_1099_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.export_audit_logs TO anon;
GRANT EXECUTE ON FUNCTION public.export_audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_audit_logs TO service_role;
GRANT EXECUTE ON FUNCTION public.export_general_ledger TO anon;
GRANT EXECUTE ON FUNCTION public.export_general_ledger TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_general_ledger TO service_role;
GRANT EXECUTE ON FUNCTION public.export_profit_loss TO anon;
GRANT EXECUTE ON FUNCTION public.export_profit_loss TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_profit_loss TO service_role;
GRANT EXECUTE ON FUNCTION public.export_trial_balance TO anon;
GRANT EXECUTE ON FUNCTION public.export_trial_balance TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_trial_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_fund_release TO anon;
GRANT EXECUTE ON FUNCTION public.fail_fund_release TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_fund_release TO service_role;
GRANT EXECUTE ON FUNCTION public.find_imbalanced_transactions TO anon;
GRANT EXECUTE ON FUNCTION public.find_imbalanced_transactions TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_imbalanced_transactions TO service_role;
GRANT EXECUTE ON FUNCTION public.find_matching_projection TO anon;
GRANT EXECUTE ON FUNCTION public.find_matching_projection TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_matching_projection TO service_role;
GRANT EXECUTE ON FUNCTION public.find_orphaned_entries TO anon;
GRANT EXECUTE ON FUNCTION public.find_orphaned_entries TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_orphaned_entries TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_projection TO anon;
GRANT EXECUTE ON FUNCTION public.fulfill_projection TO authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_projection TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_1099_documents TO anon;
GRANT EXECUTE ON FUNCTION public.generate_1099_documents TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_1099_documents TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_cpa_export TO anon;
GRANT EXECUTE ON FUNCTION public.generate_cpa_export TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_cpa_export TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_instrument_fingerprint TO anon;
GRANT EXECUTE ON FUNCTION public.generate_instrument_fingerprint TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_instrument_fingerprint TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_projection_dates TO anon;
GRANT EXECUTE ON FUNCTION public.generate_projection_dates TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_projection_dates TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_unique_slug TO anon;
GRANT EXECUTE ON FUNCTION public.generate_unique_slug TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_unique_slug TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_webhook_secret TO anon;
GRANT EXECUTE ON FUNCTION public.generate_webhook_secret TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_webhook_secret TO service_role;
GRANT EXECUTE ON FUNCTION public.get_account_balance TO anon;
GRANT EXECUTE ON FUNCTION public.get_account_balance TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.get_account_balances_raw TO anon;
GRANT EXECUTE ON FUNCTION public.get_account_balances_raw TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balances_raw TO service_role;
GRANT EXECUTE ON FUNCTION public.get_active_policies TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_policies TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_policies TO service_role;
GRANT EXECUTE ON FUNCTION public.get_all_account_balances TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_account_balances TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_account_balances TO service_role;
GRANT EXECUTE ON FUNCTION public.get_creator_balances TO anon;
GRANT EXECUTE ON FUNCTION public.get_creator_balances TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_creator_balances TO service_role;
GRANT EXECUTE ON FUNCTION public.get_creators_for_statements TO anon;
GRANT EXECUTE ON FUNCTION public.get_creators_for_statements TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_creators_for_statements TO service_role;
GRANT EXECUTE ON FUNCTION public.get_current_period_usage TO anon;
GRANT EXECUTE ON FUNCTION public.get_current_period_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_period_usage TO service_role;
GRANT EXECUTE ON FUNCTION public.get_deadlock_count TO anon;
GRANT EXECUTE ON FUNCTION public.get_deadlock_count TO service_role;
GRANT EXECUTE ON FUNCTION public.get_default_settings TO anon;
GRANT EXECUTE ON FUNCTION public.get_default_settings TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_default_settings TO service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_split TO anon;
GRANT EXECUTE ON FUNCTION public.get_effective_split TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_split TO service_role;
GRANT EXECUTE ON FUNCTION public.get_escrow_summary TO anon;
GRANT EXECUTE ON FUNCTION public.get_escrow_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_escrow_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.get_held_funds_dashboard TO anon;
GRANT EXECUTE ON FUNCTION public.get_held_funds_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_held_funds_dashboard TO service_role;
GRANT EXECUTE ON FUNCTION public.get_held_funds_summary TO anon;
GRANT EXECUTE ON FUNCTION public.get_held_funds_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_held_funds_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.get_lock_wait_count TO anon;
GRANT EXECUTE ON FUNCTION public.get_lock_wait_count TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_account TO anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_account TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_ledger_account TO anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_ledger_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_ledger_account TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_reserve_account TO anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_reserve_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_reserve_account TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_webhooks TO anon;
GRANT EXECUTE ON FUNCTION public.get_pending_webhooks TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_webhooks TO service_role;
GRANT EXECUTE ON FUNCTION public.get_plaid_token_from_vault TO anon;
GRANT EXECUTE ON FUNCTION public.get_plaid_token_from_vault TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plaid_token_from_vault TO service_role;
GRANT EXECUTE ON FUNCTION public.get_processor_secret_key_from_vault TO anon;
GRANT EXECUTE ON FUNCTION public.get_processor_secret_key_from_vault TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_processor_secret_key_from_vault TO service_role;
GRANT EXECUTE ON FUNCTION public.get_quick_health_status TO anon;
GRANT EXECUTE ON FUNCTION public.get_quick_health_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quick_health_status TO service_role;
GRANT EXECUTE ON FUNCTION public.get_rate_limit_offenders TO anon;
GRANT EXECUTE ON FUNCTION public.get_rate_limit_offenders TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rate_limit_offenders TO service_role;
GRANT EXECUTE ON FUNCTION public.get_role_permissions TO anon;
GRANT EXECUTE ON FUNCTION public.get_role_permissions TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_permissions TO service_role;
GRANT EXECUTE ON FUNCTION public.get_stripe_reconciliation_summary TO anon;
GRANT EXECUTE ON FUNCTION public.get_stripe_reconciliation_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stripe_reconciliation_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.get_stripe_secret_key_from_vault TO anon;
GRANT EXECUTE ON FUNCTION public.get_stripe_secret_key_from_vault TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stripe_secret_key_from_vault TO service_role;
GRANT EXECUTE ON FUNCTION public.get_stripe_webhook_secret_from_vault TO anon;
GRANT EXECUTE ON FUNCTION public.get_stripe_webhook_secret_from_vault TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stripe_webhook_secret_from_vault TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_organization TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization_ids TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_organization_ids TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization_ids TO service_role;
GRANT EXECUTE ON FUNCTION public.get_webhook_endpoint_safe TO anon;
GRANT EXECUTE ON FUNCTION public.get_webhook_endpoint_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_webhook_endpoint_safe TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_organization_delete TO anon;
GRANT EXECUTE ON FUNCTION public.handle_organization_delete TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_organization_delete TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_organization_slug TO anon;
GRANT EXECUTE ON FUNCTION public.handle_organization_slug TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_organization_slug TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_plan_change TO anon;
GRANT EXECUTE ON FUNCTION public.handle_plan_change TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_plan_change TO service_role;
GRANT EXECUTE ON FUNCTION public.hash_api_key TO anon;
GRANT EXECUTE ON FUNCTION public.hash_api_key TO authenticated;
GRANT EXECUTE ON FUNCTION public.hash_api_key TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_default_tiers TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_default_tiers TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_default_tiers TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_expense_accounts TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_expense_accounts TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_expense_categories TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_expense_categories TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_ledger_accounts TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_ledger_accounts TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_ledger_accounts TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_marketplace_accounts TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_marketplace_accounts TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_marketplace_accounts TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_receipt_rules TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_receipt_rules TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_receipt_rules TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_standard_accounts TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_standard_accounts TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_standard_accounts TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_tax_buckets TO anon;
GRANT EXECUTE ON FUNCTION public.initialize_tax_buckets TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_tax_buckets TO service_role;
GRANT EXECUTE ON FUNCTION public.is_authorization_valid TO anon;
GRANT EXECUTE ON FUNCTION public.is_authorization_valid TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_authorization_valid TO service_role;
GRANT EXECUTE ON FUNCTION public.is_marketplace_ledger TO anon;
GRANT EXECUTE ON FUNCTION public.is_marketplace_ledger TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_marketplace_ledger TO service_role;
GRANT EXECUTE ON FUNCTION public.is_period_closed TO anon;
GRANT EXECUTE ON FUNCTION public.is_period_closed TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_period_closed TO service_role;
GRANT EXECUTE ON FUNCTION public.is_standard_ledger TO anon;
GRANT EXECUTE ON FUNCTION public.is_standard_ledger TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_standard_ledger TO service_role;
GRANT EXECUTE ON FUNCTION public.is_valid_uuid TO anon;
GRANT EXECUTE ON FUNCTION public.is_valid_uuid TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_uuid TO service_role;
GRANT EXECUTE ON FUNCTION public.log_security_event TO anon;
GRANT EXECUTE ON FUNCTION public.log_security_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event TO service_role;
GRANT EXECUTE ON FUNCTION public.log_service_role_access TO anon;
GRANT EXECUTE ON FUNCTION public.log_service_role_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_service_role_access TO service_role;
GRANT EXECUTE ON FUNCTION public.manual_match_transaction TO anon;
GRANT EXECUTE ON FUNCTION public.manual_match_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_match_transaction TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_entry_held TO anon;
GRANT EXECUTE ON FUNCTION public.mark_entry_held TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_entry_held TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_webhook_delivered TO anon;
GRANT EXECUTE ON FUNCTION public.mark_webhook_delivered TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_webhook_delivered TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_webhook_failed TO anon;
GRANT EXECUTE ON FUNCTION public.mark_webhook_failed TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_webhook_failed TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_organization_settings_key TO anon;
GRANT EXECUTE ON FUNCTION public.merge_organization_settings_key TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_organization_settings_key TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_audit_log_modification TO anon;
GRANT EXECUTE ON FUNCTION public.prevent_audit_log_modification TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_audit_log_modification TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_instrument_update TO anon;
GRANT EXECUTE ON FUNCTION public.prevent_instrument_update TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_instrument_update TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_linked_instrument_delete TO anon;
GRANT EXECUTE ON FUNCTION public.prevent_linked_instrument_delete TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_linked_instrument_delete TO service_role;
GRANT EXECUTE ON FUNCTION public.process_automatic_releases TO anon;
GRANT EXECUTE ON FUNCTION public.process_automatic_releases TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_automatic_releases TO service_role;
GRANT EXECUTE ON FUNCTION public.process_payout_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.process_payout_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_payout_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.process_processor_refund TO anon;
GRANT EXECUTE ON FUNCTION public.process_processor_refund TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_processor_refund TO service_role;
GRANT EXECUTE ON FUNCTION public.process_stripe_refund TO anon;
GRANT EXECUTE ON FUNCTION public.process_stripe_refund TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_stripe_refund TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_auto_releases TO anon;
GRANT EXECUTE ON FUNCTION public.queue_auto_releases TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_auto_releases TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_webhook TO anon;
GRANT EXECUTE ON FUNCTION public.queue_webhook TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_webhook TO service_role;
GRANT EXECUTE ON FUNCTION public.receive_payment_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.receive_payment_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_payment_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.record_api_usage TO anon;
GRANT EXECUTE ON FUNCTION public.record_api_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_api_usage TO service_role;
GRANT EXECUTE ON FUNCTION public.record_bill_payment_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.record_bill_payment_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_bill_payment_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic_v2 TO anon;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic_v2 TO service_role;
GRANT EXECUTE ON FUNCTION public.record_sale_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.record_sale_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sale_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.record_transaction_usage TO anon;
GRANT EXECUTE ON FUNCTION public.record_transaction_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_transaction_usage TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_dispute_lifecycle TO anon;
GRANT EXECUTE ON FUNCTION public.refresh_dispute_lifecycle TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dispute_lifecycle TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_payout_lifecycle TO anon;
GRANT EXECUTE ON FUNCTION public.refresh_payout_lifecycle TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_payout_lifecycle TO service_role;
GRANT EXECUTE ON FUNCTION public.register_connected_account TO anon;
GRANT EXECUTE ON FUNCTION public.register_connected_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_connected_account TO service_role;
GRANT EXECUTE ON FUNCTION public.release_held_funds TO anon;
GRANT EXECUTE ON FUNCTION public.release_held_funds TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_held_funds TO service_role;
GRANT EXECUTE ON FUNCTION public.request_fund_release TO anon;
GRANT EXECUTE ON FUNCTION public.request_fund_release TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_fund_release TO service_role;
GRANT EXECUTE ON FUNCTION public.request_release TO anon;
GRANT EXECUTE ON FUNCTION public.request_release TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_release TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_stripe_fee_fetch TO anon;
GRANT EXECUTE ON FUNCTION public.retry_stripe_fee_fetch TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_stripe_fee_fetch TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_webhook_secret TO anon;
GRANT EXECUTE ON FUNCTION public.rotate_webhook_secret TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_webhook_secret TO service_role;
GRANT EXECUTE ON FUNCTION public.run_all_health_checks TO anon;
GRANT EXECUTE ON FUNCTION public.run_all_health_checks TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_all_health_checks TO service_role;
GRANT EXECUTE ON FUNCTION public.run_audit_chain_verification TO anon;
GRANT EXECUTE ON FUNCTION public.run_audit_chain_verification TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_audit_chain_verification TO service_role;
GRANT EXECUTE, EXECUTE ON FUNCTION public.run_ledger_health_check TO anon;
GRANT EXECUTE ON FUNCTION public.run_ledger_health_check TO authenticated;
GRANT EXECUTE, EXECUTE ON FUNCTION public.run_ledger_health_check TO service_role;
GRANT EXECUTE ON FUNCTION public.run_money_invariants TO anon;
GRANT EXECUTE ON FUNCTION public.run_money_invariants TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_money_invariants TO service_role;
GRANT EXECUTE ON FUNCTION public.safe_void_invoice TO anon;
GRANT EXECUTE ON FUNCTION public.safe_void_invoice TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_void_invoice TO service_role;
GRANT EXECUTE ON FUNCTION public.send_invoice_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.send_invoice_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_invoice_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.set_creator_split TO anon;
GRANT EXECUTE ON FUNCTION public.set_creator_split TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_creator_split TO service_role;
GRANT EXECUTE ON FUNCTION public.set_creator_tier TO anon;
GRANT EXECUTE ON FUNCTION public.set_creator_tier TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_creator_tier TO service_role;
GRANT EXECUTE ON FUNCTION public.set_default_settings TO anon;
GRANT EXECUTE ON FUNCTION public.set_default_settings TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_settings TO service_role;
GRANT EXECUTE ON FUNCTION public.should_trigger_breach_alert TO anon;
GRANT EXECUTE ON FUNCTION public.should_trigger_breach_alert TO authenticated;
GRANT EXECUTE ON FUNCTION public.should_trigger_breach_alert TO service_role;
GRANT EXECUTE ON FUNCTION public.store_bank_aggregator_token_in_vault TO anon;
GRANT EXECUTE ON FUNCTION public.store_bank_aggregator_token_in_vault TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_bank_aggregator_token_in_vault TO service_role;
GRANT EXECUTE ON FUNCTION public.store_processor_secret_key_in_vault TO anon;
GRANT EXECUTE ON FUNCTION public.store_processor_secret_key_in_vault TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_processor_secret_key_in_vault TO service_role;
GRANT EXECUTE ON FUNCTION public.store_processor_webhook_secret_in_vault TO anon;
GRANT EXECUTE ON FUNCTION public.store_processor_webhook_secret_in_vault TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_processor_webhook_secret_in_vault TO service_role;
GRANT EXECUTE ON FUNCTION public.store_stripe_secret_key_in_vault TO anon;
GRANT EXECUTE ON FUNCTION public.store_stripe_secret_key_in_vault TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_stripe_secret_key_in_vault TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_connected_account_status TO anon;
GRANT EXECUTE ON FUNCTION public.sync_connected_account_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_connected_account_status TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_subscription_from_stripe TO anon;
GRANT EXECUTE ON FUNCTION public.sync_subscription_from_stripe TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_subscription_from_stripe TO service_role;
GRANT EXECUTE ON FUNCTION public.track_transaction_usage TO anon;
GRANT EXECUTE ON FUNCTION public.track_transaction_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_transaction_usage TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_audit_log_chain_hash_fn TO anon;
GRANT EXECUTE ON FUNCTION public.trg_audit_log_chain_hash_fn TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_audit_log_chain_hash_fn TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_audit_log_immutable_fn TO anon;
GRANT EXECUTE ON FUNCTION public.trg_audit_log_immutable_fn TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_audit_log_immutable_fn TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_entries_immutability_fn TO anon;
GRANT EXECUTE ON FUNCTION public.trg_entries_immutability_fn TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_entries_immutability_fn TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_payout_negative_balance_guard_fn TO anon;
GRANT EXECUTE ON FUNCTION public.trg_payout_negative_balance_guard_fn TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_payout_negative_balance_guard_fn TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_match_stripe_payout TO anon;
GRANT EXECUTE ON FUNCTION public.trigger_match_stripe_payout TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_match_stripe_payout TO service_role;
GRANT EXECUTE ON FUNCTION public.unmatch_transaction TO anon;
GRANT EXECUTE ON FUNCTION public.unmatch_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmatch_transaction TO service_role;
GRANT EXECUTE ON FUNCTION public.update_account_balance TO anon;
GRANT EXECUTE ON FUNCTION public.update_account_balance TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_account_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.update_contractor_ytd TO anon;
GRANT EXECUTE ON FUNCTION public.update_contractor_ytd TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_contractor_ytd TO service_role;
GRANT EXECUTE ON FUNCTION public.update_org_ledger_count TO anon;
GRANT EXECUTE ON FUNCTION public.update_org_ledger_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_org_ledger_count TO service_role;
GRANT EXECUTE ON FUNCTION public.update_org_member_count TO anon;
GRANT EXECUTE ON FUNCTION public.update_org_member_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_org_member_count TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at TO anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_permission TO anon;
GRANT EXECUTE ON FUNCTION public.user_has_permission TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_api_key_secure TO anon;
GRANT EXECUTE ON FUNCTION public.validate_api_key_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_api_key_secure TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_double_entry TO anon;
GRANT EXECUTE ON FUNCTION public.validate_double_entry TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_double_entry TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_double_entry_at_commit TO anon;
GRANT EXECUTE ON FUNCTION public.validate_double_entry_at_commit TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_double_entry_at_commit TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_double_entry_on_delete TO anon;
GRANT EXECUTE ON FUNCTION public.validate_double_entry_on_delete TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_double_entry_on_delete TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_webhook_signature TO anon;
GRANT EXECUTE ON FUNCTION public.validate_webhook_signature TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_webhook_signature TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain TO anon;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_ledger_balanced TO anon;
GRANT EXECUTE ON FUNCTION public.verify_ledger_balanced TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_ledger_balanced TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_ledger_integrity TO anon;
GRANT EXECUTE ON FUNCTION public.verify_ledger_integrity TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_ledger_integrity TO service_role;
GRANT EXECUTE ON FUNCTION public.void_invoice_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.void_invoice_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_invoice_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_deposit_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.wallet_deposit_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_transfer_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.wallet_transfer_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_withdraw_atomic TO anon;
GRANT EXECUTE ON FUNCTION public.wallet_withdraw_atomic TO service_role;

-- ============================================
-- VIEWS
-- ============================================
CREATE OR REPLACE VIEW public.compliance_access_patterns AS
 SELECT COALESCE((ip_address)::text, 'unknown'::text) AS ip_address,
    date_trunc('hour'::text, created_at) AS hour,
    count(*) AS request_count,
    count(DISTINCT ledger_id) AS ledgers_accessed,
    count(DISTINCT action) AS unique_actions,
    array_agg(DISTINCT action) AS actions,
    max(risk_score) AS max_risk_score,
    count(*) FILTER (WHERE (action = 'auth_failed'::text)) AS failed_auths
   FROM audit_log
  WHERE (created_at > (now() - '24:00:00'::interval))
  GROUP BY ip_address, (date_trunc('hour'::text, created_at))
 HAVING ((count(*) > 10) OR (count(*) FILTER (WHERE (action = 'auth_failed'::text)) > 3));;

CREATE OR REPLACE VIEW public.compliance_financial_activity AS
 SELECT date_trunc('day'::text, created_at) AS date,
    ledger_id,
    count(*) FILTER (WHERE (action = 'payout_initiated'::text)) AS payouts_initiated,
    count(*) FILTER (WHERE (action = 'payout_completed'::text)) AS payouts_completed,
    count(*) FILTER (WHERE (action = 'payout_failed'::text)) AS payouts_failed,
    count(*) FILTER (WHERE (action = 'nacha_generated'::text)) AS nacha_files_generated,
    count(*) FILTER (WHERE (action = ANY (ARRAY['sale'::text, 'record_sale'::text]))) AS sales_recorded,
    count(*) FILTER (WHERE (action = ANY (ARRAY['refund'::text, 'record_refund'::text]))) AS refunds_recorded
   FROM audit_log
  WHERE ((created_at > (now() - '90 days'::interval)) AND (action = ANY (ARRAY['payout_initiated'::text, 'payout_completed'::text, 'payout_failed'::text, 'nacha_generated'::text, 'sale'::text, 'record_sale'::text, 'refund'::text, 'record_refund'::text])))
  GROUP BY (date_trunc('day'::text, created_at)), ledger_id;;

CREATE OR REPLACE VIEW public.compliance_security_summary AS
 SELECT date_trunc('day'::text, created_at) AS date,
    action,
    count(*) AS event_count,
    count(DISTINCT ip_address) AS unique_ips,
    count(DISTINCT COALESCE(actor_id, 'system'::text)) AS unique_actors,
    (avg(risk_score))::integer AS avg_risk_score,
    max(risk_score) AS max_risk_score,
    count(*) FILTER (WHERE (risk_score >= 70)) AS high_risk_count,
    count(*) FILTER (WHERE (risk_score >= 90)) AS critical_risk_count
   FROM audit_log
  WHERE (created_at > (now() - '30 days'::interval))
  GROUP BY (date_trunc('day'::text, created_at)), action;;

CREATE OR REPLACE VIEW public.held_funds_summary AS
 SELECT hf.ledger_id,
    hf.creator_id,
    COALESCE(wr.rule_type, 'dispute'::text) AS rule_type,
    COALESCE(wr.name, hf.hold_reason) AS rule_name,
    count(*) AS hold_count,
    sum(hf.held_amount) AS total_held,
    sum(hf.released_amount) AS total_released,
    sum((hf.held_amount - hf.released_amount)) AS currently_held,
    min(hf.release_eligible_at) FILTER (WHERE (hf.status = 'held'::text)) AS next_release_date
   FROM (held_funds hf
     LEFT JOIN withholding_rules wr ON ((hf.withholding_rule_id = wr.id)))
  GROUP BY hf.ledger_id, hf.creator_id, COALESCE(wr.rule_type, 'dispute'::text), COALESCE(wr.name, hf.hold_reason);;

CREATE OR REPLACE VIEW public.organization_plan_status AS
 SELECT id,
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
   FROM organizations o;;

CREATE OR REPLACE VIEW public.orphaned_transactions AS
 SELECT t.id,
    t.ledger_id,
    t.reference_id,
    t.amount,
    t.created_at,
    COALESCE(e.entry_count, (0)::bigint) AS entry_count,
    COALESCE(e.total_debits, (0)::numeric) AS total_debits,
    COALESCE(e.total_credits, (0)::numeric) AS total_credits,
        CASE
            WHEN ((e.entry_count IS NULL) OR (e.entry_count = 0)) THEN 'NO_ENTRIES'::text
            WHEN (e.total_debits <> e.total_credits) THEN 'UNBALANCED'::text
            ELSE 'OK'::text
        END AS status
   FROM (transactions t
     LEFT JOIN ( SELECT entries.transaction_id,
            count(*) AS entry_count,
            sum(
                CASE
                    WHEN (entries.entry_type = 'debit'::text) THEN entries.amount
                    ELSE (0)::numeric
                END) AS total_debits,
            sum(
                CASE
                    WHEN (entries.entry_type = 'credit'::text) THEN entries.amount
                    ELSE (0)::numeric
                END) AS total_credits
           FROM entries
          GROUP BY entries.transaction_id) e ON ((e.transaction_id = t.id)))
  WHERE ((e.entry_count IS NULL) OR (e.entry_count = 0) OR (abs((e.total_debits - e.total_credits)) > 0.01));;

CREATE OR REPLACE VIEW public.reconciliation_summary AS
 SELECT bt.ledger_id,
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
  ORDER BY (date_trunc('month'::text, (bt.transaction_date)::timestamp with time zone)) DESC;;

CREATE OR REPLACE VIEW public.security_dashboard AS
 SELECT date_trunc('hour'::text, created_at) AS hour,
    action,
    count(*) AS event_count,
    count(DISTINCT ip_address) AS unique_ips,
    (avg(risk_score))::integer AS avg_risk_score,
    max(risk_score) AS max_risk_score,
    count(*) FILTER (WHERE (risk_score >= 70)) AS high_risk_count
   FROM audit_log
  WHERE (created_at > (now() - '24:00:00'::interval))
  GROUP BY (date_trunc('hour'::text, created_at)), action
  ORDER BY (date_trunc('hour'::text, created_at)) DESC, (count(*)) DESC;;

CREATE OR REPLACE VIEW public.security_events_hourly AS
 SELECT date_trunc('hour'::text, created_at) AS hour,
    action,
    count(*) AS event_count,
    count(DISTINCT ip_address) AS unique_ips,
    avg(risk_score) AS avg_risk_score,
    max(risk_score) AS max_risk_score
   FROM audit_log
  WHERE ((created_at > (now() - '24:00:00'::interval)) AND (action = ANY (ARRAY['auth_failed'::text, 'rate_limited'::text, 'preauth_rate_limited'::text, 'blocked_ip'::text, 'blocked_country'::text, 'ssrf_attempt'::text, 'webhook_invalid_signature'::text, 'webhook_replay_attempt'::text])))
  GROUP BY (date_trunc('hour'::text, created_at)), action
  ORDER BY (date_trunc('hour'::text, created_at)) DESC, (count(*)) DESC;;

CREATE OR REPLACE VIEW public.security_summary_hourly AS
 SELECT ( SELECT count(*) AS count
           FROM audit_log
          WHERE ((audit_log.action = 'auth_failed'::text) AND (audit_log.created_at > (now() - '01:00:00'::interval)))) AS auth_failures,
    ( SELECT count(*) AS count
           FROM audit_log
          WHERE ((audit_log.action = 'rate_limited'::text) AND (audit_log.created_at > (now() - '01:00:00'::interval)))) AS rate_limits,
    ( SELECT count(*) AS count
           FROM audit_log
          WHERE ((audit_log.action = 'preauth_rate_limited'::text) AND (audit_log.created_at > (now() - '01:00:00'::interval)))) AS preauth_rate_limits,
    ( SELECT count(*) AS count
           FROM audit_log
          WHERE ((audit_log.action = 'blocked_country'::text) AND (audit_log.created_at > (now() - '01:00:00'::interval)))) AS geo_blocks,
    ( SELECT count(*) AS count
           FROM audit_log
          WHERE ((audit_log.action = 'ssrf_attempt'::text) AND (audit_log.created_at > (now() - '01:00:00'::interval)))) AS ssrf_attempts,
    ( SELECT count(*) AS count
           FROM audit_log
          WHERE ((audit_log.action = 'webhook_invalid_signature'::text) AND (audit_log.created_at > (now() - '01:00:00'::interval)))) AS invalid_webhooks,
    ( SELECT count(*) AS count
           FROM audit_log
          WHERE ((audit_log.risk_score >= 70) AND (audit_log.created_at > (now() - '01:00:00'::interval)))) AS high_risk_events,
    ( SELECT count(DISTINCT audit_log.ip_address) AS count
           FROM audit_log
          WHERE ((audit_log.action = 'rate_limited'::text) AND (audit_log.created_at > (now() - '01:00:00'::interval)))) AS unique_rate_limited_ips,
    now() AS as_of;;

CREATE OR REPLACE VIEW public.security_top_offending_ips AS
 SELECT ip_address,
    count(*) AS total_events,
    count(DISTINCT action) AS event_types,
    sum(
        CASE
            WHEN (action = 'auth_failed'::text) THEN 1
            ELSE 0
        END) AS auth_failures,
    sum(
        CASE
            WHEN (action = 'rate_limited'::text) THEN 1
            ELSE 0
        END) AS rate_limits,
    sum(
        CASE
            WHEN (action = 'preauth_rate_limited'::text) THEN 1
            ELSE 0
        END) AS preauth_rate_limits,
    sum(
        CASE
            WHEN (action = 'ssrf_attempt'::text) THEN 1
            ELSE 0
        END) AS ssrf_attempts,
    max(risk_score) AS max_risk_score,
    min(created_at) AS first_seen,
    max(created_at) AS last_seen
   FROM audit_log
  WHERE ((created_at > (now() - '24:00:00'::interval)) AND (ip_address IS NOT NULL) AND (risk_score > 0))
  GROUP BY ip_address
 HAVING (count(*) >= 5)
  ORDER BY (count(*)) DESC, (max(risk_score)) DESC
 LIMIT 100;;

CREATE OR REPLACE VIEW public.stripe_fee_reconciliation_status AS
 SELECT l.id AS ledger_id,
    l.business_name,
    count(*) AS total_transactions,
    sum(
        CASE
            WHEN (st.fee_estimated = true) THEN 1
            ELSE 0
        END) AS estimated_fee_count,
    round((((sum(
        CASE
            WHEN (st.fee_estimated = true) THEN 1
            ELSE 0
        END))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 2) AS estimated_fee_percent,
    sum(st.fee) AS total_fees,
    sum(
        CASE
            WHEN (st.fee_estimated = true) THEN st.fee
            ELSE (0)::numeric
        END) AS estimated_fee_amount
   FROM (stripe_transactions st
     JOIN ledgers l ON ((l.id = st.ledger_id)))
  WHERE (st.created_at > (now() - '7 days'::interval))
  GROUP BY l.id, l.business_name
 HAVING (count(*) >= 5)
  ORDER BY (round((((sum(
        CASE
            WHEN (st.fee_estimated = true) THEN 1
            ELSE 0
        END))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 2)) DESC NULLS LAST;;

CREATE OR REPLACE VIEW public.transactions_needing_fee_reconciliation AS
 SELECT st.id,
    st.ledger_id,
    st.stripe_id,
    st.stripe_type,
    st.amount,
    st.fee,
    st.fee_estimate_reason,
    st.created_at,
    l.business_name
   FROM (stripe_transactions st
     JOIN ledgers l ON ((l.id = st.ledger_id)))
  WHERE ((st.fee_estimated = true) AND (st.created_at > (now() - '30 days'::interval)))
  ORDER BY st.created_at DESC;;

CREATE OR REPLACE VIEW public.transactions_pending_reference_cleanup AS
 SELECT l.business_name,
    count(*) AS transaction_count,
    min(t.created_at) AS oldest_transaction,
    max(t.created_at) AS newest_transaction
   FROM (transactions t
     JOIN ledgers l ON ((l.id = t.ledger_id)))
  WHERE ((t.created_at < (now() - '365 days'::interval)) AND (t.reference_id IS NOT NULL) AND (t.reference_id !~~ 'archived_%'::text))
  GROUP BY l.id, l.business_name
  ORDER BY (count(*)) DESC;;

CREATE OR REPLACE VIEW public.v_payout_reconciliation AS
 SELECT l.id AS ledger_id,
    l.business_name,
    st.id AS stripe_txn_id,
    st.stripe_id AS payout_id,
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
   FROM ((stripe_transactions st
     JOIN ledgers l ON ((st.ledger_id = l.id)))
     LEFT JOIN plaid_transactions pt ON ((st.bank_transaction_id = pt.id)))
  WHERE ((st.stripe_type = 'payout'::text) AND (st.status = 'paid'::text))
  ORDER BY st.created_at DESC;;


COMMIT;