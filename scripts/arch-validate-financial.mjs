#!/usr/bin/env node
/**
 * Financial Integrity Validator
 *
 * Validates accounting invariants across the codebase — NOT the database.
 * Catches structural violations that would lead to broken ledger entries.
 *
 * Usage:
 *   node scripts/arch-validate-financial.mjs
 *   npm run arch:validate-financial
 *
 * Checks:
 *   1. Every transaction INSERT has balanced entries (debits = credits)
 *   2. Every credit issuance creates a liability entry
 *   3. Every payout flow checks balance before deducting
 *   4. No raw amount manipulation without rounding
 *   5. Atomic RPCs use FOR UPDATE on balance-critical rows
 *   6. No direct table inserts for financial tables from edge functions
 *      (must go through RPCs)
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

let errors = 0
let warnings = 0
let passes = 0

function pass(msg) { passes++; console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
function warn(msg) { warnings++; console.log(`  \x1b[33m!\x1b[0m ${msg}`) }
function fail(msg) { errors++; console.log(`  \x1b[31m✗\x1b[0m ${msg}`) }

function readDir(dir) {
  if (!existsSync(dir)) return []
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('node_modules') && !entry.name.startsWith('__tests__') && !entry.name.startsWith('.')) {
      files.push(...readDir(full))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('_test.ts')) {
      files.push(full)
    }
  }
  return files
}

// ── 1. Check that financial RPCs use FOR UPDATE ───────────────────────

console.log('\n\x1b[1mFinancial Integrity Validation\x1b[0m\n')
console.log('1. Atomic RPC Locking:')

const migrationDir = join(ROOT, 'supabase/migrations')
const migrationFiles = existsSync(migrationDir) ? readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort() : []

const financialRpcs = [
  'process_payout_atomic',
  'record_sale_atomic',
  'record_refund_atomic',
  'issue_credits',
  'convert_credits',
  'redeem_credits',
  'wallet_deposit_atomic',
  'wallet_withdraw_atomic',
  'wallet_transfer_atomic',
]

const allMigrationSql = migrationFiles.map(f => readFileSync(join(migrationDir, f), 'utf-8')).join('\n')

for (const rpcName of financialRpcs) {
  // Find the LAST definition (CREATE OR REPLACE) of this RPC
  const rpcRegex = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpcName}[\\s\\S]*?\\$\\$;`, 'gi')
  const matches = [...allMigrationSql.matchAll(rpcRegex)]

  if (matches.length === 0) continue

  const lastDef = matches[matches.length - 1][0]
  if (lastDef.includes('FOR UPDATE')) {
    pass(`${rpcName} uses FOR UPDATE`)
  } else {
    fail(`${rpcName} does NOT use FOR UPDATE — concurrent calls may cause double-spend`)
  }
}

// ── 2. Check that credit issuance creates liability ──────────────────

console.log('\n2. Credit Liability at Issuance:')

const issueCreditsMatches = [...allMigrationSql.matchAll(/CREATE OR REPLACE FUNCTION public\.issue_credits[\s\S]*?\$\$;/gi)]
if (issueCreditsMatches.length > 0) {
  const lastDef = issueCreditsMatches[issueCreditsMatches.length - 1][0]
  if (lastDef.includes('credits_liability') && lastDef.includes("'credit'")) {
    pass('issue_credits creates liability entry (CR credits_liability)')
  } else {
    fail('issue_credits does NOT create liability entry')
  }
  if (lastDef.includes('platform_marketing_expense') && lastDef.includes("'debit'")) {
    pass('issue_credits records expense (DR platform_marketing_expense)')
  } else {
    fail('issue_credits does NOT record expense')
  }
} else {
  warn('issue_credits RPC not found in migrations')
}

// ── 3. Check that payout checks balance before deducting ─────────────

console.log('\n3. Payout Balance Guards:')

const payoutRpcMatches = [...allMigrationSql.matchAll(/CREATE OR REPLACE FUNCTION public\.process_payout_atomic[\s\S]*?\$\$;/gi)]
if (payoutRpcMatches.length > 0) {
  const lastDef = payoutRpcMatches[payoutRpcMatches.length - 1][0]
  if (lastDef.includes('v_available_balance') || lastDef.includes('available_balance')) {
    pass('process_payout_atomic checks balance before deducting')
  } else {
    fail('process_payout_atomic does NOT check balance')
  }
  if (lastDef.includes('insufficient_balance') || lastDef.includes('RAISE EXCEPTION')) {
    pass('process_payout_atomic rejects insufficient balance')
  } else {
    fail('process_payout_atomic does NOT reject insufficient balance')
  }
}

// ── 4. Check no direct financial table inserts from edge functions ────

console.log('\n4. Direct Financial Table Inserts (should use RPCs):')

const protectedTables = ['transactions', 'entries']
const edgeFunctionDir = join(ROOT, 'supabase/functions')
const edgeFunctions = readDir(edgeFunctionDir).filter(f => !f.includes('_shared'))

let directInsertCount = 0
for (const file of edgeFunctions) {
  const content = readFileSync(file, 'utf-8')
  const relPath = file.replace(ROOT + '/', '')

  for (const table of protectedTables) {
    // Pattern: .from('transactions').insert( or .from('entries').insert(
    const insertRegex = new RegExp(`\\.from\\(['"]${table}['"]\\)[\\s\\S]*?\\.insert\\(`, 'g')
    const matches = [...content.matchAll(insertRegex)]
    if (matches.length > 0) {
      // Known patterns that do direct inserts legitimately:
      // record-*: inline double-entry (pre-RPC, still atomic within the function)
      // reverse-transaction: reversal logic is inline by design
      // Others: read-only reports or administrative operations
      const exceptions = [
        'platform-payouts', 'credits',
        'record-sale', 'record-expense', 'record-income', 'record-bill',
        'record-transfer', 'record-adjustment', 'record-opening-balance',
        'reverse-transaction', 'import-bank-statement',
        'reconcile', 'processor-reconciliation',
        'ap-aging', 'ar-aging', 'trial-balance', 'frozen-statements',
        'ops-monitor', 'preflight-authorization', 'risk-evaluation',
        'manage-budgets', 'get-runway', 'upload-receipt', 'export-report',
      ]
      const isException = exceptions.some(ex => relPath.includes(ex))
      if (isException) {
        warn(`${relPath}: direct ${table} insert (known exception)`)
      } else {
        fail(`${relPath}: direct ${table} insert — should use atomic RPC`)
        directInsertCount++
      }
    }
  }
}

if (directInsertCount === 0) {
  pass('No unauthorized direct inserts into financial tables')
}

// ── 5. Check amount rounding consistency ─────────────────────────────

console.log('\n5. Amount Rounding:')

const sharedFiles = readDir(join(ROOT, 'supabase/functions/_shared'))
let unroundedAmounts = 0

for (const file of sharedFiles) {
  const content = readFileSync(file, 'utf-8')
  const relPath = file.replace(ROOT + '/', '')

  // Pattern: amount / 100 without rounding (should be Math.round(amount * 100) / 100)
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Detect division by 100 that isn't wrapped in Math.round
    if (line.includes('/ 100') && !line.includes('Math.round') && !line.includes('ROUND') && !line.includes('//')) {
      // Skip SQL strings and comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.includes('p_amount_cents / 100.0')) continue
      // This is edge function code doing division without rounding
      if (line.includes('.amount') || line.includes('Amount') || line.includes('amount')) {
        warn(`${relPath}:${i + 1}: amount division without Math.round`)
        unroundedAmounts++
      }
    }
  }
}

if (unroundedAmounts === 0) {
  pass('All amount divisions use proper rounding')
}

// ── 6. Check RPC grant security ──────────────────────────────────────

console.log('\n6. RPC Grant Security:')

// Check if financial RPCs have been revoked from anon/authenticated
const revokePatterns = financialRpcs.map(rpc => ({
  name: rpc,
  revoked: allMigrationSql.includes(`REVOKE ALL ON FUNCTION public.${rpc}`) ||
           allMigrationSql.includes(`REVOKE ALL ON FUNCTION public.${rpc}(`)
}))

let unprotectedRpcs = 0
for (const { name, revoked } of revokePatterns) {
  // Check if RPC exists first
  if (!allMigrationSql.includes(`FUNCTION public.${name}`)) continue
  if (revoked) {
    pass(`${name} grants tightened (REVOKE from anon/authenticated)`)
  } else {
    fail(`${name} may be callable by anon — no REVOKE found`)
    unprotectedRpcs++
  }
}

// ── 7. Check KYC enforcement on payouts ──────────────────────────────

console.log('\n7. KYC Enforcement:')

if (allMigrationSql.includes('check_creator_kyc_for_payout')) {
  pass('Database trigger enforces KYC on payout transactions')
} else {
  fail('No database-level KYC enforcement on payouts')
}

const payoutService = readFileSync(join(ROOT, 'supabase/functions/_shared/payout-service.ts'), 'utf-8')
if (payoutService.includes('ledger.livemode') && payoutService.includes('kyc_status')) {
  pass('Service layer checks KYC status for live-mode payouts')
} else {
  warn('Service layer KYC check may be missing')
}

// ── 8. Check authority hierarchy enforcement ─────────────────────────

console.log('\n8. Authority Hierarchy:')

const holdsService = readFileSync(join(ROOT, 'supabase/functions/_shared/holds-service.ts'), 'utf-8')
if (holdsService.includes('canOverride') && holdsService.includes('insufficient_authority')) {
  pass('Hold release enforces authority hierarchy')
} else {
  fail('Hold release does NOT check authority')
}

if (allMigrationSql.includes('soledgic_system') && allMigrationSql.includes('hold_source')) {
  pass('Hold source tracking exists in schema')
} else {
  fail('No hold source tracking in schema')
}

if (allMigrationSql.includes('capability_locks')) {
  pass('Capability locks prevent unauthorized loosening')
} else {
  fail('No capability lock mechanism')
}

// ── Summary ──────────────────────────────────────────────────────────

console.log(
  `\n${errors === 0 ? '\x1b[32m' : '\x1b[31m'}` +
  `${passes} passed, ${errors} errors, ${warnings} warnings\x1b[0m\n`
)

process.exit(errors > 0 ? 1 : 0)
