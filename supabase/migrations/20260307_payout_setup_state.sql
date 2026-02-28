-- Add processor onboarding state columns and identity ID to connected_accounts
-- for the creator payout self-service flow.

ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS processor_identity_id text,
  ADD COLUMN IF NOT EXISTS setup_state text,
  ADD COLUMN IF NOT EXISTS setup_state_expires_at timestamptz;
