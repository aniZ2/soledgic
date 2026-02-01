/**
 * Centralized entitlement checks for billing-gated features.
 *
 * Every "can the org do X?" question lives here. API routes call these
 * helpers instead of inlining status/limit checks, so enforcement stays
 * consistent and new features only need to add one function.
 */

export type OrgBillingStatus = 'active' | 'trialing' | 'past_due' | 'canceled'

/** Minimal org shape required by entitlement checks. */
export interface EntitlementOrg {
  status: OrgBillingStatus | string
  max_ledgers: number          // -1 = unlimited (Scale)
  current_ledger_count: number
  plan: string
}

// ── Results ──────────────────────────────────────────────────────────

export type EntitlementResult =
  | { allowed: true }
  | { allowed: false; code: EntitlementCode; message: string; httpStatus: number }

export type EntitlementCode =
  | 'payment_past_due'
  | 'subscription_canceled'
  | 'ledger_limit_reached'

// ── Checks ───────────────────────────────────────────────────────────

/**
 * Can this org create a new **live** ledger?
 *
 * Blocks when:
 * - `past_due`  — payment failed, no new paid resources
 * - `canceled`  — subscription ended
 * - over plan limit (max_ledgers !== -1 && count >= max)
 *
 * Test ledgers are not gated here (separate spam cap in the route).
 */
export function canCreateLiveLedger(org: EntitlementOrg): EntitlementResult {
  if (org.status === 'past_due') {
    return {
      allowed: false,
      code: 'payment_past_due',
      httpStatus: 402,
      message:
        'Your last payment didn\u2019t go through. We\u2019ll keep retrying, but please update your payment method so you can continue creating ledgers.',
    }
  }

  if (org.status === 'canceled') {
    return {
      allowed: false,
      code: 'subscription_canceled',
      httpStatus: 403,
      message:
        'Your subscription has ended. Choose a plan on the Billing page to start creating ledgers again.',
    }
  }

  if (org.max_ledgers !== -1 && org.current_ledger_count >= org.max_ledgers) {
    return {
      allowed: false,
      code: 'ledger_limit_reached',
      httpStatus: 403,
      message:
        `You\u2019ve reached your plan\u2019s limit of ${org.max_ledgers} ledger${org.max_ledgers === 1 ? '' : 's'}. Upgrade your plan or archive an existing ledger to make room.`,
    }
  }

  return { allowed: true }
}

/**
 * Is this org over its ledger limit? (for UI banners — uses > not >=
 * because the org may have been downgraded after creating ledgers)
 */
export function isOverLedgerLimit(org: EntitlementOrg): boolean {
  return org.max_ledgers !== -1 && org.current_ledger_count > org.max_ledgers
}
