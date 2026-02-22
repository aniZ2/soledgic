# Billing States & Enforcement

Internal reference for Soledgic billing behavior in the shared-merchant model.

Last updated: 2026-02-22

---

## Pricing model (active)

Soledgic currently runs a single plan:

- Base plan: `Free`
- Included: `1` live ledger + `1` active team member
- Overage: `$20/month` per additional live ledger
- Overage: `$20/month` per additional active team member
- Processing fees apply per transaction

Overages are billed monthly in arrears.

---

## Organization billing states

`organizations.status` is used for enforcement:

| Status     | Meaning | Enforcement impact |
|------------|---------|--------------------|
| `active`   | Billing healthy | Full access |
| `past_due` | Overage charge retries exhausted | New paid-resource creation blocked |
| `canceled` | Billing disabled/closed | New paid-resource creation blocked |
| `trialing` | Legacy state; treated like active for current model | Full access |

---

## Dunning policy for monthly overages

When a monthly overage charge fails:

1. Attempt `#1` on day `0` (initial monthly run)
2. Attempt `#2` on day `3`
3. Attempt `#3` on day `7`

Rules:

- Org is **not** moved to `past_due` on attempts 1 or 2.
- Org is moved to `past_due` only after attempt 3 fails.
- A successful overage charge moves org back to `active`.

Implementation:

- Scheduler: `supabase/migrations/20260289_billing_overage_cron.sql`
- Job: `supabase/functions/bill-overages/index.ts`
- Claim/idempotency: `public.claim_overage_billing_charge(...)`

---

## Enforcement matrix

| Status     | Read data | Write existing ledgers | Create live ledgers | Invite team members | Test mode |
|------------|-----------|------------------------|---------------------|---------------------|-----------|
| `active`   | Yes       | Yes                    | Yes                 | Yes                 | Yes       |
| `trialing` | Yes       | Yes                    | Yes                 | Yes                 | Yes       |
| `past_due` | Yes       | Yes                    | No                  | No                  | Yes       |
| `canceled` | Yes       | Yes                    | No                  | No                  | Yes       |

Design intent:

- Reads are always allowed.
- Existing operations are not blocked.
- New paid-resource creation is gated (`live` ledger creation + team invitations).
- Test mode remains available.

---

## Where checks live

- Ledger creation gating: `apps/web/src/lib/entitlements.ts` -> `canCreateLiveLedger`
- Team invite gating: `apps/web/src/lib/entitlements.ts` -> `canAddTeamMember`
- Billing summary + usage: `apps/web/src/app/api/billing/route.ts`
- Billing method setup: `apps/web/src/app/api/billing-method/route.ts`
- Billing dashboard: `apps/web/src/app/(dashboard)/billing/page.tsx`

---

## Notes

- Workspace-level processor onboarding is disabled in shared-merchant mode.
- Billing method is stored per organization for overage collection.
- The job is idempotent per org+period via `billing_overage_charges` unique key.
