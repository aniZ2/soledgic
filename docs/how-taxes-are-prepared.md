# How Taxes Are Prepared in Soledgic

> Migration note (March 12, 2026): creator-oriented command names in older examples are legacy references. For current public integrations, use the resource-first treasury model described in `docs/RESOURCE_MODEL_MIGRATION.md`.

## What Soledgic Does

Soledgic tracks payment amounts and can now store a **limited shared tax profile** for operator-managed identity flows.

| Soledgic Does | Soledgic Does NOT |
|---------------|-------------------|
| Calculate annual totals per creator | Store full SSNs, EINs, or TINs |
| Track monthly payment breakdowns | Store raw tax documents or filing PDFs |
| Store legal name, address, TIN type, and TIN last4 in shared tax profiles | Act as the IRS filing service |
| Export payment summaries (CSV/JSON) | Generate filled 1099 PDFs |
| Identify creators over $600 threshold | File with IRS |

**Your responsibility:** Maintain the full recipient tax record and filing workflow. Soledgic can hold limited shared tax-profile data, but full TINs and filing artifacts should stay in your primary compliance systems or processor.

---

## Why Limited PII?

Storing full SSNs and filing documents creates:
- **Security liability** — data breach costs average $4.5M
- **Compliance burden** — IRS Publication 1281, state privacy laws
- **Encryption requirements** — at-rest, in-transit, key management

By keeping the stored tax profile narrow:
- Your accounting data stays clean and auditable
- You can reuse shared identity data across products
- Full TIN handling can stay in your existing compliance systems

---

## The Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR PLATFORM                                              │
│                                                             │
│  1. Collect W-9 from creators                               │
│     • Legal name                                            │
│     • TIN (SSN/EIN)                                         │
│     • Address                                               │
│     • Tax classification                                    │
│                                                             │
│  2. Store full TIN outside Soledgic                         │
│     Optional: sync legal name / address / last4            │
│     into shared tax profile for operator workflows          │
│                                                             │
│  3. Record sales via Soledgic API                           │
│     Use participant + checkout/payout/refund flows          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SOLEDGIC                                                   │
│                                                             │
│  4. Tracks payments by creator_id                           │
│     • Gross amounts                                         │
│     • Monthly breakdowns                                    │
│     • Transaction counts                                    │
│     • Optional shared tax profile metadata                  │
│                                                             │
│  5. Export payment summaries                                │
│     creator_id, gross_amount, jan, feb, mar...              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  YOUR TAX PROCESS                                           │
│                                                             │
│  6. Merge Soledgic export with your full W-9 records        │
│     JOIN on creator_id                                      │
│                                                             │
│  7. Generate 1099 forms (Tax1099, Track1099, etc.)          │
│                                                             │
│  8. File with IRS and send to recipients                    │
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
| `legal_name` | `Jane Doe LLC` | Optional shared tax profile |
| `tax_id_type` | `ein` | Optional shared tax profile |
| `tax_id_last4` | `4321` | Optional shared tax profile |
| `address_*` | `Austin, TX` | Optional shared tax profile |

### What's NOT Stored

- ❌ Full SSN / EIN / TIN
- ❌ Uploaded W-9 documents
- ❌ IRS filing receipts
- ❌ Full taxpayer identity record outside the shared-profile subset
- ❌ PDF documents

---

## API Usage

### Calculate Totals for One Creator

```typescript
const result = await soledgic.generateTaxSummary(2024, 'creator_jane_doe')

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
const result = await soledgic.generateAllTaxDocuments(2024)

// Response:
{
  created: 45,      // Documents created
  skipped: 12,      // Below $600 threshold
  total_amount: 284500.00
}
```

### Export CSV

```typescript
const csv = await soledgic.exportTaxDocuments(2024, 'csv')

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
│  ⓘ Limited Tax Profile Data Stored                         │
│  Soledgic tracks payment amounts and may store shared       │
│  tax-profile fields. Keep the full taxpayer record and      │
│  filing workflow in your primary compliance systems.        │
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
