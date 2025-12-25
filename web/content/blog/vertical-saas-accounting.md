# Vertical SaaS Needs Vertical Accounting

*Why QuickBooks doesn't work for embedded payments*

---

You built software for dentists. Or HVAC contractors. Or law firms.

Your users love it. Then they ask: "Can you also handle payments?"

You integrate Stripe. Money starts flowing. And suddenly you're in the accounting business without knowing it.

---

## The Vertical SaaS Trap

You're an expert in your vertical. You know dental practice management or field service scheduling inside and out.

You don't know accounting. Why would you?

But the moment you handle payments on behalf of your customers, accounting becomes your business.

**You are now:**
- Collecting money from their clients
- Taking a platform fee
- Owing them the remainder
- Responsible for reconciliation

## Why QuickBooks Doesn't Work

Your first instinct: "We'll just push transactions to QuickBooks."

Problems:

**1. QuickBooks is per-business**

You have 500 dental practices on your platform. QuickBooks wants 500 separate accounts.

**2. Your transactions don't map cleanly**

A patient pays $500 for a procedure. Your system knows: $400 goes to the dentist, $50 is your fee, $50 is for supplies. QuickBooks sees: "$500 payment."

**3. Multi-party transactions don't fit**

Some procedures involve the dentist, a specialist, and a lab. Three parties, one payment. QuickBooks can't express this.

## What Vertical SaaS Actually Needs

Your accounting system needs to understand your domain:

**For Dental/Medical:**
- Patient pays $1,200
- Insurance covers $800, patient pays $400
- Platform fee: $60
- Dentist payout: $1,140

**For Field Service:**
- Customer pays $450 for HVAC repair
- Labor: $300 (tech gets 70% = $210)
- Parts: $150 (30% markup)
- Platform fee: $45

**For Property Management:**
- Rent: $2,000
- Management fee (10%): $200
- Reserve contribution: $100
- Owner payout: $1,700

---

## How Soledgic Handles Vertical Complexity

Soledgic gives you a sub-ledger per customer with multi-party transaction support:

```typescript
import { Soledgic } from '@soledgic/sdk';

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY });

// Create a ledger for each business on your platform
const dentistLedger = await soledgic.createLedger({
  businessName: 'Smith Dental Practice',
  parentOrganization: 'your_dental_platform',
});

// Record a complex multi-party transaction
await soledgic.recordSale({
  ledgerId: dentistLedger.id,
  amount: 120000, // $1,200
  splits: [
    { payeeId: 'dr_smith', amount: 114000 },      // $1,140 to dentist
    { payeeId: 'platform_fee', amount: 6000 },   // $60 platform fee
  ],
  metadata: {
    patient: 'john_doe',
    procedure: 'root_canal',
    insuranceClaim: 'INS-12345',
  },
});

// Each business sees their own reports
const dentistPnL = await soledgic.getProfitLoss({
  ledgerId: dentistLedger.id,
  startDate: '2024-01-01',
  endDate: '2024-12-31',
});

// You see roll-up across all businesses
const platformPnL = await soledgic.getProfitLoss({
  organization: 'your_dental_platform',
});
```

Field service with tech payouts:

```typescript
// HVAC job completion
await soledgic.recordSale({
  ledgerId: contractorLedger.id,
  amount: 45000, // $450
  splits: [
    { payeeId: 'tech_mike', amount: 21000, type: 'labor' },    // 70% of $300
    { payeeId: 'parts_cost', amount: 11500, type: 'cogs' },    // Parts at cost
    { payeeId: 'platform', amount: 4500, type: 'fee' },        // Platform fee
    { payeeId: 'parts_margin', amount: 3500, type: 'revenue' }, // Parts markup
    { payeeId: 'contractor', amount: 4500, type: 'labor' },    // 30% of labor
  ],
  metadata: {
    jobId: 'JOB-4521',
    customer: 'ABC Corp',
    serviceType: 'hvac_repair',
  },
});
```

Sub-ledgers per customer. Multi-party splits. Roll-up reporting. All through one API.

**Your vertical expertise is your moat. Don't let generic accounting software slow you down.**

[Start free →](https://soledgic.com)
