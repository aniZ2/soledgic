-- NOTE: This file used to perform a one-off cleanup and reinitialization for a
-- specific internal test ledger by referencing an API key. That is dangerous
-- (destructive) and also leaks secrets into source control.
--
-- It is intentionally a NO-OP now. If you need to clean up a ledger, do it via
-- an explicit admin script/endpoint that targets by ledger ID.
DO $$ BEGIN
  -- no-op
END $$;
