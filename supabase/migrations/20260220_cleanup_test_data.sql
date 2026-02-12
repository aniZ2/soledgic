-- NOTE: This file used to run destructive cleanup for a specific internal test
-- ledger by referencing an API key. That is dangerous and leaks secrets.
-- It is intentionally a NO-OP now.
DO $$ BEGIN
  -- no-op
END $$;
