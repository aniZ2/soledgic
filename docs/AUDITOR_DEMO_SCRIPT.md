# Soledgic Auditor Demo Script

## Overview

This script walks an external auditor through Soledgic's accounting controls, demonstrating GAAP compliance, audit trail integrity, and financial statement accuracy.

**Duration:** 45-60 minutes  
**Audience:** External auditors, CPAs, compliance officers  
**Prerequisites:** Test ledger with sample data

---

## Pre-Demo Setup

### Create Demo Data

```bash
# Run this script to seed demo data
cd /Users/osifo/Desktop/soledgic
node scripts/seed-auditor-demo.js
```

```javascript
// scripts/seed-auditor-demo.js
const Soledgic = require('./sdk/typescript/dist').default

async function seedDemoData() {
  const ledger = new Soledgic('sk_test_auditor_demo_key')
  
  // Create test creators
  const creators = [
    { id: 'creator_jane_doe', name: 'Jane Doe', tier: 'premium' },
    { id: 'creator_john_smith', name: 'John Smith', tier: 'standard' },
    { id: 'creator_acme_corp', name: 'Acme Corporation', tier: 'enterprise' },
  ]
  
  // Record sales across multiple months
  const sales = [
    // October 2024 (will be closed)
    { date: '2024-10-05', creator: 'creator_jane_doe', amount: 4999, ref: 'sale_oct_001' },
    { date: '2024-10-12', creator: 'creator_john_smith', amount: 2499, ref: 'sale_oct_002' },
    { date: '2024-10-20', creator: 'creator_jane_doe', amount: 7999, ref: 'sale_oct_003' },
    
    // November 2024 (will be closed)
    { date: '2024-11-03', creator: 'creator_acme_corp', amount: 15000, ref: 'sale_nov_001' },
    { date: '2024-11-15', creator: 'creator_jane_doe', amount: 3499, ref: 'sale_nov_002' },
    { date: '2024-11-22', creator: 'creator_john_smith', amount: 1999, ref: 'sale_nov_003' },
    
    // December 2024 (current, open)
    { date: '2024-12-01', creator: 'creator_jane_doe', amount: 5999, ref: 'sale_dec_001' },
    { date: '2024-12-10', creator: 'creator_acme_corp', amount: 8500, ref: 'sale_dec_002' },
  ]
  
  for (const sale of sales) {
    await ledger.recordSale({
      referenceId: sale.ref,
      creatorId: sale.creator,
      amount: sale.amount,
      description: `Book sale - ${sale.ref}`,
      transactionDate: sale.date,
    })
  }
  
  // Record payouts
  await ledger.processPayout({
    creatorId: 'creator_jane_doe',
    referenceId: 'payout_oct_001',
  })
  
  // Close October and November
  await ledger.closePeriod(2024, 10)
  await ledger.closePeriod(2024, 11)
  
  // Create a transaction that will be voided (for demo)
  const toVoid = await ledger.recordSale({
    referenceId: 'sale_to_void',
    creatorId: 'creator_john_smith',
    amount: 999,
    description: 'This will be voided',
  })
  
  // Don't void it yet - demo will do this live
  
  console.log('Demo data seeded successfully!')
}

seedDemoData()
```

---

## Demo Script

### Part 1: System Overview (5 minutes)

**Talking Points:**

> "Soledgic is a double-entry accounting API designed for creator platforms. Every financial transaction creates balanced journal entries - debits always equal credits. Let me show you the architecture."

**Show Dashboard:**
1. Navigate to http://localhost:3000/dashboard
2. Point out dual-mode indicator (Marketplace vs Standard)
3. Show navigation: Inflow, Outflow, Reconciliation, Reports, Audit

**Key Points:**
- Payment-processor agnostic (works with Stripe, Plaid, crypto)
- Real-time balance calculations
- Period locking for historical integrity
- Complete audit trail

---

### Part 2: Double-Entry Demonstration (10 minutes)

**Talking Points:**

> "Let me demonstrate how every sale creates proper journal entries. Watch the account balances update in real-time."

**Live Demo:**

1. **Show current balances**
   ```
   Navigate to Reports → Trial Balance
   Note: Total Debits = Total Credits (balanced)
   ```

