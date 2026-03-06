-- Soledgic: Wallet Schema — add user_wallet account type and wallet transfer types
-- ============================================================================
-- Constraint updates only. Functions are in 20260328_wallet_rpcs.sql (separate
-- file required because Supabase CLI's statement splitter bundles multiple
-- CREATE FUNCTION statements into a single prepared statement).
-- ============================================================================

-- ============================================================================
-- STEP 1: Add 'user_wallet' to accounts.account_type CHECK constraint
-- ============================================================================
-- Additive approach: reads the live constraint, extracts current allowed values,
-- unions in the new value, and rebuilds. This avoids accidentally dropping values
-- that may have been added by later migrations or manual ALTERs.

DO $$
DECLARE
  v_all_values  TEXT[];
  v_sql         TEXT;
BEGIN
  -- Build value list from three sources (handles any pg_get_constraintdef format):
  --   1. regexp_matches extracts quoted strings from the live constraint def
  --      (works for both IN (...) and = ANY (ARRAY[...::text]) formats)
  --   2. DISTINCT account_type from data (safety net for values the regex might miss)
  --   3. New values to add
  SELECT array_agg(DISTINCT val ORDER BY val) INTO v_all_values
  FROM (
    -- Values from live constraint definition
    SELECT m[1] AS val
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z][a-z0-9_]*)''', 'g') AS m
    WHERE c.conrelid = 'public.accounts'::regclass
      AND c.conname = 'accounts_account_type_check'
    UNION
    -- Values currently in data
    SELECT DISTINCT account_type FROM public.accounts WHERE account_type IS NOT NULL
    UNION
    -- New values
    SELECT unnest(ARRAY['user_wallet'])
  ) combined;

  -- Sanity check: existing constraint has 67 values, we expect at least that many
  IF v_all_values IS NULL OR array_length(v_all_values, 1) < 60 THEN
    RAISE EXCEPTION 'Constraint value extraction failed: got % values (expected 60+)',
      COALESCE(array_length(v_all_values, 1), 0);
  END IF;

  ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;

  v_sql := 'ALTER TABLE public.accounts ADD CONSTRAINT accounts_account_type_check CHECK (account_type IN (';
  FOR i IN 1..array_length(v_all_values, 1) LOOP
    IF i > 1 THEN v_sql := v_sql || ', '; END IF;
    v_sql := v_sql || quote_literal(v_all_values[i]);
  END LOOP;
  v_sql := v_sql || '))';
  EXECUTE v_sql;

  RAISE NOTICE 'accounts_account_type_check rebuilt with % values', array_length(v_all_values, 1);
END;
$$;

-- ============================================================================
-- STEP 2: Add wallet transfer types to internal_transfers.transfer_type
-- ============================================================================
-- Same additive approach for the transfer_type constraint.

DO $$
DECLARE
  v_all_values  TEXT[];
  v_sql         TEXT;
BEGIN
  SELECT array_agg(DISTINCT val ORDER BY val) INTO v_all_values
  FROM (
    SELECT m[1] AS val
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z][a-z0-9_]*)''', 'g') AS m
    WHERE c.conrelid = 'public.internal_transfers'::regclass
      AND c.conname = 'internal_transfers_transfer_type_check'
    UNION
    SELECT DISTINCT transfer_type FROM public.internal_transfers WHERE transfer_type IS NOT NULL
    UNION
    SELECT unnest(ARRAY['wallet_deposit', 'wallet_transfer', 'wallet_withdrawal'])
  ) combined;

  IF v_all_values IS NULL OR array_length(v_all_values, 1) < 8 THEN
    RAISE EXCEPTION 'Constraint value extraction failed: got % values (expected 8+)',
      COALESCE(array_length(v_all_values, 1), 0);
  END IF;

  ALTER TABLE public.internal_transfers DROP CONSTRAINT IF EXISTS internal_transfers_transfer_type_check;

  v_sql := 'ALTER TABLE public.internal_transfers ADD CONSTRAINT internal_transfers_transfer_type_check CHECK (transfer_type IN (';
  FOR i IN 1..array_length(v_all_values, 1) LOOP
    IF i > 1 THEN v_sql := v_sql || ', '; END IF;
    v_sql := v_sql || quote_literal(v_all_values[i]);
  END LOOP;
  v_sql := v_sql || '))';
  EXECUTE v_sql;

  RAISE NOTICE 'internal_transfers_transfer_type_check rebuilt with % values', array_length(v_all_values, 1);
END;
$$;
