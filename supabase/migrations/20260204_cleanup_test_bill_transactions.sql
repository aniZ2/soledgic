-- Delete old bill payment transactions with test reference IDs

DELETE FROM transactions
WHERE reference_id = 'CC-TXN-12345'
  AND transaction_type = 'bill_payment'
