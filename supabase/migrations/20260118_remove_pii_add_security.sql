-- Soledgic: Remove PII & Add Rate Limiting
-- Security hardening: No SSN/EIN/addresses stored
-- Tax reporting tracks amounts only - customers export to their own tax software

-- ============================================================================
-- 1. DROP PII TABLES ENTIRELY
-- ============================================================================

-- Drop tax_info_submissions (contained TIN, addresses)
DROP TABLE IF EXISTS tax_info_submissions CASCADE;

-- ============================================================================
-- 2. RECREATE TAX_DOCUMENTS WITHOUT PII
-- ============================================================================

-- Drop and recreate tax_documents without PII fields
DROP TABLE IF EXISTS tax_documents CASCADE;

CREATE TABLE tax_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Document info
  document_type TEXT NOT NULL CHECK (document_type IN ('1099-K', '1099-NEC', '1099-MISC')),
  tax_year INTEGER NOT NULL,
  
  -- Recipient (ID only - no PII)
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('creator', 'contractor')),
  recipient_id TEXT NOT NULL,
  -- NO: recipient_name, recipient_tin, recipient_address_*
  
  -- Amounts only (in dollars)
  gross_amount NUMERIC(15,2) NOT NULL,
  federal_withholding NUMERIC(15,2) DEFAULT 0,
  state_withholding NUMERIC(15,2) DEFAULT 0,
  
  -- 1099-K specific
  transaction_count INTEGER,
  monthly_amounts JSONB, -- { "jan": 1000, "feb": 2000, ... }
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated', 'exported', 'filed')),
  
  -- Export tracking
  exported_at TIMESTAMPTZ,
  exported_by UUID REFERENCES auth.users(id),
  export_format TEXT, -- 'csv', 'json'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, document_type, tax_year, recipient_id)
);

CREATE INDEX idx_tax_docs_ledger_year ON tax_documents(ledger_id, tax_year);
CREATE INDEX idx_tax_docs_recipient ON tax_documents(recipient_id);
CREATE INDEX idx_tax_docs_status ON tax_documents(status);

-- RLS
ALTER TABLE tax_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tax docs via ledger membership"
  ON tax_documents FOR ALL
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

COMMENT ON TABLE tax_documents IS 
  'Tax reporting summaries - amounts only. NO PII stored. 
   Customers export this data and merge with their own recipient records for 1099 filing.';

-- ============================================================================
-- 3. UPDATE CALCULATE FUNCTION (NO PII)
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_1099_totals(
  p_ledger_id UUID,
  p_creator_id TEXT,
  p_tax_year INTEGER
) RETURNS TABLE (
  gross_payments NUMERIC,
  transaction_count INTEGER,
  requires_1099 BOOLEAN,
  monthly_totals JSONB
) AS $$
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
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. UPDATE GENERATE FUNCTION (NO PII)
-- ============================================================================

-- Drop old function first (return type changed)
DROP FUNCTION IF EXISTS generate_1099_documents(UUID, INTEGER);

CREATE OR REPLACE FUNCTION generate_1099_documents(
  p_ledger_id UUID,
  p_tax_year INTEGER
) RETURNS TABLE (
  created INTEGER,
  skipped INTEGER,
  total_amount NUMERIC
) AS $$
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
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. RATE LIMITING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL, -- API key or IP:API key combo
  endpoint TEXT NOT NULL, -- Function name
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(key, endpoint)
);

CREATE INDEX idx_rate_limits_key ON rate_limits(key, endpoint);
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);

-- Function to check and increment rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 100,
  p_window_seconds INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql;

-- Cleanup old rate limit records (run via cron)
CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. API KEY HASHING
-- ============================================================================

-- Add hashed API key column
ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS api_key_hash TEXT;

-- Create index for hash lookups
CREATE INDEX IF NOT EXISTS idx_ledgers_api_key_hash ON ledgers(api_key_hash);

-- Function to hash API key
CREATE OR REPLACE FUNCTION hash_api_key(p_key TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN encode(sha256(p_key::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill existing API keys with hashes
UPDATE ledgers 
SET api_key_hash = hash_api_key(api_key)
WHERE api_key_hash IS NULL AND api_key IS NOT NULL;

-- Trigger to auto-hash new API keys
CREATE OR REPLACE FUNCTION auto_hash_api_key() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.api_key IS NOT NULL AND (OLD.api_key IS NULL OR NEW.api_key != OLD.api_key) THEN
    NEW.api_key_hash := hash_api_key(NEW.api_key);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_hash_api_key ON ledgers;
CREATE TRIGGER trigger_hash_api_key
  BEFORE INSERT OR UPDATE ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION auto_hash_api_key();

-- ============================================================================
-- 7. REMOVE owner_email FROM LEDGERS (PII)
-- ============================================================================

-- owner_email is redundant - we have organization -> users relationship
ALTER TABLE ledgers DROP COLUMN IF EXISTS owner_email;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE rate_limits IS 'API rate limiting - 100 requests per minute per endpoint per API key';
COMMENT ON FUNCTION check_rate_limit IS 'Returns TRUE if request allowed, FALSE if rate limited';
COMMENT ON COLUMN ledgers.api_key_hash IS 'SHA-256 hash of API key for secure lookups';
