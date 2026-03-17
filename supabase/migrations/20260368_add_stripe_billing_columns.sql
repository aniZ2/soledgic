-- Add Stripe Billing columns to organizations
-- These were previously dropped in 20260364_drop_stripe_remnants.sql.
-- Re-added for Stripe Billing integration (subscriptions, customer management).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Index for customer lookup (Stripe webhooks resolve by customer ID)
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN organizations.stripe_customer_id IS 'Stripe Customer ID (cus_xxx) for billing';
COMMENT ON COLUMN organizations.stripe_subscription_id IS 'Active Stripe Subscription ID (sub_xxx)';
