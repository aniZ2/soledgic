-- Drop 90 dead RPCs: zero application code references, no internal SQL dependencies.
-- Verified: none are called by active triggers, RLS policies, views, or other live RPCs.
-- Uses IF EXISTS + CASCADE for safety.

BEGIN;

-- ============================================================
-- Stripe remnants (processor fully removed from codebase)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_stripe_secret_key_from_vault() CASCADE;
DROP FUNCTION IF EXISTS public.get_stripe_webhook_secret_from_vault() CASCADE;
DROP FUNCTION IF EXISTS public.store_stripe_secret_key_in_vault(text) CASCADE;
DROP FUNCTION IF EXISTS public.sync_subscription_from_stripe(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.retry_stripe_fee_fetch(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_stripe_reconciliation_summary(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.register_connected_account(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.sync_connected_account_status(uuid) CASCADE;

-- ============================================================
-- Processor vault (unused — payment-provider.ts uses env vars)
-- ============================================================
DROP FUNCTION IF EXISTS public.store_processor_secret_key_in_vault(text) CASCADE;
DROP FUNCTION IF EXISTS public.store_processor_webhook_secret_in_vault(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_processor_secret_key_from_vault() CASCADE;

-- ============================================================
-- Plaid (never integrated — Teller is the active aggregator)
-- ============================================================
DROP FUNCTION IF EXISTS public.auto_match_plaid_transaction(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_plaid_token_from_vault() CASCADE;

-- ============================================================
-- Legacy reconciliation (replaced by auto_match_bank_aggregator_transaction)
-- ============================================================
DROP FUNCTION IF EXISTS public.auto_match_bank_lines(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.auto_match_bank_transaction(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.manual_match_transaction(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.unmatch_transaction(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_auto_match_conditions(uuid) CASCADE;

-- ============================================================
-- Legacy split calculation (replaced by calculate_sale_split)
-- ============================================================
DROP FUNCTION IF EXISTS public.calculate_split(bigint, numeric) CASCADE;

-- ============================================================
-- Unused export/report RPCs (not called from export-report or any edge function)
-- ============================================================
DROP FUNCTION IF EXISTS public.export_general_ledger(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.export_profit_loss(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.export_trial_balance(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS public.export_audit_logs(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.export_1099_summary(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.generate_cpa_export(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.calculate_trial_balance(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS public.calculate_runway(uuid) CASCADE;

-- ============================================================
-- Unused health/integrity checks (not called from health-check edge function)
-- ============================================================
DROP FUNCTION IF EXISTS public.check_balance_equation(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_balance_invariants(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_double_entry_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_no_duplicate_references(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.run_money_invariants(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.verify_ledger_integrity(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.verify_ledger_balanced(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.validate_double_entry(uuid, uuid) CASCADE;

-- ============================================================
-- Unused audit chain (not called from compliance or health-check)
-- ============================================================
DROP FUNCTION IF EXISTS public.verify_audit_chain(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.detect_audit_gaps(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.run_audit_chain_verification(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_audit_log(uuid) CASCADE;

-- ============================================================
-- Unused auth/org helpers (not called from any edge function)
-- ============================================================
DROP FUNCTION IF EXISTS public.validate_api_key_secure(text) CASCADE;
DROP FUNCTION IF EXISTS public.hash_api_key(text) CASCADE;
DROP FUNCTION IF EXISTS public.user_has_permission(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_role_permissions(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_organization(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.create_organization_for_user(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_ledger_for_organization(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_org_create_ledger(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_valid_uuid(text) CASCADE;
DROP FUNCTION IF EXISTS public.log_security_event(text, text, jsonb) CASCADE;

-- ============================================================
-- Unused accounting period / ledger helpers
-- ============================================================
DROP FUNCTION IF EXISTS public.close_accounting_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_account(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_all_account_balances(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_account_balance(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_account_balances_raw(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_marketplace_ledger(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_standard_ledger(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.initialize_marketplace_accounts(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.initialize_standard_accounts(uuid) CASCADE;

-- ============================================================
-- Unused billing/usage tracking
-- ============================================================
DROP FUNCTION IF EXISTS public.record_api_usage(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.aggregate_daily_usage() CASCADE;
DROP FUNCTION IF EXISTS public.check_usage_limits(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_current_period_usage(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_rate_limit_context(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_rate_limits() CASCADE;

-- ============================================================
-- Unused invoice/webhook/notification helpers
-- ============================================================
DROP FUNCTION IF EXISTS public.safe_void_invoice(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_webhook_endpoint_safe(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.create_notification(uuid, text, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.get_creators_for_statements(uuid) CASCADE;

-- ============================================================
-- Unused held funds / escrow release automation
-- ============================================================
DROP FUNCTION IF EXISTS public.release_held_funds(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.auto_release_ready_funds(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.process_automatic_releases() CASCADE;
DROP FUNCTION IF EXISTS public.queue_auto_releases() CASCADE;
DROP FUNCTION IF EXISTS public.mark_entry_held(uuid, boolean) CASCADE;

-- ============================================================
-- Unused tax / withholding
-- ============================================================
DROP FUNCTION IF EXISTS public.apply_withholding_to_sale(uuid, bigint) CASCADE;
DROP FUNCTION IF EXISTS public.populate_tax_document_withholding(uuid, integer) CASCADE;

-- ============================================================
-- Unused projection / forecasting
-- ============================================================
DROP FUNCTION IF EXISTS public.find_matching_projection(uuid, text, bigint) CASCADE;
DROP FUNCTION IF EXISTS public.fulfill_projection(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.generate_projection_dates(date, text, integer) CASCADE;

-- ============================================================
-- Unused cleanup / maintenance jobs
-- ============================================================
DROP FUNCTION IF EXISTS public.cleanup_expired_idempotency_keys() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_nacha_files() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_authorization_decisions() CASCADE;

-- ============================================================
-- Unused misc
-- ============================================================
DROP FUNCTION IF EXISTS public.should_trigger_breach_alert(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.generate_instrument_fingerprint(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.is_authorization_valid(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_active_policies(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.refresh_dispute_lifecycle(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.refresh_payout_lifecycle(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_creator_balances(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.auto_create_ledger_accounts(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.initialize_default_tiers(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.test_concurrent_payouts(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_add_ledger(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.validate_webhook_signature(uuid, text, text) CASCADE;

COMMIT;
