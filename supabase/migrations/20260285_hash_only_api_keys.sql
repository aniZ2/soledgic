-- ============================================================================
-- Hash-only API key storage
-- - Keep ledgers.api_key_hash as the runtime lookup field
-- - Remove persistent plaintext API keys from ledgers.api_key
-- ============================================================================

-- 1) Ensure plaintext column can be nulled when it exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ledgers'
      AND column_name = 'api_key'
  ) THEN
    ALTER TABLE public.ledgers
      ALTER COLUMN api_key DROP NOT NULL;
  END IF;
END $$;

-- 2) Backfill hashes for any rows that still only have plaintext.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ledgers'
      AND column_name = 'api_key'
  ) THEN
    UPDATE public.ledgers
    SET api_key_hash = encode(sha256(api_key::bytea), 'hex')
    WHERE api_key IS NOT NULL
      AND api_key_hash IS NULL;
  END IF;
END $$;

-- 3) Remove plaintext key material from the primary ledgers table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ledgers'
      AND column_name = 'api_key'
  ) THEN
    UPDATE public.ledgers
    SET api_key = NULL
    WHERE api_key IS NOT NULL;
  END IF;
END $$;

-- 4) Drop plaintext-key unique index if present.
DROP INDEX IF EXISTS public.idx_ledgers_api_key;
