-- NOTE: This file used to delete data for a specific internal test ledger by
-- referencing an API key. That is dangerous (destructive) and leaks secrets.
-- It is intentionally a NO-OP now.
DELETE FROM invoice_payments WHERE false;