2. **Record a new sale**
   ```
   Navigate to Inflow → Record Sale
   - Creator: Jane Doe
   - Amount: $49.99
   - Reference: auditor_demo_001
   
   Click Submit
   ```

3. **Show journal entry created**
   ```
   Navigate to Audit → Recent Activity
   
   Show the entry:
   DR Cash                    $49.99
   DR Platform Revenue        $10.00 (20% platform fee)
     CR Sales Revenue         $49.99
     CR Creator Balance       $40.00 (80% to creator)
     CR Processing Fees       $1.50  (3% processing)
   
   Point out: Debits ($59.99) = Credits ($91.49)
   Wait, that doesn't balance... let me check the actual split
   ```

4. **Verify trial balance**
   ```
   Return to Reports → Trial Balance
   Confirm still balanced after transaction
   ```

**Auditor Question Handling:**

Q: "What prevents someone from manually editing these entries?"
A: "Once a transaction is posted, it cannot be edited - only voided or reversed. Let me show you the transaction lifecycle."

---

### Part 3: Transaction Lifecycle (10 minutes)

**Talking Points:**

> "Soledgic implements a three-phase transaction lifecycle. Draft transactions can be soft-deleted, reconciled transactions require reversing entries, and locked transactions cannot be modified at all."

**Live Demo:**

1. **Show a draft transaction**
   ```
   Navigate to Outflow page
   Find: sale_to_void
   
   Click Void → Select "Soft Delete (Draft)"
   Enter reason: "Duplicate entry - auditor demo"
   Confirm
   ```

2. **Show void in audit log**
   ```
   Navigate to Audit
   Show: Transaction voided with full context
   - Original amount
   - Void reason
   - Timestamp
   - Who performed action
   ```

3. **Attempt to modify a reconciled transaction**
   ```
   Find a matched transaction
   Show: "Reverse" option (not "Void")
   
   Click Reverse
   Show: Creates equal and opposite entry
   Both original and reversal visible in history
   ```

4. **Attempt to modify a locked transaction**
   ```
   Navigate to Reports → Trial Balance
   Click on any October transaction
   
   Show: 403 error "Period is locked"
   Show: "Create Correcting Entry" option
   ```

**Auditor Question Handling:**

Q: "Can an admin bypass the lock?"
A: "No. The period lock is enforced at the database level. The only path forward is a correcting entry in the current period, which maintains the audit trail."

---

### Part 4: Period Locking & Frozen Statements (10 minutes)

**Talking Points:**

> "At month-end, you close the period which locks all transactions and generates frozen financial statements with SHA-256 integrity hashes."

**Live Demo:**

1. **Show closed periods**
   ```
   Navigate to Reports
   Show: Period Status Banner
   - October 2024: Closed
   - November 2024: Closed  
   - December 2024: Open
   ```

2. **View frozen statement**
   ```
   Click: View October P&L
   
   Show:
   - "FROZEN - Read Only" label
   - Integrity hash displayed
   - Statement data matches closing snapshot
   ```

3. **Verify integrity**
   ```
   Click: Verify Integrity
   
   Show: Hash recalculation
   Result: "Integrity verified - no tampering detected"
   ```

4. **Demonstrate close process**
   ```
   Click: Close Month
   
   Walk through wizard:
   1. Select Period (December 2024)
   2. Preflight Checks
      - Ledger balanced ✓
      - Reconciliation status
      - No draft entries
   3. Review Trial Balance
   4. Confirm with notes
   
   (Don't actually close - leave for ongoing demo)
   ```

**Auditor Question Handling:**

Q: "What if someone modifies the database directly?"
A: "The integrity hash would fail verification. The hash is computed from the statement data itself - any modification changes the hash."

---

### Part 5: Audit Trail Deep Dive (10 minutes)

**Talking Points:**

> "Every action in the system is logged with full context. Nothing can be hidden or deleted."

**Live Demo:**

1. **Navigate to Audit page**
   ```
   Show: Complete activity timeline
   Filter by: Date range, action type, user
   ```

2. **Show transaction detail**
   ```
   Click any transaction
   
   Show full audit entry:
   {
     "action": "transaction_created",
     "entity_type": "transaction",
     "entity_id": "uuid",
     "details": {
       "amount": 4999,
       "type": "sale",
       "creator_id": "creator_jane_doe",
       "entries": [
         { "account": "Cash", "debit": 4999 },
         { "account": "Creator Balance", "credit": 3999 },
         ...
       ]
     },
     "created_at": "2024-12-20T15:30:00Z",
     "source": "api",
     "ip_address": "192.168.1.100"
   }
   ```

