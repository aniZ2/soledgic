-- ============================================================================
-- FIX: Drop functions that depend on other dropped functions
-- ============================================================================

-- Drop create_ledger_with_api_key (depends on generate_api_key)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'create_ledger_with_api_key'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop auto_match_all_unmatched (depends on auto_match_bank_transaction)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'auto_match_all_unmatched'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

SELECT 'Dependent functions dropped successfully' AS status;
