-- Soledgic: Tax Document Generation
-- 1099-K and 1099-NEC generation

-- ============================================================================
-- TAX DOCUMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Document info
  document_type TEXT NOT NULL CHECK (document_type IN ('1099-K', '1099-NEC', '1099-MISC')),
  tax_year INTEGER NOT NULL,
  
  -- Recipient
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('creator', 'contractor')),
  recipient_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_tin TEXT, -- Tax ID (should be encrypted)
  recipient_tin_type TEXT CHECK (recipient_tin_type IN ('SSN', 'EIN')),
  
  -- Address
  recipient_address_line1 TEXT,
  recipient_address_line2 TEXT,
  recipient_city TEXT,
  recipient_state TEXT,
  recipient_zip TEXT,
  recipient_country TEXT DEFAULT 'US',
  
  -- Amounts (in dollars)
  gross_amount NUMERIC(15,2) NOT NULL,
  federal_withholding NUMERIC(15,2) DEFAULT 0,
  state_withholding NUMERIC(15,2) DEFAULT 0,
  
  -- 1099-K specific
  card_transactions_count INTEGER,
  third_party_network_count INTEGER,
  monthly_amounts JSONB, -- { "jan": 1000, "feb": 2000, ... }
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'filed', 'corrected', 'voided')),
  
  -- Filing info
  filed_at TIMESTAMPTZ,
  filed_by UUID REFERENCES auth.users(id),
  correction_of UUID REFERENCES tax_documents(id),
  
  -- PDF storage
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,
  
  -- Delivery
  delivered_at TIMESTAMPTZ,
  delivery_method TEXT CHECK (delivery_method IN ('email', 'mail', 'portal')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, document_type, tax_year, recipient_id)
);

CREATE INDEX idx_tax_docs_ledger_year ON tax_documents(ledger_id, tax_year);
CREATE INDEX idx_tax_docs_recipient ON tax_documents(recipient_id);
CREATE INDEX idx_tax_docs_status ON tax_documents(status);

