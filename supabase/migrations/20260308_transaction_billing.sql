-- Add transaction-based overage billing columns to organizations.
-- Free plan includes 1,000 transactions/month; $0.02 per additional transaction.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS max_transactions_per_month integer DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS overage_transaction_price integer DEFAULT 2;
