-- ============================================================================
-- Restore api_key column to ledgers table
-- The column is used throughout the app for API authentication
-- ============================================================================

-- Add api_key column back if it doesn't exist
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS api_key TEXT;

-- Generate api_keys for existing ledgers that don't have one
UPDATE ledgers
SET api_key = 'sk_' || CASE WHEN livemode THEN 'live_' ELSE 'test_' END || replace(gen_random_uuid()::text, '-', '')
WHERE api_key IS NULL;

-- Make it unique and not null
ALTER TABLE ledgers ALTER COLUMN api_key SET NOT NULL;

-- Create unique index if not exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledgers_api_key ON ledgers(api_key);
