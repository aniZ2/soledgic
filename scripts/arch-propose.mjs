#!/usr/bin/env node
/**
 * Architecture Proposal Engine
 *
 * Consumes signals from arch:analyze, arch:validate-financial, and
 * arch:reality-check to generate specific, prioritized action plans.
 *
 * This is the "hands" layer — it doesn't just detect problems,
 * it tells you exactly what to do about them.
 *
 * Usage:
 *   node scripts/arch-propose.mjs              # generate proposals
 *   node scripts/arch-propose.mjs --json       # machine-readable
 *   npm run arch:propose
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const jsonMode = process.argv.includes('--json')

// ── Collect signals from all analyzers ──────────────────────────────

function runAnalyzer(script) {
  const tmpFile = join(ROOT, '.arch-analyze-output.json')
  try {
    execSync(`node ${join(ROOT, script)} --json > "${tmpFile}" 2>/dev/null`, {
      cwd: ROOT,
      timeout: 120000,
      shell: true,
    })
  } catch { /* exit non-zero is ok — output still in file */ }

  try {
    if (existsSync(tmpFile)) {
      const content = readFileSync(tmpFile, 'utf-8').trim()
      try { require('fs').unlinkSync(tmpFile) } catch { /* cleanup */ }
      if (content.startsWith('{')) return JSON.parse(content)
    }
  } catch { /* parse failed */ }
  return null
}

function runCheckScript(script) {
  try {
    execSync(`node ${join(ROOT, script)} 2>/dev/null`, { cwd: ROOT, timeout: 60000 })
    return { passed: true, output: '' }
  } catch (err) {
    return { passed: false, output: err.stdout || err.stderr || '' }
  }
}

// ── Proposal generation ─────────────────────────────────────────────

const proposals = []
let proposalId = 1

function propose(priority, category, title, actions, rationale) {
  proposals.push({
    id: proposalId++,
    priority, // P0 (do now), P1 (this week), P2 (this month), P3 (backlog)
    category,
    title,
    actions, // array of specific steps
    rationale,
  })
}

// ── Gather data ─────────────────────────────────────────────────────

console.error('Collecting signals...')

const analyzeResult = runAnalyzer('scripts/arch-analyze.mjs')
const financialResult = runCheckScript('scripts/arch-validate-financial.mjs')
const realityResult = runCheckScript('scripts/arch-reality-check.mjs')

// Parse analyze signals
const signals = analyzeResult?.signals || []
const highSignals = signals.filter(s => s.severity === 'HIGH')
const mediumSignals = signals.filter(s => s.severity === 'MEDIUM')

// ── Generate proposals from signals ─────────────────────────────────

// Test gaps → propose test creation
const testGaps = signals.filter(s => s.category === 'test_gap')
if (testGaps.length > 0) {
  const services = testGaps.map(s => s.service).filter(Boolean)
  propose('P1', 'test_coverage', `Add unit tests for ${testGaps.length} critical services`, [
    ...services.map(svc => `Create supabase/functions/_shared/__tests__/${svc.replace('.ts', '')}_test.ts`),
    'Focus on: input validation, error paths, financial calculations',
    'Use existing test patterns (mock supabase with chainable objects)',
  ], 'Critical money-moving services without tests are invisible failure points. A bug in payout-service.ts with no tests could drain accounts undetected.')
}

// Hub growth → propose service splits (skip if already split)
const hubGrowth = signals.filter(s => s.category === 'hub_growth' && s.severity === 'HIGH')
for (const hub of hubGrowth) {
  // Skip signals that already note a completed split
  if (hub.split) continue

  const file = hub.file || hub.message?.match(/(\S+\.ts)/)?.[1] || 'unknown'
  const importers = hub.importers || 0

  if (file.includes('utils.ts')) {
    propose('P3', 'architecture', `Migrate utils.ts importers to specific modules (${importers} remaining)`, [
      'validators.ts, network-security.ts, audit.ts already extracted',
      'Gradually update edge functions to import from specific modules',
      'Keep utils.ts re-exports for backward compat until migration complete',
    ], `utils.ts modules have been extracted but importers haven't migrated yet. This is a gradual migration — no urgency.`)
  } else if (file.includes('payment-provider.ts')) {
    propose('P3', 'architecture', `Migrate payment-provider.ts importers to use types file`, [
      'payment-provider-types.ts already extracted',
      'Update services that only need types to import from types file',
    ], `payment-provider types have been extracted. Migrate importers gradually.`)
  }
}

// Treasury-resource monitoring (always P3)
const treasuryHub = signals.find(s => s.category === 'hub_growth' && s.message?.includes('treasury-resource'))
if (treasuryHub) {
  propose('P3', 'architecture', `Monitor treasury-resource.ts growth (${treasuryHub.importers || '?'} importers)`, [
    'This is a shared type/utility module — high import count is expected',
    'Only split if it starts accumulating business logic',
  ], 'Infrastructure modules naturally have high fan-in. Only act if it starts mixing concerns.')
}

