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
- Potentially issuing 1099s

## Why QuickBooks Doesn't Work

Your first instinct: "We'll just push transactions to QuickBooks."

Problems:

**1. QuickBooks is per-business**

You have 500 dental practices on your platform. QuickBooks wants 500 separate accounts.

**2. Your transactions don't map cleanly**

A patient pays $500 for a procedure. Your system knows: $400 goes to the dentist, $50 is your fee, $50 is for supplies. QuickBooks sees: "$500 payment."

**3. Multi-party transactions don't fit**

Some procedures involve the dentist, a specialist, and a lab. Three parties, one payment. QuickBooks can't express this.

---

## How Soledgic Handles Vertical Complexity

### For Your Engineers

```typescript
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY })

// Record a sale with automatic split calculation
await soledgic.recordSale({
  referenceId: 'payment_123',
  creatorId: 'dr_smith',
  amount: 120000, // $1,200 in cents
  processingFee: 350,
  productName: 'Root Canal - Patient John Doe',
})

// Set custom splits per creator
await soledgic.setCreatorSplit('dr_smith', 95) // 95% to dentist

// Get effective split for any creator
const split = await soledgic.getEffectiveSplit('dr_smith')
// { creator_percent: 95, source: 'custom_override' }

// Or use tiers for automatic splits based on volume
const tiers = await soledgic.listTiers()
// starter: 80%, growth: 85%, pro: 90%
```

### The Soledgic Dashboard

Your platform team manages everything visually:

**Dashboard → Directory**
Every creator/contractor on your platform:
- Name and ID
- Current balance
- Tier (affects split percentage)
- Custom split if set
- Transaction count
- Last activity

Click any creator to see their full profile and transaction history.

**Dashboard → Directory → Creator Profile**
For each business on your platform:
- Balance breakdown (ledger, held, available)
- Full transaction history
- Payout history
- Custom split percentage
- Metadata you've attached

**Dashboard → Settings → Tiers**
Configure automatic splits based on volume:
- Starter: First $10k → 80% to creator
- Growth: $10k-$50k → 85% to creator
- Pro: $50k+ → 90% to creator

Creators automatically promote as they hit thresholds.

**Dashboard → Reports → Creator Earnings**
Platform-wide view:
- Every creator's earnings for a period
- What they've been paid
- What you owe
- Filter by tier

Export for your records.

**Dashboard → Reports → 1099 Summary**
Tax compliance:
- Who's been paid ≥ $600 this tax year
- W-9 collection status
- Ready for 1099 filing

**Dashboard → Outflow**
Track payouts you've recorded:
- Pending payouts
- Completed payouts
- Payout method used
- Reference IDs for reconciliation

**Note**: Soledgic records payout transactions in your ledger. The actual money movement happens through your existing payment rails (Stripe Connect, direct bank transfer, etc.). We're not a money transmitter - we're your accounting layer.

**Your vertical expertise is your moat. Don't let generic accounting software slow you down.**

[Start free →](https://soledgic.com)
