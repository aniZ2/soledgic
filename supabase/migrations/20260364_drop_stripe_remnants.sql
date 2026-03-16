-- Migration: Drop all Stripe-era tables, columns, functions, and indexes
-- None of these are referenced by any application code (verified via grep)
-- The platform uses Finix as the sole payment processor

-- ============================================================================
-- 1. Drop entire Stripe tables (no code references)
-- ============================================================================
DROP TABLE IF EXISTS public.stripe_transactions CASCADE;
DROP TABLE IF EXISTS public.stripe_events CASCADE;
DROP TABLE IF EXISTS public.stripe_connected_accounts CASCADE;
DROP TABLE IF EXISTS public.stripe_balance_snapshots CASCADE;
DROP TABLE IF EXISTS public.stripe_account_links CASCADE;

-- ============================================================================
-- 2. Drop Stripe-named columns on active tables
-- ============================================================================

-- organizations: stripe_customer_id, stripe_subscription_id
ALTER TABLE public.organizations DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS stripe_subscription_id;

-- connected_accounts: stripe_account_id, stripe_account_type, stripe_status
ALTER TABLE public.connected_accounts DROP COLUMN IF EXISTS stripe_account_id;
ALTER TABLE public.connected_accounts DROP COLUMN IF EXISTS stripe_account_type;
ALTER TABLE public.connected_accounts DROP COLUMN IF EXISTS stripe_status;

-- ledgers: stripe_webhook_secret_vault_id, stripe_secret_key_vault_id
ALTER TABLE public.ledgers DROP COLUMN IF EXISTS stripe_webhook_secret_vault_id;
ALTER TABLE public.ledgers DROP COLUMN IF EXISTS stripe_secret_key_vault_id;

-- payment_methods: stripe_payment_method_id
ALTER TABLE public.payment_methods DROP COLUMN IF EXISTS stripe_payment_method_id;
ALTER TABLE public.payment_methods DROP COLUMN IF EXISTS stripe_default_payment_method_id;

-- payouts: stripe_payout_id, stripe_arrival_date, stripe_error_code, stripe_error_message
ALTER TABLE public.payouts DROP COLUMN IF EXISTS stripe_payout_id;
ALTER TABLE public.payouts DROP COLUMN IF EXISTS stripe_arrival_date;
ALTER TABLE public.payouts DROP COLUMN IF EXISTS stripe_error_code;
ALTER TABLE public.payouts DROP COLUMN IF EXISTS stripe_error_message;

-- plaid_transactions: stripe_payout_id, is_stripe_payout
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plaid_transactions') THEN
    ALTER TABLE public.plaid_transactions DROP COLUMN IF EXISTS stripe_payout_id;
    ALTER TABLE public.plaid_transactions DROP COLUMN IF EXISTS is_stripe_payout;
  END IF;
END $$;

-- billing_events: stripe_event_id, stripe_event_type, stripe_data
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_events') THEN
    ALTER TABLE public.billing_events DROP COLUMN IF EXISTS stripe_event_id;
    ALTER TABLE public.billing_events DROP COLUMN IF EXISTS stripe_event_type;
    ALTER TABLE public.billing_events DROP COLUMN IF EXISTS stripe_data;
  END IF;
END $$;

-- dispute_lifecycle: stripe_dispute_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dispute_lifecycle') THEN
    ALTER TABLE public.dispute_lifecycle DROP COLUMN IF EXISTS stripe_dispute_id;
  END IF;
END $$;

-- bank_connections: stripe_account_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_connections') THEN
    ALTER TABLE public.bank_connections DROP COLUMN IF EXISTS stripe_account_id;
  END IF;
END $$;

-- prices: stripe_price_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'prices') THEN
    ALTER TABLE public.prices DROP COLUMN IF EXISTS stripe_price_id;
  END IF;
END $$;

-- products: stripe_product_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
    ALTER TABLE public.products DROP COLUMN IF EXISTS stripe_product_id;
  END IF;
END $$;

-- subscription_items: stripe_subscription_item_id, stripe_price_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_items') THEN
    ALTER TABLE public.subscription_items DROP COLUMN IF EXISTS stripe_subscription_item_id;
    ALTER TABLE public.subscription_items DROP COLUMN IF EXISTS stripe_price_id;
  END IF;
END $$;

-- subscriptions: stripe_subscription_id, stripe_customer_id, stripe_price_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
    ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS stripe_subscription_id;
    ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS stripe_customer_id;
    ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS stripe_price_id;
  END IF;
END $$;

-- usage_records: stripe_usage_record_id, synced_to_stripe_at
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usage_records') THEN
    ALTER TABLE public.usage_records DROP COLUMN IF EXISTS stripe_usage_record_id;
    ALTER TABLE public.usage_records DROP COLUMN IF EXISTS synced_to_stripe_at;
  END IF;
END $$;

-- reconciliation_records: reconciled_with_stripe
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reconciliation_records') THEN
    ALTER TABLE public.reconciliation_records DROP COLUMN IF EXISTS reconciled_with_stripe;
  END IF;
END $$;

-- payout_requests: stripe_payout_id, stripe_arrival_date, stripe_error_code, stripe_error_message
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payout_requests') THEN
    ALTER TABLE public.payout_requests DROP COLUMN IF EXISTS stripe_payout_id;
    ALTER TABLE public.payout_requests DROP COLUMN IF EXISTS stripe_arrival_date;
    ALTER TABLE public.payout_requests DROP COLUMN IF EXISTS stripe_error_code;
    ALTER TABLE public.payout_requests DROP COLUMN IF EXISTS stripe_error_message;
  END IF;
END $$;

-- creator_payout_summaries: stripe_account_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'creator_payout_summaries') THEN
    ALTER TABLE public.creator_payout_summaries DROP COLUMN IF EXISTS stripe_account_id;
  END IF;
END $$;

-- organizations: stripe_default_payment_method_id
ALTER TABLE public.organizations DROP COLUMN IF EXISTS stripe_default_payment_method_id;

-- ventures: stripe_account_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ventures') THEN
    ALTER TABLE public.ventures DROP COLUMN IF EXISTS stripe_account_id;
  END IF;
END $$;

-- bank_accounts: plaid_account_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_accounts') THEN
    ALTER TABLE public.bank_accounts DROP COLUMN IF EXISTS plaid_account_id;
  END IF;
END $$;

-- ============================================================================
-- 3. Drop Stripe-era RPC functions
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_stripe_reconciliation_summary(uuid);

-- ============================================================================
-- 4. Drop Stripe-specific indexes (CASCADE on table drops handles most,
--    but explicit cleanup for columns on surviving tables)
-- ============================================================================
DROP INDEX IF EXISTS public.idx_billing_events_stripe;
DROP INDEX IF EXISTS public.idx_connected_accounts_stripe;
DROP INDEX IF EXISTS public.idx_organizations_stripe;
DROP INDEX IF EXISTS public.idx_prices_stripe;
DROP INDEX IF EXISTS public.idx_subscriptions_stripe;
DROP INDEX IF EXISTS public.idx_dispute_lifecycle_dispute_id;
DROP INDEX IF EXISTS public.idx_plaid_stripe_payout;
