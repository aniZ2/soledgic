# Billing States & Enforcement

Internal reference for how Soledgic handles subscription states, plan limits, and feature gating.

Last updated: 2026-02-01

---

## Organization billing states

Every org has a `status` field set by Stripe webhooks:

| Status      | Meaning                                      | How it gets set                          |
|-------------|----------------------------------------------|------------------------------------------|
| `trialing`  | 14-day trial, no payment method required yet  | Org creation / checkout with trial       |
| `active`    | Paid and current                              | Successful payment via webhook           |
| `past_due`  | Payment failed, Stripe is retrying            | `invoice.payment_failed` webhook         |
| `canceled`  | Subscription fully ended                      | `customer.subscription.deleted` webhook  |

Note: `cancel_at_period_end` (user clicked "Cancel" but period hasn't ended) keeps `status = active` with a `cancel_at` timestamp. This is **not** the same as `canceled`.

---

## Enforcement matrix

| Status     | Read data | Write to existing ledgers | Create live ledgers      | Create test ledgers |
|------------|-----------|---------------------------|--------------------------|---------------------|
| `active`   | Yes       | Yes                       | Yes (within plan limit)  | Yes (spam cap only) |
| `trialing` | Yes       | Yes                       | Yes (within plan limit)  | Yes (spam cap only) |
| `past_due` | Yes       | Yes                       | **No** (402)             | Yes (spam cap only) |
| `canceled` | Yes       | Yes                       | **No** (403)             | Yes (spam cap only) |

Design principles:
- **Reads are never gated.** Users can always see their data.
- **Existing writes are never gated.** A past-due org can still record transactions, pay creators, etc. We don't break running operations.
- **New paid resource creation is gated.** Live ledgers are the billing unit. Blocking creation is the least disruptive enforcement.
- **Test mode is ungated.** Developers can always experiment in test mode regardless of billing state.

---

## Plan limits

| Plan     | Max live ledgers | Max team members | Price        |
|----------|------------------|------------------|--------------|
| Pro      | 3                | 1                | $49/month    |
| Business | 10               | 10               | $249/month   |
| Scale    | Unlimited (-1)   | Unlimited (-1)   | Custom       |

`max_ledgers = -1` means unlimited (Scale plan). The limit check skips entirely when max is -1.

### Over-limit vs at-limit

- **At limit** (`count >= max`): Blocks creation of the *next* ledger. User sees the limit in the billing page usage stats.
- **Over limit** (`count > max`): Happens after a downgrade (e.g., Business with 7 ledgers downgrades to Pro with max 3). Existing ledgers keep working. Only new creation is blocked. Dashboard shows a banner.

We never auto-archive or delete ledgers on downgrade.

---

## Where enforcement lives

### Centralized helper: `src/lib/entitlements.ts`

All "can the org do X?" logic lives here:

- `canCreateLiveLedger(org)` — returns `{ allowed: true }` or `{ allowed: false, code, message, httpStatus }`
- `isOverLedgerLimit(org)` — boolean for UI banners

API routes call `canCreateLiveLedger()` and return the result directly. This keeps enforcement consistent and makes it easy to add new checks (e.g., `canAddTeamMember(org)` when team management ships).

### API route: `src/app/api/ledgers/route.ts`

POST handler calls `canCreateLiveLedger(org)` before creating the ledger pair. Returns the entitlement error as JSON with a structured `code` field for client-side handling.

### Dashboard layout: `src/app/(dashboard)/layout.tsx`

Shows sticky banners for `past_due`, `canceled`, and over-limit states. These are informational — they link to `/billing` but don't block navigation.

### Billing page: `src/app/(dashboard)/billing/page.tsx`

Shows detailed banners with action buttons:
- `past_due`: "Update Payment Method" button opens Stripe portal
- Over-limit: Explains what happened and suggests upgrade or archive
- `canceled`: Red badge on the plan card, distinct from "Cancels [date]"

### Billing API: `src/app/api/billing/route.ts`

`get_subscription` response includes `max_ledgers` and `current_ledger_count` in the organization object so the billing page can render limit info without extra queries.

### Stripe webhooks: `src/app/api/webhooks/stripe/route.ts`

Sets `org.status` based on Stripe events. This is the source of truth for billing state.

---

## HTTP status codes

| Code | Used for          | Notes                                                    |
|------|-------------------|----------------------------------------------------------|
| 402  | `past_due`        | Semantically correct. If clients have trouble, 403 with `code: 'payment_past_due'` is an acceptable fallback. |
| 403  | `canceled`, limit | Standard forbidden. Structured `code` field distinguishes reasons. |

All error responses include a `code` field (e.g., `payment_past_due`, `subscription_canceled`, `ledger_limit_reached`) for programmatic handling.

---

## What we intentionally don't do

- **No middleware-level gating.** Billing checks happen in specific routes, not globally. Most routes (reads, existing writes) should never be gated.
- **No auto-deletion on downgrade.** Ledgers are financial records. We block forward motion, never prune.
- **No volume limits yet.** Transaction count, creator count, and API call volume are tracked but not enforced. Defer until pricing evidence justifies it.
- **No `suspended` status.** Not in current scope. If added, it would block all writes (not just creation).
- **No team member gating.** Team management isn't built yet. When it ships, add `canAddTeamMember(org)` to `entitlements.ts`.

---

## Future additions

When adding a new gated feature:

1. Add a check function to `src/lib/entitlements.ts` (e.g., `canAddTeamMember`)
2. Call it in the relevant API route
3. Add a banner to the billing page if the user is over the limit
4. Update this doc
