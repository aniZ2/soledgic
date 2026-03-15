-- Drop 20 dead tables: zero application code references, only existed in baseline.
-- Grouped by category for auditability.

-- Stripe (processor removed from codebase)
DROP TABLE IF EXISTS stripe_transactions CASCADE;
DROP TABLE IF EXISTS stripe_events CASCADE;
DROP TABLE IF EXISTS stripe_balance_snapshots CASCADE;
DROP TABLE IF EXISTS stripe_connected_accounts CASCADE;
DROP TABLE IF EXISTS stripe_account_links CASCADE;

-- Plaid (never integrated — Teller is the active bank aggregator)
DROP TABLE IF EXISTS plaid_transactions CASCADE;
DROP TABLE IF EXISTS plaid_connections CASCADE;

-- Reconciliation (unused — active reconciliation uses bank_matches, reconciliation_snapshots)
DROP TABLE IF EXISTS reconciliation_sessions CASCADE;
DROP TABLE IF EXISTS reconciliation_runs CASCADE;
DROP TABLE IF EXISTS reconciliation_rules CASCADE;
DROP TABLE IF EXISTS reconciliation_periods CASCADE;

-- Billing/Pricing (unused — active billing uses subscriptions, billing_overage_charges)
DROP TABLE IF EXISTS subscription_items CASCADE;
DROP TABLE IF EXISTS pricing_plans CASCADE;
DROP TABLE IF EXISTS prices CASCADE;
DROP TABLE IF EXISTS payout_file_downloads CASCADE;

-- Miscellaneous dead weight
DROP TABLE IF EXISTS vault_access_log CASCADE;
DROP TABLE IF EXISTS receipt_rules CASCADE;
DROP TABLE IF EXISTS reserved_slugs CASCADE;
DROP TABLE IF EXISTS mileage_entries CASCADE;
DROP TABLE IF EXISTS withholding_rules CASCADE;