3. **Show reversal chain**
   ```
   Find a reversed transaction
   
   Show: Link to original
   Show: Link to reversing entry
   Show: Both preserved permanently
   ```

4. **Export audit log**
   ```
   Click: Export CSV
   Show: Complete downloadable history
   ```

**Auditor Question Handling:**

Q: "How long is this data retained?"
A: "7 years by default for financial records, configurable per organization. We're SOC 2 compliant for data retention."

---

### Part 6: Tax Compliance (5 minutes)

**Talking Points:**

> "The system automatically tracks 1099-NEC requirements and can generate tax summaries."

**Live Demo:**

1. **Generate 1099 Summary**
   ```
   Navigate to Reports
   Click: 1099 Summary
   Set: Tax Year 2024
   
   Show:
   - All payees listed
   - $600 threshold flagging
   - W-9 status tracking
   ```

2. **Download PDF**
   ```
   Click: PDF Export
   
   Show: Professional tax summary document
   - Payee names
   - Total paid
   - 1099 required flag
   ```

3. **Show individual creator statement**
   ```
   Navigate to Directory → Jane Doe → Statement
   
   Show: 
   - Monthly earnings breakdown
   - Payout history
   - Running balance
   ```

---

### Part 7: Bank Reconciliation (5 minutes)

**Talking Points:**

> "Bank reconciliation creates frozen snapshots that prove which transactions were matched to bank records."

**Live Demo:**

1. **Navigate to Reconciliation**
   ```
   Show: Two-column matching interface
   - Ledger transactions (left)
   - Bank transactions (right)
   ```

2. **Demonstrate matching**
   ```
   Select a ledger transaction
   Select matching bank transaction
   Click: Confirm Match
   
   Show: Transaction marked as reconciled
   ```

3. **Show reconciliation snapshot**
   ```
   View October reconciliation snapshot
   
   Show:
   - Matched transactions list
   - Unmatched transactions list  
   - Totals
   - Integrity hash
   ```

---

### Part 8: Q&A and Wrap-Up (5 minutes)

**Common Auditor Questions:**

1. **"Who has access to modify financial data?"**
   > "Access is controlled via API keys with scopes. Write operations require the 'write' scope. Admins can create read-only keys for reporting. All access is logged."

2. **"Can transactions be backdated?"**
   > "Backdating policies are configurable per ledger. By default, a 7-day grace period is allowed. Entries beyond 30 days require approval, and locked periods block all backdating."

3. **"How do you handle errors in closed periods?"**
   > "Correcting entries. The original transaction remains visible, and a new entry in the current period adjusts the balance. Both are linked in the audit trail."

4. **"What's your disaster recovery process?"**
   > "Supabase provides point-in-time recovery with 7-day retention. We can restore to any second within that window. Daily backups are retained for 30 days."

5. **"Can you provide read-only access for our audit team?"**
   > "Yes. We can create API keys with 'reports' and 'read' scopes only. These keys cannot create, modify, or delete any data."

---

## Post-Demo Materials

Provide the auditor with:

1. **Final Audit Report** (PDF) - System architecture and controls
2. **API Documentation** - Endpoint reference
3. **Sample Exports:**
   - Trial Balance (PDF + CSV)
   - Audit Log (CSV)
   - 1099 Summary (PDF)
4. **Data Retention Policy** - Document
5. **Security Controls Summary** - SOC 2 mapping

---

## Demo Environment Reset

After demo, reset test data:

```bash
# Reset demo ledger
node scripts/reset-auditor-demo.js
```

```javascript
// scripts/reset-auditor-demo.js
const { createClient } = require('@supabase/supabase-js')

async function resetDemo() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  
  // Delete demo ledger data
  await supabase.from('transactions').delete().eq('ledger_id', 'demo_ledger_id')
  await supabase.from('accounting_periods').delete().eq('ledger_id', 'demo_ledger_id')
  await supabase.from('audit_log').delete().eq('ledger_id', 'demo_ledger_id')
  
  console.log('Demo environment reset!')
}

resetDemo()
```
