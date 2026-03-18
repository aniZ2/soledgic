#!/usr/bin/env node
/**
 * Architecture Reasoning Engine
 *
 * Continuously analyzes the codebase for structural drift, risk accumulation,
 * and improvement opportunities. Outputs actionable signals, not just metrics.
 *
 * Usage:
 *   node scripts/arch-analyze.mjs              # full analysis
 *   node scripts/arch-analyze.mjs --json       # machine-readable output
 *   npm run arch:analyze
 *
 * Detects:
 *   1. Hub growth (service gaining too many importers)
 *   2. Boundary violations (imports from unauthorized modules)
 *   3. Test coverage drift (critical services without tests)
 *   4. Dead exports (functions exported but never imported)
 *   5. Coupling spikes (files with too many cross-module edges)
 *   6. Financial risk concentration (money-touching code growing)
 *   7. Migration debt (pending schema changes)
 *   8. Stale code signals (files unchanged for 60+ days with high coupling)
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, relative } from 'path'
import { execSync } from 'child_process'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const INDEX_PATH = join(ROOT, 'docs/repo-index.md')
const BOUNDARIES_PATH = join(ROOT, '.service-boundaries.json')
const jsonMode = process.argv.includes('--json')

const index = readFileSync(INDEX_PATH, 'utf-8')

const signals = []

function addSignal(severity, category, message, suggestion, details = {}) {
  signals.push({ severity, category, message, suggestion, ...details })
}

// ── Helpers ─────────────────────────────────────────────────────────

function readDir(dir, ext = '.ts') {
  if (!existsSync(dir)) return []
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('node_modules') && !entry.name.startsWith('.')) {
      files.push(...readDir(full, ext))
    } else if (entry.name.endsWith(ext)) {
      files.push(full)
    }
  }
  return files
}

function countImporters(modulePath) {
  const allFiles = [
    ...readDir(join(ROOT, 'supabase/functions')),
    ...readDir(join(ROOT, 'apps/web/src')),
  ]
  const moduleName = modulePath.split('/').pop().replace('.ts', '')
  let count = 0
  for (const file of allFiles) {
    if (file.includes('__tests__') || file.includes('node_modules')) continue
    if (file === join(ROOT, modulePath)) continue
    try {
      const content = readFileSync(file, 'utf-8')
      if (content.includes(`from '`) && content.includes(moduleName)) count++
    } catch { /* skip */ }
  }
  return count
}

// ── 1. Hub Growth Detection ─────────────────────────────────────────

const sharedDir = join(ROOT, 'supabase/functions/_shared')
if (existsSync(sharedDir)) {
  const sharedFiles = readdirSync(sharedDir).filter(f => f.endsWith('.ts') && !f.startsWith('__'))

  for (const file of sharedFiles) {
    const fullPath = `supabase/functions/_shared/${file}`
    const importers = countImporters(fullPath)

    if (importers >= 10) {
      addSignal('HIGH', 'hub_growth', `${file} has ${importers} importers — approaching god-service territory`, `Consider splitting ${file} into smaller, focused modules`, { file: fullPath, importers })
    } else if (importers >= 7) {
      addSignal('MEDIUM', 'hub_growth', `${file} has ${importers} importers — monitor for further growth`, `Review if all importers truly need direct access`, { file: fullPath, importers })
    }
  }
}

// ── 2. Test Coverage for Critical Services ──────────────────────────

const criticalServices = [
  'payout-service.ts', 'checkout-service.ts', 'refund-service.ts',
  'wallet-service.ts', 'identity-service.ts', 'risk-engine.ts',
  'capabilities.ts', 'authority.ts', 'holds-service.ts',
  'transaction-graph.ts', 'stripe-payment-provider.ts',
]

const testDir = join(ROOT, 'supabase/functions/_shared/__tests__')
const testFiles = existsSync(testDir) ? readdirSync(testDir).filter(f => f.endsWith('_test.ts')) : []

for (const svc of criticalServices) {
  const svcName = svc.replace('.ts', '')
  const hasTest = testFiles.some(t => t.includes(svcName))
  if (!hasTest) {
    addSignal('HIGH', 'test_gap', `Critical service ${svc} has no unit tests`, `Create __tests__/${svcName}_test.ts with key behavior coverage`, { service: svc })
  }
}

// ── 3. Unwired Function Detection ────────────────────────────────────
// Classifies unused exports by domain importance:
//   @critical-path tag in comment → HIGH (unwired critical function)
//   Financial function names      → MEDIUM (unwired financial primitive)
//   Everything else               → LOW (dead export)

