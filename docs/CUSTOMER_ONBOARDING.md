# Soledgic Customer Onboarding Guide

## Overview

This document outlines the process for onboarding the first external customer to Soledgic. It covers technical setup, configuration, testing, and go-live procedures.

---

## 1. Pre-Onboarding Checklist

### Customer Qualification

Before onboarding, verify the customer meets these criteria:

| Criteria | Requirement | Notes |
|----------|-------------|-------|
| Business Type | Creator platform, marketplace, or SaaS | Must have revenue splits or contractor payments |
| Transaction Volume | 100-100,000/month | Starter to Growth plans |
| Technical Capability | Can integrate via API | REST API, webhooks |
| Compliance Needs | 1099 reporting, audit trail | US-based or similar requirements |

### Internal Readiness

- [ ] Multi-tenant hardening deployed
- [ ] Rate limiting active
- [ ] Monitoring alerts configured
- [ ] Support process documented
- [ ] Billing integration ready (Stripe)
- [ ] Terms of Service finalized
- [ ] Data Processing Agreement ready

---

## 2. Customer Intake Form

### Business Information

```yaml
Company Name: ________________
Legal Entity: ________________
Website: ________________
Primary Contact: ________________
Email: ________________
Phone: ________________

Business Model:
  [ ] Creator marketplace (revenue splits)
  [ ] SaaS with contractor payments
  [ ] E-commerce with affiliates
  [ ] Other: ________________

Estimated Monthly Volume:
  [ ] < 100 transactions
  [ ] 100 - 1,000 transactions
  [ ] 1,000 - 10,000 transactions
  [ ] 10,000+ transactions

Number of Payees (creators/contractors):
  [ ] < 10
  [ ] 10 - 100
  [ ] 100 - 1,000
  [ ] 1,000+

Revenue Split Model:
  Default Platform Fee: _____%
  Creator Share: _____%
  Processing Fee Pass-through: [ ] Yes [ ] No
  
  Multiple Tiers: [ ] Yes [ ] No
  If yes, describe: ________________
```

### Technical Requirements

```yaml
Integration Type:
  [ ] Direct API integration
  [ ] Webhook-driven
  [ ] SDK (TypeScript/JavaScript)
  [ ] Dashboard-only

Payment Processors Used:
  [ ] Stripe
  [ ] PayPal
  [ ] Square
  [ ] Crypto (specify): ________________
  [ ] Other: ________________

Payout Methods:
  [ ] Stripe Connect
  [ ] PayPal Payouts
  [ ] ACH (bank transfer)
  [ ] Check
  [ ] Crypto
  [ ] Other: ________________

Existing Systems to Integrate:
  [ ] QuickBooks
  [ ] Xero
  [ ] Custom ERP
  [ ] None

Webhook Endpoint: ________________
IP Allowlist Required: [ ] Yes [ ] No
If yes, IPs: ________________
```

### Compliance Requirements

```yaml
Tax Jurisdiction:
  [ ] US (1099-NEC required)
  [ ] International (specify): ________________

W-9 Collection:
  [ ] We collect W-9s ourselves
  [ ] Need W-9 collection integration
  [ ] Not applicable

Audit Requirements:
  [ ] SOC 2 compliance needed
  [ ] External auditor access needed
  [ ] Custom retention requirements

Data Residency:
  [ ] US only
  [ ] EU/GDPR requirements
  [ ] Other: ________________
```

---

## 3. Onboarding Process

### Phase 1: Account Setup (Day 1)

#### 1.1 Create Organization

```sql
-- Admin creates organization
INSERT INTO organizations (name, slug, plan, max_ledgers, max_transactions_per_month, max_creators)
VALUES (
  'Customer Company Name',
  'customer-slug',
  'starter', -- or 'growth', 'enterprise'
  3,          -- ledgers allowed
  10000,      -- monthly transaction limit
  100         -- creator limit
);
```

#### 1.2 Create Admin User

```javascript
// Invite customer admin
const { data, error } = await supabase.auth.admin.inviteUserByEmail(
  'admin@customer.com',
  { 
    data: { 
      organization_id: orgId,
      role: 'owner'
    }
  }
)
```

#### 1.3 Create Ledger

```javascript
const ledger = await adminClient.createLedger({
  organizationId: orgId,
  businessName: 'Customer Company',
  mode: 'marketplace', // or 'standard'
  defaultCurrency: 'USD',
  fiscalYearStart: 1, // January
})

// Return API key to customer securely
console.log('API Key:', ledger.apiKey)
// sk_live_customer_xxxxxxxxxxxxxxxxxxxxxxxx
```

#### 1.4 Configure Revenue Splits

