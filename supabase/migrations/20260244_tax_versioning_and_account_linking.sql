-- Migration: Tax Document Versioning + Explicit processor Account Linking
--
-- 1. Tax documents: version column, status_history audit trail, fix UNIQUE constraint
-- 2. Accounts: connected_account_id FK for direct link to processor connected accounts

-- ============================================================================
-- 1. TAX DOCUMENT VERSIONING
-- ============================================================================

-- Add version column (1 = original, 2+ = corrections)
ALTER TABLE tax_documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Add status history for audit trail of status transitions
-- e.g. [{"status":"draft","at":"...","by":null}, {"status":"filed","at":"...","by":"user-id"}]
ALTER TABLE tax_documents ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb;

-- Drop the old UNIQUE constraint that prevents corrections
-- A correction is a new row for the same (ledger, type, year, recipient) with a higher version
ALTER TABLE tax_documents DROP CONSTRAINT IF EXISTS tax_documents_ledger_id_document_type_tax_year_recipient_i_key;

-- New UNIQUE constraint includes version — allows multiple versions per recipient/year
ALTER TABLE tax_documents ADD CONSTRAINT tax_documents_ledger_type_year_recipient_version_key
  UNIQUE (ledger_id, document_type, tax_year, recipient_id, version);

-- Index for finding the latest version of a document
CREATE INDEX IF NOT EXISTS idx_tax_docs_latest_version
  ON tax_documents(ledger_id, document_type, tax_year, recipient_id, version DESC);

-- Update generate_1099_documents to use versioning instead of upsert
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
  v_existing_id UUID;
  v_next_version INTEGER;
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

    -- Check for existing document (any version, not yet filed)
    SELECT id INTO v_existing_id
    FROM tax_documents
    WHERE ledger_id = p_ledger_id
      AND document_type = '1099-K'
      AND tax_year = p_tax_year
      AND recipient_id = v_creator.entity_id
      AND status = 'draft'
    ORDER BY version DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Update existing draft in place
      UPDATE tax_documents SET
        recipient_name = v_tax_info.legal_name,
        recipient_tin = v_tax_info.tin,
        recipient_tin_type = v_tax_info.tin_type,
        recipient_address_line1 = v_tax_info.address_line1,
        recipient_address_line2 = v_tax_info.address_line2,
        recipient_city = v_tax_info.city,
        recipient_state = v_tax_info.state,
        recipient_zip = v_tax_info.zip,
        recipient_country = v_tax_info.country,
        gross_amount = v_totals.gross_payments,
        monthly_amounts = v_totals.monthly_totals,
        updated_at = NOW()
      WHERE id = v_existing_id;
    ELSE
      -- Determine version number
      SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
      FROM tax_documents
      WHERE ledger_id = p_ledger_id
        AND document_type = '1099-K'
        AND tax_year = p_tax_year
        AND recipient_id = v_creator.entity_id;

      -- If there's a previously filed version, mark it corrected and link
      IF v_next_version > 1 THEN
        UPDATE tax_documents
        SET status = 'corrected',
            status_history = status_history || jsonb_build_array(jsonb_build_object(
              'status', 'corrected', 'at', NOW(), 'reason', 'superseded by version ' || v_next_version
            )),
            updated_at = NOW()
        WHERE ledger_id = p_ledger_id
          AND document_type = '1099-K'
          AND tax_year = p_tax_year
          AND recipient_id = v_creator.entity_id
          AND version = v_next_version - 1
          AND status = 'filed';
      END IF;

      INSERT INTO tax_documents (
        ledger_id, document_type, tax_year, recipient_type, recipient_id,
        recipient_name, recipient_tin, recipient_tin_type,
        recipient_address_line1, recipient_address_line2, recipient_city,
        recipient_state, recipient_zip, recipient_country,
        gross_amount, monthly_amounts, status, version,
        correction_of,
        status_history
      ) VALUES (
        p_ledger_id, '1099-K', p_tax_year, 'creator', v_creator.entity_id,
        v_tax_info.legal_name, v_tax_info.tin, v_tax_info.tin_type,
        v_tax_info.address_line1, v_tax_info.address_line2, v_tax_info.city,
        v_tax_info.state, v_tax_info.zip, v_tax_info.country,
        v_totals.gross_payments, v_totals.monthly_totals, 'draft', v_next_version,
        CASE WHEN v_next_version > 1 THEN (
          SELECT id FROM tax_documents
          WHERE ledger_id = p_ledger_id AND document_type = '1099-K'
            AND tax_year = p_tax_year AND recipient_id = v_creator.entity_id
            AND version = v_next_version - 1
          LIMIT 1
        ) ELSE NULL END,
        jsonb_build_array(jsonb_build_object('status', 'draft', 'at', NOW()))
      );
    END IF;

    v_created := v_created + 1;
  END LOOP;

  RETURN QUERY SELECT v_created, v_skipped, v_errors;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. EXPLICIT processor ACCOUNT LINKING
-- ============================================================================
-- Add direct FK from accounts (creator_balance) to connected_accounts
-- Currently the link is implicit via matching (ledger_id, entity_type, entity_id)
-- This makes it explicit and queryable without a JOIN

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS connected_account_id UUID REFERENCES connected_accounts(id);

CREATE INDEX IF NOT EXISTS idx_accounts_connected ON accounts(connected_account_id)
  WHERE connected_account_id IS NOT NULL;

-- Backfill: link existing creator_balance accounts to their connected_accounts
UPDATE accounts a
SET connected_account_id = ca.id
FROM connected_accounts ca
WHERE a.ledger_id = ca.ledger_id
  AND a.entity_type = ca.entity_type
  AND a.entity_id = ca.entity_id
  AND a.account_type = 'creator_balance'
  AND a.connected_account_id IS NULL
  AND ca.is_active = true;

-- Update register_connected_account to also set the FK on the accounts table
CREATE OR REPLACE FUNCTION register_connected_account(
  p_ledger_id UUID,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_processor_account_id TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  INSERT INTO connected_accounts (
    ledger_id,
    entity_type,
    entity_id,
    processor_account_id,
    display_name,
    email,
    created_by
  ) VALUES (
    p_ledger_id,
    p_entity_type,
    p_entity_id,
    p_processor_account_id,
    p_display_name,
    p_email,
    p_created_by
  )
  ON CONFLICT (ledger_id, entity_type, entity_id)
  DO UPDATE SET
    processor_account_id = EXCLUDED.processor_account_id,
    display_name = COALESCE(EXCLUDED.display_name, connected_accounts.display_name),
    email = COALESCE(EXCLUDED.email, connected_accounts.email),
    updated_at = NOW()
  RETURNING id INTO v_account_id;

  -- Link the ledger account to this connected account
  UPDATE accounts
  SET connected_account_id = v_account_id,
      updated_at = NOW()
  WHERE ledger_id = p_ledger_id
    AND entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND account_type = 'creator_balance'
    AND (connected_account_id IS NULL OR connected_account_id != v_account_id);

  RETURN v_account_id;
END;
$$;