// Dead exports → propose cleanup
const deadExports = signals.filter(s => s.category === 'dead_export')
if (deadExports.length > 5) {
  const byFile = {}
  for (const d of deadExports) {
    const file = d.file || 'unknown'
    if (!byFile[file]) byFile[file] = []
    byFile[file].push(d.function || d.message?.match(/'(\w+)'/)?.[1] || '?')
  }

  propose('P3', 'cleanup', `Remove ${deadExports.length} dead exports across ${Object.keys(byFile).length} files`, [
    ...Object.entries(byFile).map(([file, fns]) =>
      `${file}: remove or unexport ${fns.slice(0, 3).join(', ')}${fns.length > 3 ? ` (+${fns.length - 3} more)` : ''}`
    ),
    'Run full test suite after removal to catch any dynamic imports',
    'Some may be used by the SDK or external consumers — verify before removing',
  ], 'Dead exports increase cognitive load and make impact analysis noisy. Cleaning them sharpens the graph tools.')
}

// Financial spread → propose RPC consolidation
const financialSpread = signals.filter(s => s.category === 'financial_spread')
if (financialSpread.length > 0) {
  propose('P2', 'financial_integrity', 'Consolidate direct transaction writes into atomic RPCs', [
    'Identify edge functions that INSERT into transactions + entries directly',
    'For each: create a SECURITY DEFINER RPC with FOR UPDATE locking',
    'Priority: record-expense, record-income, record-bill (highest volume)',
    'Migrate edge functions to call RPCs instead of direct inserts',
    'Add REVOKE from anon/authenticated on new RPCs',
  ], 'Direct inserts bypass atomic guarantees. Every financial write should go through a locked RPC to prevent race conditions and maintain audit integrity.')
}

// Boundary violations → propose fixes
const boundaryViolations = signals.filter(s => s.category === 'boundary_violation')
if (boundaryViolations.length > 0) {
  propose('P1', 'architecture', `Fix ${boundaryViolations.length} service boundary violation(s)`, [
    ...boundaryViolations.map(v =>
      `${v.file}: add to ${v.boundary}'s allowed list in .service-boundaries.json, or refactor`
    ),
  ], 'Boundary violations mean code is reaching across module walls. Each one is a potential coupling regression.')
}

// Financial validator failures
if (!financialResult.passed) {
  propose('P0', 'financial_integrity', 'Fix financial integrity validation failures', [
    'Run: npm run arch:validate-financial',
    'Fix all errors (red items) before deploying',
    'Warnings (yellow) are acceptable but should be reviewed',
  ], 'Financial integrity failures mean the accounting system has structural gaps. These directly cause ledger imbalances, phantom money, or race conditions.')
}

// Reality check failures
if (!realityResult.passed) {
  propose('P0', 'business_logic', 'Fix reality check failures', [
    'Run: npm run arch:reality-check',
    'Each failure represents a business logic gap that would cause real financial damage',
    'These are not code bugs — they are missing real-world constraints',
  ], 'Reality check failures are the most dangerous class of issues because they represent correct code that behaves incorrectly in the real world.')
}

// ── If everything is clean, propose growth actions ──────────────────

if (proposals.length === 0) {
  propose('P3', 'growth', 'System is clean — consider these growth actions', [
    'Add mutation testing (npm run test:mutate) to find weak test assertions',
    'Set up arch:analyze as a weekly cron report (email or Slack)',
    'Create a "financial scenario" test suite (simulate edge cases: $0 purchase, split rounding, concurrent payouts)',
    'Add API contract drift detection (compare SDK types vs edge function responses automatically)',
  ], 'No urgent issues detected. Focus on hardening for scale.')
}

// ── Sort by priority ────────────────────────────────────────────────

const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 }
proposals.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

// ── Output ──────────────────────────────────────────────────────────

if (jsonMode) {
  console.log(JSON.stringify({ proposals, summary: { total: proposals.length, p0: proposals.filter(p => p.priority === 'P0').length, p1: proposals.filter(p => p.priority === 'P1').length, p2: proposals.filter(p => p.priority === 'P2').length, p3: proposals.filter(p => p.priority === 'P3').length } }, null, 2))
  process.exit(0)
}

console.log('\n\x1b[1m╔══════════════════════════════════════════════════╗\x1b[0m')
console.log('\x1b[1m║  ARCHITECTURE PROPOSALS                          ║\x1b[0m')
console.log('\x1b[1m╚══════════════════════════════════════════════════╝\x1b[0m')

const priorityColors = { P0: '31', P1: '33', P2: '36', P3: '90' }
const priorityLabels = { P0: 'DO NOW', P1: 'THIS WEEK', P2: 'THIS MONTH', P3: 'BACKLOG' }

for (const p of proposals) {
  const color = priorityColors[p.priority]
  console.log(`\n  \x1b[${color}m\x1b[1m[${p.priority}] ${priorityLabels[p.priority]}\x1b[0m — ${p.title}`)
  console.log(`  \x1b[90mCategory: ${p.category}\x1b[0m`)

  console.log(`\n  \x1b[1mActions:\x1b[0m`)
  for (const action of p.actions) {
    console.log(`    → ${action}`)
  }

  console.log(`\n  \x1b[90mWhy: ${p.rationale}\x1b[0m`)
}

const p0 = proposals.filter(p => p.priority === 'P0').length
const p1 = proposals.filter(p => p.priority === 'P1').length
const p2 = proposals.filter(p => p.priority === 'P2').length
const p3 = proposals.filter(p => p.priority === 'P3').length

console.log(`\n  \x1b[1mSummary:\x1b[0m ${p0} urgent, ${p1} this week, ${p2} this month, ${p3} backlog`)
console.log()
