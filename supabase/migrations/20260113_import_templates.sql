-- Soledgic: Bank Import Templates
-- Store custom CSV mapping templates for banks

CREATE TABLE IF NOT EXISTS import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  bank_name TEXT,
  format TEXT NOT NULL DEFAULT 'csv',
  
  -- Column mapping
  mapping JSONB NOT NULL,
  -- Example: {"date": "Date", "description": "Description", "amount": "Amount"}
  -- Or: {"date": 0, "description": 1, "amount": 2} for positional
  
  skip_rows INTEGER DEFAULT 0,
  delimiter TEXT DEFAULT ',',
  date_format TEXT, -- e.g., 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, name)
);

CREATE INDEX idx_import_templates_ledger ON import_templates(ledger_id);

ALTER TABLE import_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Import templates via API key"
  ON import_templates FOR ALL
  USING (ledger_id IN (SELECT id FROM ledgers WHERE api_key = current_setting('request.headers', true)::json->>'x-api-key'));

COMMENT ON TABLE import_templates IS 'Custom CSV/bank import templates';
