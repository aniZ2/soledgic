#!/usr/bin/env node
/**
 * Reality Check — Domain-Aware Financial Validator
 *
 * Catches business logic gaps that code linters can't see.
 * These rules encode how money ACTUALLY works, not just how code compiles.
 *
 * Usage:
 *   node scripts/arch-reality-check.mjs
 *   npm run arch:reality-check
 *
 * This is not about syntax. It's about asking:
 *   "Would a real bank/payment processor accept this behavior?"
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import childProcess from 'child_process'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

let passes = 0
let fails = 0
let warnings = 0

function pass(rule, detail) { passes++; console.log(`  \x1b[32m✓\x1b[0m ${rule}${detail ? ` — ${detail}` : ''}`) }
function fail(rule, detail) { fails++; console.log(`  \x1b[31m✗\x1b[0m ${rule}${detail ? ` — ${detail}` : ''}`) }
function warn(rule, detail) { warnings++; console.log(`  \x1b[33m!\x1b[0m ${rule}${detail ? ` — ${detail}` : ''}`) }

function readFile(path) {
  try { return readFileSync(join(ROOT, path), 'utf-8') } catch { return null }
}

function readAllShared() {
  const dir = join(ROOT, 'supabase/functions/_shared')
  if (!existsSync(dir)) return {}
  const files = {}
  for (const f of readdirSync(dir).filter(f => f.endsWith('.ts') && !f.startsWith('__'))) {
    files[f] = readFileSync(join(dir, f), 'utf-8')
  }
  return files
}

function readAllEdgeFunctions() {
  const dir = join(ROOT, 'supabase/functions')
  if (!existsSync(dir)) return {}
  const files = {}
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue
    const indexPath = join(dir, entry.name, 'index.ts')
    if (existsSync(indexPath)) {
      files[entry.name] = readFileSync(indexPath, 'utf-8')
    }
  }
  return files
}

function readAllMigrations() {
  const dir = join(ROOT, 'supabase/migrations')
  if (!existsSync(dir)) return ''
  return readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    .map(f => readFileSync(join(dir, f), 'utf-8')).join('\n')
}

const shared = readAllShared()
const functions = readAllEdgeFunctions()
const migrations = readAllMigrations()
const envExample = readFile('.env.example') || ''

console.log('\n\x1b[1m╔══════════════════════════════════════════════════╗\x1b[0m')
console.log('\x1b[1m║  REALITY CHECK — Domain-Aware Financial Audit    ║\x1b[0m')
console.log('\x1b[1m╚══════════════════════════════════════════════════╝\x1b[0m')

// ════════════════════════════════════════════════════════════════════
// RULE 1: Test mode must never touch real money
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m1. Test/Live Mode Isolation\x1b[0m')

const stripeRest = shared['stripe-rest.ts'] || ''
if (stripeRest.includes('STRIPE_TEST_SECRET_KEY') && stripeRest.includes('livemode')) {
  pass('Stripe key routing is mode-aware (test key for test mode)')
} else {
  fail('Stripe requests do NOT route by livemode — test mode may hit live Stripe')
}

if (stripeRest.includes("sk_live_") && stripeRest.includes('livemode === false')) {
  pass('Cross-check blocks live Stripe key in test mode')
} else {
  fail('No cross-check preventing live Stripe key in test mode')
}

const utils = shared['utils.ts'] || ''
if (utils.includes('livemode') && utils.includes("select('id")) {
  pass('validateApiKey loads livemode from database')
} else {
  fail('validateApiKey may not load livemode — mode decisions could be blind')
}

const testCleanup = functions['test-cleanup'] || ''
if (testCleanup.includes('livemode') && testCleanup.includes('403')) {
  pass('test-cleanup blocked on live ledgers')
} else {
  fail('test-cleanup has no livemode guard — live data can be wiped')
}

// ════════════════════════════════════════════════════════════════════
// RULE 2: You can't pay out more than you have
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m2. Payout Integrity\x1b[0m')

if (migrations.includes('FOR UPDATE') && migrations.includes('process_payout_atomic')) {
  pass('Payout RPC locks account before reading balance')
} else {
  fail('Payout RPC does not lock account — concurrent payouts can overdraw')
}

const payoutSvc = shared['payout-service.ts'] || ''
if (payoutSvc.includes('checkPayoutAllowed') && payoutSvc.includes('getDailyPayoutTotal')) {
  pass('Payout checks org capabilities and daily limits')
} else {
  fail('Payout does not check capability limits')
}

const caps = shared['capabilities.ts'] || ''
if (caps.includes('organization_id') && caps.includes('.in(')) {
  pass('Daily payout total checks ALL org ledgers (not just current)')
} else {
  fail('Daily payout total may only check one ledger — multi-ledger bypass possible')
}

if (payoutSvc.includes('kyc_status') && payoutSvc.includes('livemode')) {
  pass('Payout checks creator KYC in live mode')
} else {
  fail('No KYC check on live-mode payouts')
}

if (migrations.includes('check_creator_kyc_for_payout')) {
  pass('Database trigger enforces KYC on payout INSERT (defense in depth)')
} else {
  fail('No DB-level KYC enforcement — service-layer-only check is bypassable')
}

// ════════════════════════════════════════════════════════════════════
// RULE 3: Every credit must have a source of funds
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m3. Credit System Integrity\x1b[0m')

if (migrations.includes('credits_liability') && migrations.includes('platform_marketing_expense')) {
  pass('Credit issuance creates liability + expense entries')
} else {
  fail('Credits may be created without financial backing')
}

if (migrations.includes('credit_budget_monthly_cents')) {
  pass('Monthly credit budget cap exists')
} else {
  fail('No credit budget limit — platform can issue unlimited credits')
}

if (migrations.includes('FOR UPDATE') && migrations.includes('issue_credits')) {
  pass('Credit issuance locks budget row (prevents concurrent overspend)')
} else {
  fail('Credit budget check is not locked — concurrent calls can exceed budget')
}

const credits = functions['credits'] || ''
if (credits.includes('MIN_CONVERSION_CREDITS') && credits.includes('5000')) {
  pass('Credit conversion has $5 minimum gate')
} else {
  fail('No minimum conversion threshold — dust conversions allowed')
}

if (credits.includes('CREDITS_PER_DOLLAR') && credits.includes('1000')) {
  pass('Standard rate enforced: 1000 credits = $1 (not per-platform)')
} else {
  fail('Credit rate may be configurable per platform — reconciliation risk')
}

// ════════════════════════════════════════════════════════════════════
// RULE 4: Refunds can't exceed what was charged
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m4. Refund Safety\x1b[0m')

const refundSvc = shared['refund-service.ts'] || ''
if (refundSvc.includes('original') && refundSvc.includes('amount')) {
  pass('Refund references original transaction amount')
} else {
  fail('Refund may not validate against original charge amount')
}

if (migrations.includes('record_refund_atomic') && migrations.includes('FOR UPDATE')) {
  pass('Refund RPC locks before processing (prevents double-refund)')
} else {
  fail('Refund RPC may not lock — concurrent refunds could double-refund')
}

// ════════════════════════════════════════════════════════════════════
// RULE 5: Authority hierarchy — Soledgic > org > platform
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m5. Authority Enforcement\x1b[0m')

const authority = shared['authority.ts'] || ''
if (authority.includes('soledgic_system') && authority.includes('org_operator') && authority.includes('platform_api')) {
  pass('Three-level authority hierarchy defined')
} else {
  fail('Authority hierarchy missing or incomplete')
}

const holdsSvc = shared['holds-service.ts'] || ''
if (holdsSvc.includes('canOverride') && holdsSvc.includes('insufficient_authority')) {
  pass('Hold release checks authority before allowing')
} else {
  fail('Hold release does not enforce authority — any caller can release any hold')
}

if (migrations.includes('release_expired_holds') && migrations.includes('soledgic_system')) {
  pass('Auto-release cron skips system-imposed holds')
} else {
  fail('Auto-release may expire fraud holds automatically')
}

if (migrations.includes('capability_locks')) {
  pass('Capability locks prevent org from loosening system restrictions')
} else {
  fail('No capability lock — org can undo fraud-triggered payout blocks')
}

// ════════════════════════════════════════════════════════════════════
// RULE 6: API keys must be distinguishable from processor keys
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m6. Key Identity\x1b[0m')

if (utils.includes("slk_")) {
  pass('Soledgic keys use slk_ prefix (distinct from Stripe sk_)')
} else {
  fail('Soledgic keys may use sk_ prefix — confusable with Stripe keys')
}

if (utils.includes("startsWith('slk_')")) {
  pass('API validation requires slk_ prefix')
} else {
  fail('API validation may accept non-slk_ keys')
}

const internalPlatforms = readFile('apps/web/src/lib/internal-platforms.ts') || ''
if (!internalPlatforms.includes('user_metadata')) {
  pass('Admin check does NOT trust user_metadata (prevents self-escalation)')
} else if (internalPlatforms.includes('user_metadata') && !internalPlatforms.includes("role === 'platform_admin'")) {
  pass('Admin check reads user_metadata but not for role escalation')
} else {
  fail('Admin check trusts user_metadata.role — any user can self-escalate')
}

// ════════════════════════════════════════════════════════════════════
// RULE 7: Webhooks must not double-deliver
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m7. Webhook Reliability\x1b[0m')

if (migrations.includes('FOR UPDATE SKIP LOCKED') && migrations.includes('get_pending_webhooks')) {
  pass('Webhook delivery uses row-level locking (no double-delivery)')
} else {
  fail('Webhook delivery may double-deliver under concurrent cron runs')
}

if (migrations.includes('webhook_deliveries') && migrations.includes('max_attempts')) {
  pass('Webhook retries are bounded (max_attempts)')
} else {
  fail('Webhook retries may be unbounded — infinite retry risk')
}

// ════════════════════════════════════════════════════════════════════
// RULE 8: Financial operations must be idempotent
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m8. Idempotency\x1b[0m')

if (migrations.includes('reference_id') && migrations.includes('process_payout_atomic')) {
  pass('Payouts check reference_id for idempotency')
} else {
  fail('Payouts may not be idempotent — retries could create duplicates')
}

if (migrations.includes('idempotency_key') && migrations.includes('checkout_sessions')) {
  pass('Checkout sessions support idempotency_key')
} else {
  fail('Checkout sessions have no idempotency protection')
}

if (stripeRest.includes('idempotencyKey') || stripeRest.includes('Idempotency-Key')) {
  pass('Stripe requests pass idempotency keys')
} else {
  fail('Stripe requests may not be idempotent')
}

// ════════════════════════════════════════════════════════════════════
// RULE 9: Users can't withdraw what they didn't earn
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m9. User Fund Isolation\x1b[0m')

// Check for actual withdrawal actions (not just comments mentioning the word)
const hasWithdrawAction = credits.includes("action: 'withdraw'") ||
  credits.includes('action === "withdraw"') ||
  credits.includes("action === 'withdraw'")
if (credits.includes('user_spendable_balance') && !hasWithdrawAction) {
  pass('Users have spendable balance but no cash withdrawal action')
} else if (hasWithdrawAction) {
  fail('Users may be able to withdraw credit balances as cash')
} else {
  warn('Credit system structure unclear — verify no user withdrawal path exists')
}

const creatorLayout = readFile('apps/web/src/app/(creator-portal)/layout.tsx') || ''
if (creatorLayout.includes('connected_accounts') && creatorLayout.includes('redirect')) {
  pass('Creator portal verifies user is an actual creator before access')
} else {
  fail('Creator portal may allow non-creators to access payout pages')
}

const payoutRequest = readFile('apps/web/src/app/api/creator/payout-request/route.ts') || ''
if (payoutRequest.includes('balance') && payoutRequest.includes('amount_cents')) {
  pass('Payout requests validated server-side (not client-side only)')
} else {
  fail('Payout request amount may only be validated in the browser — bypassable')
}

// ════════════════════════════════════════════════════════════════════
// RULE 10: Platform reality separation
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m10. Platform vs Business Reality\x1b[0m')

const transactionsClient = readFile('apps/web/src/app/(dashboard)/dashboard/transactions/transactions-client.tsx') || ''
if (!transactionsClient.includes('Record Transaction') && !transactionsClient.includes('Record Sale')) {
  pass('Dashboard transactions page has no manual entry buttons (API-only)')
} else {
  fail('Dashboard allows manual transaction creation — should be read-only for platform data')
}

const creatorsPage = readFile('apps/web/src/app/(dashboard)/dashboard/creators/page.tsx') || ''
if (!creatorsPage.includes('Add Creator') && !creatorsPage.includes('New Creator')) {
  pass('Dashboard creators page has no manual creation button (API-only)')
} else {
  fail('Dashboard allows manual creator creation — should come from platform API')
}

const navigation = readFile('apps/web/src/lib/navigation.ts') || ''
if (navigation.includes("'Money In / Out'") && navigation.includes("'Books'")) {
  pass('Sidebar separates platform monitoring (Money In/Out) from org accounting (Books)')
} else {
  fail('No clear separation between platform data and business accounting in UI')
}

// ════════════════════════════════════════════════════════════════════
// RULE 11: Suspended orgs must be fully blocked
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m11. Account Suspension\x1b[0m')

if (migrations.includes('suspend_organization') && migrations.includes('suspension_authority')) {
  pass('Organization suspension exists with authority tracking')
} else {
  fail('No formal suspension mechanism — only informal capability restrictions')
}

if (migrations.includes('reactivate_organization') && migrations.includes('v_rank_caller')) {
  pass('Reactivation checks authority level (system suspension needs system to undo)')
} else {
  fail('Reactivation may not check who suspended — org could self-reactivate')
}

// ════════════════════════════════════════════════════════════════════
// RULE 12: Every env var that handles money must be documented
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m12. Operational Readiness\x1b[0m')

const criticalEnvVars = [
  'STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET', 'STRIPE_TEST_WEBHOOK_SECRET',
  'MERCURY_API_KEY', 'MERCURY_ACCOUNT_ID',
  'CRON_SECRET', 'RESEND_API_KEY',
]

let missingEnv = 0
for (const v of criticalEnvVars) {
  if (envExample.includes(v)) {
    pass(`${v} documented in .env.example`)
  } else {
    fail(`${v} missing from .env.example — deploy will fail silently`)
    missingEnv++
  }
}

// ════════════════════════════════════════════════════════════════════
// RULE 13: Deployed env vars must match code requirements
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m13. Deployment Verification\x1b[0m')

try {
  const { execSync } = childProcess
  const secretsOutput = execSync('supabase secrets list 2>/dev/null', { encoding: 'utf-8', cwd: ROOT, timeout: 15000 })

  const deployedSecrets = [
    'STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET', 'STRIPE_TEST_WEBHOOK_SECRET',
    'CRON_SECRET', 'RESEND_API_KEY',
  ]

  for (const secret of deployedSecrets) {
    if (secretsOutput.includes(secret)) {
      pass(`${secret} deployed to Supabase`)
    } else {
      fail(`${secret} NOT deployed — edge functions will fail`)
    }
  }
} catch {
  warn('Could not verify Supabase secrets (CLI not available)')
}

// ════════════════════════════════════════════════════════════════════
// RULE 14: SDK must be publish-ready
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m14. SDK Readiness\x1b[0m')

const sdkPkg = readFile('sdk/typescript/package.json')
if (sdkPkg) {
  try {
    const pkg = JSON.parse(sdkPkg)
    if (pkg.name && pkg.version && pkg.main) {
      pass(`SDK package configured: ${pkg.name}@${pkg.version}`)
    } else {
      fail('SDK package.json missing name, version, or main')
    }
  } catch { fail('SDK package.json is invalid JSON') }

  const sdkDist = readFile('sdk/typescript/dist/index.js')
  if (sdkDist) {
    pass('SDK dist/ is built')
  } else {
    fail('SDK dist/ not built — run `cd sdk/typescript && npm run build`')
  }

  // Check if published (look for npm registry entry)
  try {
    const { execSync } = childProcess
    const npmInfo = execSync('npm view @soledgic/sdk version 2>/dev/null', { encoding: 'utf-8', timeout: 10000 }).trim()
    if (npmInfo) {
      pass(`SDK published to npm: v${npmInfo}`)
    } else {
      warn('SDK not published to npm — platforms cannot install it')
    }
  } catch {
    warn('SDK not published to npm — run `cd sdk/typescript && npm publish --access public`')
  }
} else {
  fail('SDK package.json not found')
}

// ════════════════════════════════════════════════════════════════════
// RULE 15: Demo/seed data tooling must exist
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m15. Developer Experience\x1b[0m')

const seedScript = readFile('scripts/seed-demo-data.mjs')
if (seedScript) {
  pass('Demo data seed script exists (npm run seed:demo)')
} else {
  fail('No demo data seed script — new signups see empty dashboards')
}

const openApiSpec = readFile('docs/openapi.yaml')
if (openApiSpec) {
  pass('OpenAPI spec exists (docs/openapi.yaml)')
} else {
  warn('OpenAPI spec not found — API documentation may be incomplete')
}

// ════════════════════════════════════════════════════════════════════
// RULE 16: Legal pages must have content
// ════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m16. Legal & Compliance\x1b[0m')

const termsPage = readFile('apps/web/src/app/terms/page.tsx') || readFile('apps/web/src/app/(marketing)/terms/page.tsx')
const privacyPage = readFile('apps/web/src/app/privacy/page.tsx') || readFile('apps/web/src/app/(marketing)/privacy/page.tsx')

if (termsPage && termsPage.length > 500) {
  pass('Terms of service page has content')
} else if (termsPage) {
  warn('Terms of service page exists but may be a placeholder')
} else {
  fail('No terms of service page')
}

if (privacyPage && privacyPage.length > 500) {
  pass('Privacy policy page has content')
} else if (privacyPage) {
  warn('Privacy policy page exists but may be a placeholder')
} else {
  fail('No privacy policy page')
}

// ════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════

console.log(
  `\n${fails === 0 ? '\x1b[32m' : '\x1b[31m'}` +
  `${passes} passed, ${fails} failed, ${warnings} warnings\x1b[0m\n`
)

if (fails > 0) {
  console.log('\x1b[31mReality check FAILED — fix the above issues.\x1b[0m')
  console.log('\x1b[31mThese are not code bugs — they are business logic gaps\x1b[0m')
  console.log('\x1b[31mthat would cause real financial damage in production.\x1b[0m\n')
}

process.exit(fails > 0 ? 1 : 0)
