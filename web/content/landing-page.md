# Soledgic: Payout Infrastructure for Marketplaces

## Stop Reconciling. Start Scaling.

You built a marketplace. Congrats. Now you're spending 10 hours a week chasing pennies in spreadsheets instead of building your product.

**Soledgic is the accounting system of record for platforms that pay creators, sellers, and contractors.**

[Get Started Free] [See the API Docs]

---

## The Three Crises Every Marketplace Hits

### 1. The Reconciliation Nightmare

**At 10 creators:** You reconcile manually. It takes an hour.

**At 1,000 creators doing 5 transactions/day:** That's 5,000 ledger entries daily.

Stripe says you have $100k. Your bank says $95k. Your database says you owe creators $92k.

*Where's the $8k?*

Without Soledgic, you hire two full-time ops people to chase pennies.

**With Soledgic:** Every transaction is double-entry. Debits equal credits. Always. The reconciliation runs itself.

---

### 2. The Sub-Ledger Trap

Your developer said: *"I'll just add a `balance` column to the users table."*

That works until:
- A creator requests a refund
- A payment fails mid-transfer
- You need to issue a partial credit
- A creator disputes their earnings

Now the `balance` column is wrong. There's no audit trail. You can't prove what happened.

**With Soledgic:** Full double-entry ledger with immutable transaction history. Every penny traced. When a creator sues for underpayment, you have the receipts.

---

### 3. The Accountant Veto

You're raising your Series A. The VC's due diligence team brings in an auditor.

The auditor asks for a Balance Sheet.

You show them your Stripe dashboard and a custom SQL query.

The auditor says: *"This isn't GAAP-compliant. I can't verify your revenue."*

**The deal dies. Or your valuation gets cut in half.**

**With Soledgic:** Balance Sheet, P&L, Trial Balance—all generated via API. Audit-ready from day one.

---

## What Soledgic Replaces

| Before Soledgic | After Soledgic |
|-----------------|----------------|
| Giant Google Sheets | Real-time API |
| Friday payout panic | Automated ledger |
| "Does this add up?" | Debits = Credits, guaranteed |
| 2 ops hires @ $150k/yr | $49/month API |
| Failed audits | GAAP-ready reports |
| Engineer time on admin tools | Engineers ship product |

---

## Built for Platforms That Move Money

- **Creator platforms** (royalties, rev-share)
- **Marketplaces** (seller payouts)
- **Gig economy** (contractor payments)
- **SaaS with payouts** (affiliates, referrals)

---

## The API

```bash
# Record a sale with automatic split
curl -X POST https://api.soledgic.com/record-sale \
  -H "x-api-key: sk_live_xxx" \
  -d '{
    "amount": 10000,
    "creator_id": "creator_123",
    "platform_fee_percent": 20
  }'

# Get creator balance
curl https://api.soledgic.com/get-balances?creator_id=creator_123

# Generate audit-ready reports
curl https://api.soledgic.com/balance-sheet
curl https://api.soledgic.com/profit-loss
curl https://api.soledgic.com/trial-balance
```

---

## Pricing

**Starter:** $0/mo
- 1,000 transactions/month
- Full double-entry ledger
- Basic reports

**Growth:** $49/mo
- 50,000 transactions/month
- AR/AP aging
- Bank reconciliation
- Priority support

**Scale:** $299/mo
- Unlimited transactions
- Multi-ledger support
- Custom integrations
- Dedicated support

[Start Free →]

---

## FAQ

**Do I need this if I use Stripe Connect?**
Stripe moves money. Soledgic tracks it. Stripe doesn't give you a Balance Sheet, sub-ledger balances, or audit trails. We do.

**Can't I just build this myself?**
You can. It'll take 3-6 months of engineering time, and you'll rebuild it twice when you hit edge cases (refunds, disputes, partial payments, failed transfers). Or you can integrate Soledgic in an afternoon.

**Is this GAAP compliant?**
Soledgic uses double-entry accounting. Every transaction creates balanced journal entries. Your accountant will love us.

**What if I'm just starting out?**
Start with the free tier. Migrate from your spreadsheet when you hit 100 creators. By the time you need the paid features, you'll know.

---

## The Founder's Payout Checklist

**Download our free guide:** *"7 Signs Your Payout System Is a Ticking Time Bomb"*

[Download PDF →]

---

<footer>
© 2025 Soledgic · API Docs · Status · GitHub
</footer>
