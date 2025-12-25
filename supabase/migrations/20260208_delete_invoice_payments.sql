-- Delete all invoice payments for the Booklyverse test ledger
-- API key hash is SHA-256 of 'sk_live_28b75b47565bed2c5c6acaa3ffe3038f0dc897a57c83a1f2'
DELETE FROM invoice_payments
WHERE invoice_id IN (
  SELECT id FROM invoices
  WHERE ledger_id IN (
    SELECT id FROM ledgers
    WHERE api_key_hash = encode(sha256('sk_live_28b75b47565bed2c5c6acaa3ffe3038f0dc897a57c83a1f2'::bytea), 'hex')
  )
)
