-- Delete all invoices for the Booklyverse test ledger
DELETE FROM invoices
WHERE ledger_id IN (
  SELECT id FROM ledgers
  WHERE api_key_hash = encode(sha256('sk_live_28b75b47565bed2c5c6acaa3ffe3038f0dc897a57c83a1f2'::bytea), 'hex')
)
