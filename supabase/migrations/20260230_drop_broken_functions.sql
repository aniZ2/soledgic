-- ============================================================================
-- FIX: Drop remaining broken functions that reference non-existent schema
-- These functions can't work as-is and need full rewrites with proper schema
-- ============================================================================

-- Drop all overloaded versions of generate_api_key
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'generate_api_key'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop all overloaded versions of rotate_webhook_secret
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'rotate_webhook_secret'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop all overloaded versions of validate_webhook_signature
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'validate_webhook_signature'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop all overloaded versions of reprocess_stripe_event
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'reprocess_stripe_event'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop all overloaded versions of check_rate_limit_secure
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'check_rate_limit_secure'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop can_add_ledger (references non-existent ledger_limit column)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'can_add_ledger'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop can_org_create_ledger (calls can_add_ledger)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'can_org_create_ledger'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop store_plaid_token_in_vault (vault permission issues)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'store_plaid_token_in_vault'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop store_stripe_webhook_secret_in_vault (vault permission issues)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'store_stripe_webhook_secret_in_vault'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop unlock_accounting_period (references non-existent columns)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'unlock_accounting_period'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

-- Drop auto_match_bank_transaction (broken)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text as func_sig
    FROM pg_proc
    WHERE proname = 'auto_match_bank_transaction'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig;
  END LOOP;
END;
$$;

SELECT 'Broken functions dropped successfully' AS status;
