-- Migration: Drop dead columns identified by schema hygiene validator
-- Each verified to have zero references in TypeScript code AND SQL function bodies
-- Categorized as truly dead (abandoned features, old provider integrations)

-- ============================================================================
-- 1. bank_connections: Plaid-era sync fields (replaced by bank_aggregator model)
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_connections') THEN
    ALTER TABLE public.bank_connections DROP COLUMN IF EXISTS account_mask;
    ALTER TABLE public.bank_connections DROP COLUMN IF EXISTS balance_updated_at;
    ALTER TABLE public.bank_connections DROP COLUMN IF EXISTS linked_account_id;
    ALTER TABLE public.bank_connections DROP COLUMN IF EXISTS provider_institution_id;
    ALTER TABLE public.bank_connections DROP COLUMN IF EXISTS sync_cursor;
    ALTER TABLE public.bank_connections DROP COLUMN IF EXISTS sync_error;
    ALTER TABLE public.bank_connections DROP COLUMN IF EXISTS sync_status;
  END IF;
END $$;

-- ============================================================================
-- 2. bank_matches: old reconciliation engine field
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_matches') THEN
    ALTER TABLE public.bank_matches DROP COLUMN IF EXISTS confidence;
  END IF;
END $$;

-- ============================================================================
-- 3. bank_statement_lines: old reconciliation fields
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_statement_lines') THEN
    ALTER TABLE public.bank_statement_lines DROP COLUMN IF EXISTS exclusion_reason;
    ALTER TABLE public.bank_statement_lines DROP COLUMN IF EXISTS split_parent_id;
  END IF;
END $$;

-- ============================================================================
-- 4. bank_transactions: old reconciliation engine fields
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_transactions') THEN
    ALTER TABLE public.bank_transactions DROP COLUMN IF EXISTS excluded_reason;
    ALTER TABLE public.bank_transactions DROP COLUMN IF EXISTS posted_date;
  END IF;
END $$;

-- ============================================================================
-- 5. bank_aggregator_connections: redundant institution field
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_aggregator_connections') THEN
    ALTER TABLE public.bank_aggregator_connections DROP COLUMN IF EXISTS institution_id;
  END IF;
END $$;

-- ============================================================================
-- 6. contractors: PayPal integration never built
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contractors') THEN
    ALTER TABLE public.contractors DROP COLUMN IF EXISTS paypal_email;
  END IF;
END $$;

-- ============================================================================
-- 7. creator_payout_summaries: Stripe reconciliation flag
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'creator_payout_summaries') THEN
    ALTER TABLE public.creator_payout_summaries DROP COLUMN IF EXISTS reconciled_with_stripe;
  END IF;
END $$;
