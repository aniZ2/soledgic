# How Taxes Are Prepared in Soledgic

## What Soledgic Does

Soledgic tracks **payment amounts only**. It does not store any personally identifiable information (PII).

| Soledgic Does | Soledgic Does NOT |
|---------------|-------------------|
| Calculate annual totals per creator | Store SSNs, EINs, or TINs |
| Track monthly payment breakdowns | Store names or addresses |
| Export payment summaries (CSV/JSON) | Generate filled 1099 PDFs |
| Identify creators over $600 threshold | File with IRS |

**Your responsibility:** Maintain recipient records (W-9 data) in your own system, then merge with Soledgic's payment data for 1099 filing.

---

## Why No PII?

Storing SSNs and addresses creates:
- **Security liability** — data breach costs average $4.5M
- **Compliance burden** — IRS Publication 1281, state privacy laws
- **Encryption requirements** — at-rest, in-transit, key management

By keeping PII out of Soledgic:
- Your accounting data stays clean and auditable
- You control sensitive data in your existing systems
- No SSN encryption headaches

---

## The Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR PLATFORM                                              │
│                                                             │
│  1. Collect W-9 from creators (store in YOUR database)      │
│     • Legal name                                            │
│     • TIN (SSN/EIN)                                         │
│     • Address                                               │
│     • Tax classification                                    │
│                                                             │
│  2. Record sales via Soledgic API                           │
│     soledgic.recordSale({ creator_id, amount })             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SOLEDGIC                                                   │
│                                                             │
│  3. Tracks payments by creator_id                           │
│     • Gross amounts                                         │
│     • Monthly breakdowns                                    │
│     • Transaction counts                                    │
│                                                             │
│  4. Export payment summaries                                │
│     creator_id, gross_amount, jan, feb, mar...              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  YOUR TAX PROCESS                                           │
│                                                             │
│  5. Merge Soledgic export with your W-9 records             │
│     JOIN on creator_id                                      │
│                                                             │
│  6. Generate 1099 forms (Tax1099, Track1099, etc.)          │
│                                                             │
│  7. File with IRS and send to recipients                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Soledgic Tax Data

### What's Stored

| Field | Example | Purpose |
|-------|---------|---------|
| `recipient_id` | `creator_jane_doe` | Links to your records |
| `recipient_type` | `creator` | Creator vs contractor |
| `document_type` | `1099-K` | Form type |
| `tax_year` | `2024` | Reporting year |
| `gross_amount` | `15420.00` | Box 1a |
| `transaction_count` | `48` | Number of payments |
| `monthly_amounts` | `{"jan": 1200, ...}` | Box 5a-5l |
| `status` | `calculated` | Workflow state |

### What's NOT Stored

- ❌ Names (legal or business)
- ❌ SSN / EIN / TIN
- ❌ Addresses
- ❌ W-9 certifications
- ❌ PDF documents

---

## API Usage

### Calculate Totals for One Creator

```typescript
const result = await soledgic.request('tax-documents', {
  action: 'calculate',
  creator_id: 'creator_jane_doe',
  tax_year: 2024
})

// Response:
{
  creator_id: 'creator_jane_doe',
  tax_year: 2024,
  gross_payments: 15420.00,
  transaction_count: 48,
  requires_1099: true,
  monthly_totals: { jan: 1200, feb: 850, ... },
  threshold: 600
}
```

### Generate for All Creators

```typescript
const result = await soledgic.request('tax-documents', {
  action: 'generate_all',
  tax_year: 2024
})

// Response:
{
  created: 45,      // Documents created
  skipped: 12,      // Below $600 threshold
  total_amount: 284500.00
}
```

### Export CSV

```typescript
const csv = await soledgic.request('tax-documents', {
  action: 'export',
  tax_year: 2024,
  format: 'csv'
})

// Returns CSV file:
// recipient_id,gross_amount,jan,feb,mar,...
// creator_jane_doe,15420.00,1200,850,2100,...
```

---

## Merging with Your Records

### Example: PostgreSQL Join

```sql
-- Your W-9 table
CREATE TABLE creator_tax_info (
  creator_id TEXT PRIMARY KEY,
  legal_name TEXT,
  tin TEXT,          -- Encrypted!
  tin_type TEXT,
  address_line1 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT
);

-- After importing Soledgic CSV to temp table
SELECT 
  s.recipient_id,
  s.gross_amount,
  s.jan, s.feb, s.mar, -- ... monthly amounts
  w.legal_name,
  w.tin,
  w.address_line1,
  w.city,
  w.state,
  w.zip
FROM soledgic_1099_export s
JOIN creator_tax_info w ON s.recipient_id = w.creator_id
WHERE s.gross_amount >= 600;
```

### Example: Spreadsheet

1. Export from Soledgic → `1099_export_2024.csv`
2. Export from your CRM → `creator_w9_data.csv`
3. VLOOKUP on `creator_id` to merge
4. Import merged data into tax filing software

---

## Filing Options

| Service | How It Works |
|---------|--------------|
| **Tax1099.com** | Upload CSV, they file and mail |
| **Track1099** | API integration available |
| **TaxBandits** | Bulk upload, e-file + print |
| **IRS FIRE** | Direct e-file (technical) |
| **Paper filing** | Print forms, mail to IRS |

---

## Key Dates (US)

| Date | Action |
|------|--------|
| **January 31** | File 1099s with IRS |
| **January 31** | Send Copy B to recipients |
| **February 28** | Paper filing deadline |
| **March 31** | E-filing deadline |

---

## Dashboard Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  1099 TAX REPORTING                    Tax Year: [2024 ▾]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⓘ No Personal Information Stored                          │
│  Soledgic tracks payment amounts only. Export and merge     │
│  with your own recipient records for 1099 filing.           │
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Total   │  │Calculated│  │Exported │  │ Filed   │        │
│  │   47    │  │   20    │  │   20    │  │    7    │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│                                                             │
│  [Calculate All]  [Export CSV]  [Mark All Filed]            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Recipient ID        │ Gross Amount │ Status         │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ creator_jane_doe    │ $15,420.00   │ Exported       │   │
│  │ creator_bob_smith   │ $8,750.00    │ Calculated     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Checklist

- [ ] Collected W-9 from all creators (YOUR system)
- [ ] Exported payment summaries from Soledgic
- [ ] Merged payment data with recipient information
- [ ] Generated 1099 forms using tax software
- [ ] Filed with IRS by January 31
- [ ] Sent Copy B to recipients by January 31
- [ ] Marked as "filed" in Soledgic dashboard

---

## FAQ

**Q: Why doesn't Soledgic store TINs?**
A: Security. SSN storage requires encryption, access logging, and breach notification procedures. Your existing systems likely already handle this.

**Q: Can I still use Soledgic for 1099 compliance?**
A: Yes. Soledgic provides the payment data (the hard part). You merge with recipient data and file.

**Q: What if I don't have W-9s from creators?**
A: Request them! You can't file a 1099 without recipient info. This is your responsibility as the payer.

**Q: Does Soledgic support 1099-NEC?**
A: The system tracks both `1099-K` and `1099-NEC` document types. Choose based on your relationship with recipients.