```javascript
const soledgic = new Soledgic(ledger.apiKey)

// Create split tiers based on customer requirements
await soledgic.manageSplits({
  action: 'set_tiers',
  tiers: [
    { name: 'standard', creatorPercentage: 70, minPayout: 2500 },
    { name: 'premium', creatorPercentage: 80, minPayout: 1000 },
    { name: 'enterprise', creatorPercentage: 85, minPayout: 0 },
  ]
})
```

### Phase 2: Integration Support (Days 2-5)

#### 2.1 Provide Documentation

Send customer:
1. API documentation link
2. SDK installation guide
3. Webhook setup guide
4. Sample code for their use case

#### 2.2 Integration Call

Schedule 1-hour technical call to cover:

1. **Authentication**
   ```javascript
   // Show API key usage
   const soledgic = new Soledgic('sk_live_customer_xxx')
   ```

2. **Recording Sales**
   ```javascript
   // Their primary use case
   const sale = await soledgic.recordSale({
     referenceId: 'order_123',      // Their order ID
     creatorId: 'creator_456',      // Their creator ID
     amount: 2999,                  // Cents
     description: 'Premium eBook',
     metadata: {
       productId: 'prod_789',
       customerEmail: 'buyer@example.com'
     }
   })
   ```

3. **Webhook Integration**
   ```javascript
   // Their webhook handler
   app.post('/webhooks/soledgic', async (req, res) => {
     const event = req.body
     
     switch (event.type) {
       case 'payout.completed':
         // Update their database
         await updateCreatorPayoutStatus(event.data.creatorId, 'paid')
         break
       case 'period.closed':
         // Generate their reports
         await generateMonthlyReport(event.data.periodId)
         break
     }
     
     res.status(200).send('OK')
   })
   ```

4. **Error Handling**
   ```javascript
   try {
     await soledgic.recordSale(...)
   } catch (error) {
     if (error.status === 403 && error.code === 'PERIOD_LOCKED') {
       // Handle locked period
       console.log('Create correcting entry instead')
     } else if (error.status === 429) {
       // Rate limited - retry with backoff
       await sleep(60000)
       retry()
     }
   }
   ```

#### 2.3 Sandbox Testing

Provide test API key:
```
sk_test_customer_xxxxxxxxxxxxxxxxxxxxxxxx
```

Test scenarios to complete:
- [ ] Record 10 test sales
- [ ] Create 3 test creators
- [ ] Process 1 test payout
- [ ] Generate trial balance
- [ ] Close a test period
- [ ] Verify webhook delivery

### Phase 3: Data Migration (Days 5-10)

#### 3.1 Historical Data Import

If customer has existing data:

```javascript
// Bulk import script
const historicalSales = await customer.getHistoricalSales()

for (const sale of historicalSales) {
  await soledgic.recordSale({
    referenceId: sale.orderId,
    creatorId: sale.creatorId,
    amount: sale.amount,
    transactionDate: sale.date, // Backdate to original date
    metadata: {
      imported: true,
      originalSystem: 'legacy',
      importedAt: new Date().toISOString()
    }
  })
}

// Close historical periods
for (const month of historicalMonths) {
  await soledgic.closePeriod(month.year, month.month)
}
```

#### 3.2 Creator Migration

```javascript
// Import existing creators with balances
const creators = await customer.getCreators()

for (const creator of creators) {
  // Record opening balance as adjustment
  if (creator.existingBalance > 0) {
    await soledgic.recordSale({
      referenceId: `opening_balance_${creator.id}`,
      creatorId: creator.id,
      amount: creator.existingBalance,
      description: 'Opening balance from migration',
      metadata: {
        migrated: true,
        sourceSystem: 'legacy'
      }
    })
  }
}
```

#### 3.3 Reconciliation

After import:
1. Generate trial balance
2. Compare to customer's existing records
3. Document any discrepancies
4. Create adjusting entries if needed

### Phase 4: Go-Live (Day 10-14)

#### 4.1 Production Cutover Checklist

```markdown
## Pre-Cutover (Day Before)

- [ ] Test API key works in production
- [ ] Webhook endpoint verified
- [ ] Historical data imported and reconciled
- [ ] All periods properly closed
- [ ] Customer team trained on dashboard
- [ ] Support escalation path documented

## Cutover Day

- [ ] Switch customer code to production API key
- [ ] Monitor first 10 transactions
- [ ] Verify balances updating correctly
- [ ] Confirm webhooks firing
- [ ] Customer confirms data appearing correctly

## Post-Cutover (Day After)

- [ ] Generate first day's trial balance
- [ ] Review audit log for any errors
- [ ] Check rate limit metrics
- [ ] Follow up call with customer
```

#### 4.2 Go-Live Monitoring

First 48 hours monitoring:

