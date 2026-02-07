-- ============================================================================
-- Multi-Currency Support
-- ============================================================================

-- Add default_currency to ledgers
ALTER TABLE ledgers
  ADD COLUMN IF NOT EXISTS default_currency TEXT DEFAULT 'USD' CHECK (
    default_currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'MXN', 'BRL', 'INR')
  );

-- Add currency to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' CHECK (
    currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'MXN', 'BRL', 'INR')
  );

-- Add currency to entries (for multi-currency ledger support)
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' CHECK (
    currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'MXN', 'BRL', 'INR')
  );

-- Update existing records to use USD
UPDATE ledgers SET default_currency = 'USD' WHERE default_currency IS NULL;
UPDATE transactions SET currency = 'USD' WHERE currency IS NULL;
UPDATE entries SET currency = 'USD' WHERE currency IS NULL;

-- Add display currency preference to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS display_currency TEXT DEFAULT 'USD' CHECK (
    display_currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'MXN', 'BRL', 'INR')
  );

-- Index for currency-based queries
CREATE INDEX IF NOT EXISTS idx_transactions_currency ON transactions(ledger_id, currency);

-- Comment on currency columns
COMMENT ON COLUMN ledgers.default_currency IS
  'Default currency for new transactions in this ledger. Can be changed per-transaction.';

COMMENT ON COLUMN transactions.currency IS
  'Currency of the transaction amount. Stored amounts are in minor units (cents for USD).';

COMMENT ON COLUMN organizations.display_currency IS
  'Preferred currency for displaying aggregated reports (values converted at current rates).';
