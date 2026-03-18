#!/usr/bin/env node
/**
 * Critical Path Enforcement Gate
 *
 * When changes touch files on a critical money/auth path, enforce
 * stricter requirements before allowing push.
 *
 * Usage:
 *   node scripts/arch-critical-path-gate.mjs          # check staged changes
 *   node scripts/arch-critical-path-gate.mjs --full    # run full test suite if critical
 *
 * Rules:
 *   - CRITICAL path changes → require full Deno test suite (not just affected)
 *   - FINANCIAL path changes → require arch:validate-financial to pass
 *   - Any critical path change → output explicit warning
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const INDEX_PATH = join(ROOT, 'docs/repo-index.md')
const index = readFileSync(INDEX_PATH, 'utf-8')

// ── Critical path files (money movement + auth) ─────────────────────
// These are the files where a bug = real financial damage

const CRITICAL_PATH_FILES = [
  // Money movement
  'supabase/functions/_shared/payout-service.ts',
  'supabase/functions/_shared/checkout-service.ts',
  'supabase/functions/_shared/refund-service.ts',
  'supabase/functions/_shared/wallet-service.ts',
  'supabase/functions/_shared/payment-provider.ts',
  'supabase/functions/_shared/stripe-payment-provider.ts',
  'supabase/functions/_shared/stripe-rest.ts',
  'supabase/functions/_shared/capabilities.ts',
  'supabase/functions/_shared/mercury-client.ts',
  'supabase/functions/execute-payout/',
  'supabase/functions/platform-payouts/',
  'supabase/functions/checkout-sessions/',
  'supabase/functions/credits/',
  // Auth & security
  'supabase/functions/_shared/utils.ts',
  'supabase/functions/_shared/authority.ts',
  'supabase/functions/_shared/identity-service.ts',
  'apps/web/src/lib/internal-platforms.ts',
  // Transaction graph
  'supabase/functions/_shared/transaction-graph.ts',
  'supabase/functions/_shared/holds-service.ts',
  'supabase/functions/_shared/risk-engine.ts',
]

// ── Get changed files ───────────────────────────────────────────────

function getChangedFiles() {
  try {
    const diff = execSync('git diff --name-only origin/main...HEAD', { encoding: 'utf-8', cwd: ROOT }).trim()
    if (diff) return diff.split('\n').filter(Boolean)
    // Fallback to staged
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf-8', cwd: ROOT }).trim()
    return staged.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

// ── Check ───────────────────────────────────────────────────────────

const changedFiles = getChangedFiles()
const touchedCritical = []

for (const file of changedFiles) {
  for (const critPath of CRITICAL_PATH_FILES) {
    if (file.includes(critPath.replace(/\/$/, ''))) {
      touchedCritical.push({ file, path: critPath })
    }
  }
}

const hasMigrations = changedFiles.some(f => f.includes('supabase/migrations/'))
const runFull = process.argv.includes('--full')

if (touchedCritical.length === 0 && !hasMigrations) {
  console.log('\x1b[32m✓ No critical path files touched\x1b[0m')
  process.exit(0)
}

console.log('\n\x1b[1m\x1b[31m╔══════════════════════════════════════════════════╗\x1b[0m')
console.log('\x1b[1m\x1b[31m║  CRITICAL PATH GATE                              ║\x1b[0m')
console.log('\x1b[1m\x1b[31m╚══════════════════════════════════════════════════╝\x1b[0m')

if (touchedCritical.length > 0) {
  console.log(`\n  \x1b[31m${touchedCritical.length} critical path file(s) modified:\x1b[0m`)
  for (const { file } of touchedCritical) {
    console.log(`    \x1b[31m🔥\x1b[0m ${file}`)
  }
}

if (hasMigrations) {
  console.log(`\n  \x1b[33m⚠  Database migrations included — verify with \`supabase db push --dry-run\`\x1b[0m`)
}

// Run financial integrity check
console.log('\n  Running financial integrity validation...')
try {
  execSync('node scripts/arch-validate-financial.mjs', { stdio: 'inherit', cwd: ROOT })
} catch {
  console.log('\n  \x1b[31m✗ Financial integrity validation FAILED — fix before pushing\x1b[0m\n')
  process.exit(1)
}

// If --full flag, run complete test suite
if (runFull) {
  console.log('\n  Running FULL Deno test suite (critical path touched)...')
  try {
    execSync('deno test --no-check --allow-env --allow-read supabase/functions/_shared/__tests__/', {
      stdio: 'inherit',
      cwd: ROOT,
      timeout: 120000,
    })
    console.log('  \x1b[32m✓ Full test suite passed\x1b[0m')
  } catch {
    console.log('\n  \x1b[31m✗ Test suite FAILED — critical path changes require all tests to pass\x1b[0m\n')
    process.exit(1)
  }
}

console.log(`\n  \x1b[33mThis change touches critical infrastructure. Review carefully.\x1b[0m\n`)
process.exit(0)