```sql
-- Monitor customer's API usage
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as requests,
  COUNT(*) FILTER (WHERE details->>'success' = 'true') as successful,
  COUNT(*) FILTER (WHERE details->>'success' = 'false') as failed
FROM audit_log
WHERE ledger_id = 'customer_ledger_id'
  AND created_at >= NOW() - INTERVAL '48 hours'
GROUP BY 1
ORDER BY 1;

-- Check for any errors
SELECT action, details->>'error' as error, COUNT(*)
FROM audit_log
WHERE ledger_id = 'customer_ledger_id'
  AND details->>'success' = 'false'
  AND created_at >= NOW() - INTERVAL '48 hours'
GROUP BY 1, 2;
```

---

## 4. Post-Onboarding Support

### Week 1 Check-In

Call agenda:
1. Review transaction volume
2. Any integration issues?
3. Dashboard walkthrough
4. Upcoming features preview

### Month 1 Review

1. Generate first month's P&L
2. Review 1099 tracking setup
3. Close first full month together
4. Collect feedback

### Ongoing Support

| Issue Type | Response Time | Channel |
|------------|---------------|---------|
| Production down | 15 minutes | PagerDuty → Slack |
| API errors | 4 hours | Email → Zendesk |
| Feature requests | 1 week | Email → Roadmap |
| Billing questions | 24 hours | Email |

---

## 5. Pricing & Billing

### Plan Tiers

| Plan | Monthly Price | Transactions | Creators | Ledgers | Support |
|------|---------------|--------------|----------|---------|---------|
| Starter | $49 | 1,000 | 25 | 1 | Email |
| Growth | $199 | 10,000 | 100 | 3 | Priority |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited | Dedicated |

### Overage Pricing

- Additional transactions: $0.02 each
- Additional creators: $1/creator/month
- Additional ledgers: $29/ledger/month

### Billing Setup

```javascript
// Stripe subscription creation
const subscription = await stripe.subscriptions.create({
  customer: stripeCustomerId,
  items: [
    { price: 'price_soledgic_growth' }
  ],
  metadata: {
    soledgic_org_id: orgId
  }
})

// Update organization
await supabase
  .from('organizations')
  .update({ 
    stripe_customer_id: stripeCustomerId,
    subscription_status: 'active'
  })
  .eq('id', orgId)
```

---

## 6. First Customer Specifics

### Booklyverse (Internal)

Already onboarded as test customer:
- Ledger ID: `0a885204-e07a-48c1-97e9-495ac96a2581`
- Mode: Marketplace
- Tier: Premium (80/20 split)
- Status: Active development

### Target First External Customer Profile

Ideal first customer:
- **Industry:** Digital content marketplace or course platform
- **Size:** 50-500 creators
- **Volume:** 1,000-5,000 transactions/month
- **Technical:** Has engineering team for API integration
- **Timeline:** Ready to integrate within 30 days

### Outreach Template

```
Subject: Accounting API for Creator Platforms - Soledgic

Hi [Name],

I noticed [Company] operates a creator marketplace. Managing revenue splits, 
payouts, and 1099 compliance at scale is complex - we built Soledgic to solve 
exactly this.

Soledgic is a double-entry accounting API that:
- Automatically calculates revenue splits
- Tracks creator balances in real-time
- Handles 1099 compliance out of the box
- Provides audit-grade financial reports

We're currently onboarding our first external customers and offering 
extended trials. Would you be open to a 15-minute call to see if it's a fit?

Best,
[Your name]
```

---

## 7. Success Metrics

### Onboarding KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first API call | < 1 day | From key issuance |
| Time to production | < 14 days | From intake form |
| Integration issues | < 3 | Per onboarding |
| Customer satisfaction | 4.5+/5 | Post-onboarding survey |

### Health Metrics (Ongoing)

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API success rate | > 99.5% | < 98% |
| Webhook delivery | > 99.9% | < 99% |
| Balance accuracy | 100% | Any discrepancy |
| Support response | < 4 hours | > 8 hours |

---

## Appendix: Sample Customer Communications

### Welcome Email

```
Subject: Welcome to Soledgic - Your API Key Inside

Hi [Name],

Welcome to Soledgic! Your account is ready.

Your API Key: sk_live_xxxxx...
Dashboard: https://app.soledgic.com/dashboard
Documentation: https://docs.soledgic.com

Next steps:
1. Install the SDK: npm install @soledgic/sdk
2. Record your first test transaction
3. Schedule your integration call: [Calendly link]

Need help? Reply to this email or join our Slack: [invite link]

Best,
The Soledgic Team
```

### Go-Live Confirmation

```
Subject: You're Live on Soledgic! 🎉

Hi [Name],

Congratulations - [Company] is now live on Soledgic!

What we completed:
✅ Historical data imported (X transactions)
✅ X creators migrated with balances
✅ Periods closed through [Month Year]
✅ Webhooks verified and firing

Your first month-end close will be [Date]. We'll send a reminder 
with instructions.

Questions? We're here to help.

Best,
[Your name]
```
