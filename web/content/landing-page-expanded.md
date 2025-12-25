# Soledgic: The Accounting Engine for Platforms That Move Money

## Your Database and Your Bank Account Should Match. They Don't.

Soledgic is a double-entry ledger API for any platform that collects money, takes a cut, and owes the rest to someone else.

[Start Free] [API Docs]

---

## Who Needs Soledgic?

### Creator Platforms & Marketplaces

Royalties, rev-shares, seller payouts. Thousands of micro-transactions with complex splits.

**The mess:** 10,000 creators × 5 transactions/day = reconciliation nightmare.

**Soledgic fix:** Atomic split logic. One API call records the sale, your fee, and the creator's balance. All balanced. All auditable.

---

### Vertical SaaS with Embedded Payments

HVAC software. Legal practice management. Property management. Any vertical tool that touches money.

**The mess:** You're an expert in your niche, not accounting. But now you need to track what's owed to technicians, attorneys, or landlords.

**Soledgic fix:** Drop in an accounting engine. Focus on your UI. We handle the ledger.

---

### Logistics & "Uber for X" Platforms

Rentals, deliveries, bookings. Customer pays $500. You hold it. Take $50. Owe $450 to the provider.

**The mess:** How much cash is *actually yours* vs. *restricted* because you owe it to vendors?

**Soledgic fix:** AR/AP aging reports. Know your float. Know your liability. Know your real cash position.

---

### Fintech-Lite: Wallets, Rewards, Stored Value

Betting apps. Corporate spend cards. Loyalty programs. Any app with a "balance."

**The mess:** Two transactions hit the same balance at the same millisecond. One of them gets lost. Or worse—you double-spend.

**Soledgic fix:** Concurrent-safe balance updates. No double-spend.

---

### E-commerce Aggregators & Multi-Brand Portfolios

50 Shopify stores. One holding company. One set of books.

**The mess:** Consolidated financials across entities. Manual exports. Spreadsheet hell.

**Soledgic fix:** Multi-ledger architecture with slugs. Each store is a sub-ledger. Roll up to one master Balance Sheet.

---

## The Expansion Map

| Sector | Pain Point | Soledgic Killer Feature |
|--------|------------|------------------------|
| Creator Platforms | Complex rev-shares | Atomic split logic |
| Vertical SaaS | Audit compliance | GAAP-compliant Balance Sheets |
| Logistics/Marketplaces | Cash flow / float tracking | AR/AP Aging Reports |
| Fintech/Wallets | Concurrency & double-spend | Concurrent-safe balance updates |
| E-commerce Aggregators | Consolidated reporting | Multi-ledger architecture |
| Ad-Tech | Millions of micro-transactions | High-volume resilience |

---

## The API You'll Actually Understand

Most ledger systems make you think in account IDs:

```
POST /entries
{ "account_id": "acct_7829af3c", "amount": 500 }
```

What is `acct_7829af3c`? Nobody knows.

**Soledgic speaks your language:**

```
POST /record-sale
{ 
  "amount": 50000,
  "creator_id": "installer_jones",
  "platform_fee_percent": 20
}
```

No UUIDs. No account lookups. Just the data you care about.

This is why developers call Soledgic the **"Stripe for Ledgering"**—easy to read, easy to write, impossible to break.

---

## What You Get

### Real-Time Balances
```bash
GET /get-balances?creator_id=installer_jones
# → { "available": 4500.00, "pending": 500.00 }
```

### Audit-Ready Reports
```bash
GET /balance-sheet
GET /profit-loss  
GET /trial-balance
GET /ar-aging
GET /ap-aging
```

### Atomic Transactions
Every operation is double-entry. Debits = Credits. Always.

```bash
POST /record-sale
# Creates balanced journal entries automatically
# Debit: Cash
# Credit: Revenue  
# Credit: Creator Balance (liability)
```

### Multi-Entity Support
```bash
POST /create-ledger
{ "slug": "store-california", "parent_ledger": "holding-company" }
```

---

## The Bottom Line

**If your platform:**
- Collects money from customers
- Takes a fee
- Owes the rest to someone else

**Then your database and your bank account should match.**

They probably don't.

**Soledgic makes them match.**

[Start Free →]

---

## Pricing

| Plan | Transactions/mo | Price | Best For |
|------|-----------------|-------|----------|
| **Starter** | 1,000 | Free | Validating your MVP |
| **Growth** | 50,000 | $49/mo | Early traction |
| **Scale** | Unlimited | $299/mo | Series A and beyond |

All plans include: Double-entry ledger, Balance Sheet, P&L, Trial Balance, AR/AP aging, API access.

[Start Free →]

---

## FAQ

**Is this just for creator platforms?**

No. Creator platforms are our entry point because their accounting is notoriously messy. But Soledgic works for any platform that moves money between parties: vertical SaaS, logistics, fintech, e-commerce aggregators.

**Can you handle high volume?**

Yes. Concurrent-safe balance updates. Partial payments, voids, reversals—all atomic, all balanced.

**What about multi-entity / consolidated reporting?**

Yes. Create sub-ledgers with slugs. Roll up to a parent ledger. Get consolidated Balance Sheets across all entities.

**Do I need to understand accounting?**

No. You call `record-sale`. We create the journal entries. You get the reports. The accounting happens automatically.

---

<footer>
Soledgic · API Docs · Pricing · Status
© 2025 Osifo Holdings, L.L.C.
</footer>