-- ============================================================================
-- TAX INFO SUBMISSIONS (W-9 equivalent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_info_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Entity
  entity_type TEXT NOT NULL CHECK (entity_type IN ('creator', 'contractor')),
  entity_id TEXT NOT NULL,
  
  -- W-9 Info
  legal_name TEXT NOT NULL,
  business_name TEXT,
  tax_classification TEXT CHECK (tax_classification IN ('individual', 'sole_proprietor', 'llc_single', 'llc_partnership', 'llc_corp', 'c_corp', 's_corp', 'partnership', 'trust', 'other')),
  tin TEXT NOT NULL, -- Should be encrypted
  tin_type TEXT NOT NULL CHECK (tin_type IN ('SSN', 'EIN')),
  
  -- Address
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  
  -- Certification
  certified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  certified_name TEXT NOT NULL, -- Name of person who certified
  ip_address TEXT,
  
  -- Backup withholding
  subject_to_backup_withholding BOOLEAN DEFAULT false,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'invalid')),
  superseded_by UUID REFERENCES tax_info_submissions(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tax_info_ledger ON tax_info_submissions(ledger_id);
CREATE INDEX idx_tax_info_entity ON tax_info_submissions(entity_type, entity_id) WHERE status = 'active';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Calculate 1099 totals for a creator
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
  v_threshold NUMERIC := 600; -- IRS threshold for 1099-K in 2024+
BEGIN
  RETURN QUERY
  WITH monthly AS (
    SELECT 
      EXTRACT(MONTH FROM t.created_at)::INTEGER as month,
      SUM(
        CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END
      ) as amount
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
      COUNT(*)::INTEGER as cnt
    FROM monthly
  )
  SELECT 
    t.total::NUMERIC as gross_payments,
    t.cnt as transaction_count,
    (t.total >= v_threshold) as requires_1099,
    jsonb_object_agg(
      CASE m.month
        WHEN 1 THEN 'jan' WHEN 2 THEN 'feb' WHEN 3 THEN 'mar'
        WHEN 4 THEN 'apr' WHEN 5 THEN 'may' WHEN 6 THEN 'jun'
        WHEN 7 THEN 'jul' WHEN 8 THEN 'aug' WHEN 9 THEN 'sep'
        WHEN 10 THEN 'oct' WHEN 11 THEN 'nov' WHEN 12 THEN 'dec'
      END,
      m.amount
    ) as monthly_totals
  FROM totals t
  LEFT JOIN monthly m ON true
  GROUP BY t.total, t.cnt;
END;
$$ LANGUAGE plpgsql;

-- Generate 1099 documents for all qualifying creators
CREATE OR REPLACE FUNCTION generate_1099_documents(
  p_ledger_id UUID,
  p_tax_year INTEGER
) RETURNS TABLE (
  created INTEGER,
  skipped INTEGER,
  errors TEXT[]
) AS $$
DECLARE
  v_creator RECORD;
  v_totals RECORD;
  v_tax_info RECORD;
  v_created INTEGER := 0;
  v_skipped INTEGER := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Get all creators with activity this year
  FOR v_creator IN
    SELECT DISTINCT a.entity_id, a.name
    FROM accounts a
    WHERE a.ledger_id = p_ledger_id
      AND a.account_type = 'creator_balance'
      AND a.is_active = true
  LOOP
    -- Calculate totals
    SELECT * INTO v_totals
    FROM calculate_1099_totals(p_ledger_id, v_creator.entity_id, p_tax_year);
    
    IF NOT v_totals.requires_1099 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    
    -- Get tax info
    SELECT * INTO v_tax_info
    FROM tax_info_submissions
    WHERE ledger_id = p_ledger_id
      AND entity_type = 'creator'
      AND entity_id = v_creator.entity_id
      AND status = 'active'
    LIMIT 1;
    
    IF v_tax_info IS NULL THEN
      v_errors := array_append(v_errors, 'Missing tax info for ' || v_creator.entity_id);
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    
    -- Create or update 1099 document
    INSERT INTO tax_documents (
      ledger_id, document_type, tax_year, recipient_type, recipient_id,
      recipient_name, recipient_tin, recipient_tin_type,
      recipient_address_line1, recipient_address_line2, recipient_city,
      recipient_state, recipient_zip, recipient_country,
      gross_amount, monthly_amounts, status
    ) VALUES (
      p_ledger_id, '1099-K', p_tax_year, 'creator', v_creator.entity_id,
      v_tax_info.legal_name, v_tax_info.tin, v_tax_info.tin_type,
      v_tax_info.address_line1, v_tax_info.address_line2, v_tax_info.city,
      v_tax_info.state, v_tax_info.zip, v_tax_info.country,
      v_totals.gross_payments, v_totals.monthly_totals, 'draft'
    )
    ON CONFLICT (ledger_id, document_type, tax_year, recipient_id) 
    DO UPDATE SET
      recipient_name = EXCLUDED.recipient_name,
      gross_amount = EXCLUDED.gross_amount,
      monthly_amounts = EXCLUDED.monthly_amounts,
      updated_at = NOW();
    
    v_created := v_created + 1;
  END LOOP;
  
  RETURN QUERY SELECT v_created, v_skipped, v_errors;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE tax_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_info_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tax docs via API key"
  ON tax_documents FOR ALL
  USING (ledger_id IN (SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'));

CREATE POLICY "Tax info via API key"
  ON tax_info_submissions FOR ALL
  USING (ledger_id IN (SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE tax_documents IS '1099 tax documents for creators and contractors';
COMMENT ON TABLE tax_info_submissions IS 'W-9 equivalent tax information from recipients';
COMMENT ON FUNCTION calculate_1099_totals IS 'Calculate annual payment totals for 1099 reporting';
COMMENT ON FUNCTION generate_1099_documents IS 'Generate 1099 documents for all qualifying recipients';