const FINANCIAL_KEYWORDS = [
  'payout', 'payment', 'charge', 'refund', 'transfer', 'deposit',
  'withdraw', 'balance', 'settlement', 'reconcil', 'ledger',
  'credit', 'debit', 'invoice', 'billing', 'recipient', 'merchant',
]

// Functions called internally within same file (not cross-file imports)
const INTERNAL_HELPERS = new Set([
  'isDevelopment', 'isIpBlocked', 'isCountryBlocked', 'getRequestCountry',
  'isApiKeyAllowed', 'maintenanceResponse', 'rateLimitedResponse',
  'forbiddenResponse', 'checkPreAuthRateLimit', 'createLinks',
])

if (existsSync(sharedDir)) {
  const sharedFiles = readdirSync(sharedDir).filter(f => f.endsWith('.ts') && !f.startsWith('__'))

  for (const file of sharedFiles) {
    try {
      const content = readFileSync(join(sharedDir, file), 'utf-8')

      // Find all exported functions with their preceding comments
      const exportRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?export\s+(?:async\s+)?function\s+(\w+)/g
      const exportMatches = [...content.matchAll(exportRegex)]

      for (const match of exportMatches) {
        const funcName = match[1]
        const fullMatch = match[0]

        if (INTERNAL_HELPERS.has(funcName)) continue

        // Search all code for this function
        const searchDirs = [
          join(ROOT, 'supabase/functions'),
          join(ROOT, 'sdk/typescript/src'),
          join(ROOT, 'apps/web/src'),
        ]
        const allCode = searchDirs.flatMap(d => readDir(d))
          .filter(f => !f.endsWith(file))

        let found = false
        for (const codeFile of allCode) {
          try {
            const c = readFileSync(codeFile, 'utf-8')
            if (c.includes(funcName)) { found = true; break }
          } catch { /* skip */ }
        }

        if (!found) {
          // Check for @critical-path tag
          const hasCriticalTag = fullMatch.includes('@critical-path')

          // Check if function name suggests financial operation
          const funcLower = funcName.toLowerCase()
          const isFinancial = FINANCIAL_KEYWORDS.some(kw => funcLower.includes(kw))

          if (hasCriticalTag) {
            // Extract the critical path name from the tag
            const pathMatch = fullMatch.match(/@critical-path\s+(\S+)/)
            const pathName = pathMatch ? pathMatch[1] : 'unknown'
            addSignal('HIGH', 'unwired_critical', `${file}: ${funcName} is tagged @critical-path(${pathName}) but not wired into any flow`, `Integrate into the ${pathName} pipeline — this primitive was designed for a specific money flow`, { file, function: funcName, criticalPath: pathName })
          } else if (isFinancial) {
            addSignal('MEDIUM', 'unwired_financial', `${file}: financial primitive '${funcName}' exists but is not called`, `Wire into the appropriate flow (payout, reconciliation, checkout) or remove if obsolete`, { file, function: funcName })
          } else {
            addSignal('LOW', 'dead_export', `${file}: exported function '${funcName}' is never imported`, `Remove or mark as internal`, { file, function: funcName })
          }
        }
      }
    } catch { /* skip */ }
  }
}

// ── 4. Boundary Violation Scan ──────────────────────────────────────

if (existsSync(BOUNDARIES_PATH)) {
  const boundaries = JSON.parse(readFileSync(BOUNDARIES_PATH, 'utf-8')).boundaries
  const allFiles = readDir(join(ROOT, 'supabase/functions')).filter(f => !f.includes('__tests__'))

  for (const boundary of boundaries) {
    // Only check boundaries for edge function code, not web app code
    if (boundary.module.startsWith('apps/')) continue

    const moduleName = boundary.module.split('/').pop().replace('.ts', '')
    // Build import pattern that matches actual import statements
    const importPatterns = [
      `from './${moduleName}`,
      `from '../_shared/${moduleName}`,
      `from './${moduleName}.ts`,
      `from '../_shared/${moduleName}.ts`,
    ]

    for (const file of allFiles) {
      const relPath = relative(ROOT, file)
      if (relPath === boundary.module) continue

      try {
        const content = readFileSync(file, 'utf-8')
        const hasImport = importPatterns.some(p => content.includes(p))
        if (!hasImport) continue

        // Check if this file is in the allowed list
        const isAllowed = boundary.allowed.some(allowed => relPath.startsWith(allowed.replace(/\/$/, '')))
        if (!isAllowed) {
          // Internal _shared imports between services are checked by the boundary system
          addSignal('HIGH', 'boundary_violation', `${relPath} imports ${boundary.id} but is not in the allowed list`, `Add to .service-boundaries.json or refactor to remove the dependency`, { file: relPath, boundary: boundary.id })
        }
      } catch { /* skip */ }
    }
  }
}

// ── 5. Financial Risk Concentration ─────────────────────────────────

