# Bank Statement Import Issues Runbook

## When to Use

- Users report "Failed to import" errors on the reconciliation import page
- health-check #5 (bank_reconciliation_backlog) shows old unmatched transactions
- Import sessions show `status: 'failed'` or `balance_verified: false`

---

## Diagnosis

### 1. Check import session history

```sql
SELECT id, file_name, file_format, status, row_count, imported_count,
       matched_count, balance_verified, balance_discrepancy, error,
       created_at
FROM import_sessions
WHERE ledger_id = '<LEDGER_ID>'
ORDER BY created_at DESC
LIMIT 10;
```

### 2. Check for unmatched bank transactions

```sql
SELECT COUNT(*) AS unmatched,
       MIN(transaction_date) AS oldest_unmatched
FROM bank_transactions
WHERE ledger_id = '<LEDGER_ID>'
  AND reconciliation_status = 'unmatched';
```

### 3. Check auto-match results

```sql
SELECT match_type, COUNT(*) AS matches
FROM bank_matches
WHERE ledger_id = '<LEDGER_ID>'
GROUP BY match_type;
```

---

## Common Issues

### File format not detected

The `detectFileFormat()` function checks file content, not extension. If it returns `unknown`:
- Verify the file is one of: CSV, OFX/QFX, CAMT.053, BAI2, MT940
- Check for BOM characters at the start of CSV files
- CAMT.053 requires `BkToCstmrStmt` in the XML

### Balance verification fails

`balance_verified: false` means `opening + sum(transactions) != closing`:
- Check `balance_discrepancy` — small amounts (<$1) may be rounding
- The file may have been truncated (missing transactions)
- Some banks include pending transactions in the balance but not in the transaction list

### Low match rate

If `matched_count / imported_count < 70%`:
- Run auto-match manually for unmatched transactions:
  ```sql
  SELECT auto_match_bank_aggregator_transaction(id)
  FROM bank_transactions
  WHERE ledger_id = '<LEDGER_ID>'
    AND reconciliation_status = 'unmatched'
  LIMIT 50;
  ```
- Check if ledger transactions exist for the import date range
- Verify amounts are in the same units (cents vs dollars)

### Duplicate imports skipped

This is expected behavior. The SHA-256 fingerprint (or FITID for OFX) prevents re-importing the same transactions. `skipped_count > 0` is normal for overlapping date ranges.

---

## Fallback: Manual CSV Import

If a specific format fails, users can always:
1. Export from their bank as CSV
2. Upload via the reconciliation import page
3. Map columns manually if auto-detection fails

The CSV parser supports Chase, Bank of America, Wells Fargo, Mercury, Relay templates plus generic column mapping.

---

## Supported Formats

| Format | Region | Notes |
|--------|--------|-------|
| CSV | Universal | Template auto-detection for major US banks |
| OFX/QFX | US | FITID used for deduplication |
| CAMT.053 | Europe/International | ISO 20022 XML, extracts IBAN + balances |
| BAI2 | US commercial | Cash management format, amounts in cents |
| MT940 | International | SWIFT format, comma decimal amounts |