const moneyFiles = readDir(join(ROOT, 'supabase/functions'))
  .filter(f => !f.includes('__tests__'))
  .filter(f => {
    try {
      const content = readFileSync(f, 'utf-8')
      return content.includes("'transactions'") && (content.includes('.insert(') || content.includes('.update('))
    } catch { return false }
  })

if (moneyFiles.length > 20) {
  addSignal('MEDIUM', 'financial_spread', `${moneyFiles.length} files write to transactions table — financial logic is spreading`, `Consolidate transaction writes into atomic RPCs to reduce surface area`, { count: moneyFiles.length })
}

// ── 6. Migration Debt ───────────────────────────────────────────────

try {
  const pendingMigrations = execSync('supabase db push --dry-run 2>&1', { encoding: 'utf-8', cwd: ROOT, timeout: 15000 })
  const pendingCount = (pendingMigrations.match(/Would push these migrations:/g) || []).length
  if (pendingCount > 0) {
    const migrationLines = pendingMigrations.split('\n').filter(l => l.trim().startsWith('•'))
    addSignal('MEDIUM', 'migration_debt', `${migrationLines.length} pending migration(s) not yet applied`, `Run \`supabase db push\` to apply`, { count: migrationLines.length })
  }
} catch { /* supabase CLI not available or no pending */ }

// ── 7. Coupling Analysis ────────────────────────────────────────────

const importCounts = new Map()
const allSrcFiles = [
  ...readDir(join(ROOT, 'supabase/functions')).filter(f => !f.includes('__tests__')),
]

for (const file of allSrcFiles) {
  try {
    const content = readFileSync(file, 'utf-8')
    const imports = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)]
    const relPath = relative(ROOT, file)
    importCounts.set(relPath, imports.length)

    if (imports.length > 15) {
      addSignal('MEDIUM', 'high_coupling', `${relPath} has ${imports.length} imports — high coupling`, `Consider extracting a focused sub-module`, { file: relPath, imports: imports.length })
    }
  } catch { /* skip */ }
}

// ── 8. Stale Critical Code ──────────────────────────────────────────

try {
  for (const svc of criticalServices) {
    const filePath = `supabase/functions/_shared/${svc}`
    const lastModified = execSync(`git log -1 --format=%ci -- "${filePath}" 2>/dev/null`, { encoding: 'utf-8', cwd: ROOT }).trim()
    if (lastModified) {
      const daysSince = Math.floor((Date.now() - new Date(lastModified).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince > 90) {
        addSignal('LOW', 'stale_critical', `${svc} hasn't been modified in ${daysSince} days`, `Review for accumulated drift or dependency staleness`, { file: svc, days: daysSince })
      }
    }
  }
} catch { /* git not available */ }

// ── Output ──────────────────────────────────────────────────────────

if (jsonMode) {
  console.log(JSON.stringify({ signals, summary: { total: signals.length, high: signals.filter(s => s.severity === 'HIGH').length, medium: signals.filter(s => s.severity === 'MEDIUM').length, low: signals.filter(s => s.severity === 'LOW').length } }, null, 2))
  process.exit(0)
}

console.log('\n\x1b[1m╔══════════════════════════════════════════════════╗\x1b[0m')
console.log('\x1b[1m║  ARCHITECTURE ANALYSIS                           ║\x1b[0m')
console.log('\x1b[1m╚══════════════════════════════════════════════════╝\x1b[0m')

if (signals.length === 0) {
  console.log('\n  \x1b[32mNo signals detected. System is clean.\x1b[0m\n')
  process.exit(0)
}

const byCategory = {}
for (const s of signals) {
  if (!byCategory[s.category]) byCategory[s.category] = []
  byCategory[s.category].push(s)
}

for (const [category, items] of Object.entries(byCategory)) {
  const label = category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  console.log(`\n  \x1b[1m${label}:\x1b[0m`)

  for (const s of items) {
    const color = s.severity === 'HIGH' ? '31' : s.severity === 'MEDIUM' ? '33' : '90'
    const icon = s.severity === 'HIGH' ? '✗' : s.severity === 'MEDIUM' ? '!' : '·'
    console.log(`    \x1b[${color}m${icon}\x1b[0m ${s.message}`)
    console.log(`      \x1b[90m→ ${s.suggestion}\x1b[0m`)
  }
}

const high = signals.filter(s => s.severity === 'HIGH').length
const medium = signals.filter(s => s.severity === 'MEDIUM').length
const low = signals.filter(s => s.severity === 'LOW').length

console.log(`\n  \x1b[1mSignals:\x1b[0m ${high} high, ${medium} medium, ${low} low`)
console.log()

process.exit(high > 0 ? 1 : 0)
