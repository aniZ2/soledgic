#!/usr/bin/env node
/**
 * Validates repo-intelligence tooling against known-good expectations.
 * Catches parser drift in graph-query before bad metadata reaches reviews.
 */

import { execFileSync } from 'child_process'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const GRAPH_QUERY_PATH = join(ROOT, 'scripts/graph-query.mjs')

let errors = 0

function error(msg) {
  console.error(`  \x1b[31m✗\x1b[0m ${msg}`)
  errors++
}

function ok(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
}

function runGraphQuery(...args) {
  const output = execFileSync('node', [GRAPH_QUERY_PATH, ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
  return JSON.parse(output)
}

function runTool(scriptPath, ...args) {
  return execFileSync('node', [join(ROOT, scriptPath), ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
}

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-9;]*m/g, '')
}

console.log('\nGraph Tool Validation:')

const criticalPaths = runGraphQuery('critical-paths')
if (!Array.isArray(criticalPaths) || criticalPaths.length === 0) {
  error('graph-query critical-paths returned no results')
} else {
  const ids = criticalPaths.map((path) => path.id)
  const uniqueIds = new Set(ids)
  if (uniqueIds.size !== criticalPaths.length) {
    error('graph-query critical-paths returned duplicate IDs')
  } else if (criticalPaths.some((path) => !path.chain || !path.invariants)) {
    error('graph-query critical-paths returned malformed entries')
  } else {
    ok(`${criticalPaths.length} critical paths parsed cleanly`)
  }
}

const summary = runGraphQuery('summary')
if (summary.criticalPaths !== criticalPaths.length) {
  error(`graph-query summary critical path count (${summary.criticalPaths}) does not match critical-paths output (${criticalPaths.length})`)
} else {
  ok('graph-query summary matches critical-paths output')
}

const billingRisk = runGraphQuery('risk', 'SVC_BILLING')
if (!Array.isArray(billingRisk.invariants)) {
  error('graph-query risk SVC_BILLING returned malformed invariants')
} else if (billingRisk.invariants.length !== 0) {
  error(`graph-query risk SVC_BILLING returned unrelated invariants: ${billingRisk.invariants.join(', ')}`)
} else {
  ok('graph-query risk SVC_BILLING keeps unrelated invariants out')
}

const checkoutRisk = runGraphQuery('risk', 'SVC_CHECKOUT_ORCHESTRATOR')
const checkoutInvariantSet = new Set(checkoutRisk.invariants || [])
if (!Array.isArray(checkoutRisk.criticalPaths) || !checkoutRisk.criticalPaths.includes('CHECKOUT_COMPLETION')) {
  error('graph-query risk SVC_CHECKOUT_ORCHESTRATOR missed CHECKOUT_COMPLETION')
} else if (!checkoutInvariantSet.has('INVARIANT_DOUBLE_ENTRY') || !checkoutInvariantSet.has('INVARIANT_LEDGER_BALANCE')) {
  error('graph-query risk SVC_CHECKOUT_ORCHESTRATOR missed checkout invariants')
} else {
  ok('graph-query risk SVC_CHECKOUT_ORCHESTRATOR resolves critical path invariants')
}

const entryPoints = runGraphQuery('entry-points')
if (!Array.isArray(entryPoints) || entryPoints.length === 0) {
  error('graph-query entry-points returned no results')
} else {
  ok(`${entryPoints.length} entry points parsed cleanly`)
}

const transactionsTable = runGraphQuery('table', 'transactions')
const writerSet = new Set(transactionsTable.writers || [])
const readerSet = new Set(transactionsTable.readers || [])
if (!writerSet.has('supabase/functions/platform-payouts/index.ts')) {
  error('graph-query table transactions missed a known writer')
} else if (!readerSet.has('apps/web/src/app/api/billing/route.ts')) {
  error('graph-query table transactions missed a known reader')
} else {
  ok('graph-query table transactions resolves known readers and writers')
}

const graphImpactCriticalPaths = stripAnsi(runTool('scripts/graph-impact.mjs', '--critical-paths'))
const graphImpactPathIds = [...graphImpactCriticalPaths.matchAll(/^\s{2}([A-Z_]+)$/gm)].map((match) => match[1])
const expectedCriticalPathIds = criticalPaths.map((path) => path.id)
if (new Set(graphImpactPathIds).size !== graphImpactPathIds.length) {
  error('graph-impact --critical-paths returned duplicate path entries')
} else if (graphImpactPathIds.length !== expectedCriticalPathIds.length) {
  error(`graph-impact --critical-paths returned ${graphImpactPathIds.length} path entries instead of ${expectedCriticalPathIds.length}`)
} else {
  const graphImpactPathSet = new Set(graphImpactPathIds)
  const missingFromGraphImpact = expectedCriticalPathIds.filter((id) => !graphImpactPathSet.has(id))
  const unexpectedGraphImpact = graphImpactPathIds.filter((id) => !expectedCriticalPathIds.includes(id))
  if (missingFromGraphImpact.length > 0 || unexpectedGraphImpact.length > 0) {
    error(`graph-impact --critical-paths diverged from graph-query output (missing: ${missingFromGraphImpact.join(', ') || 'none'}; unexpected: ${unexpectedGraphImpact.join(', ') || 'none'})`)
  } else {
    ok('graph-impact critical path output is deduped')
  }
}

const graphImpactBillingBlast = stripAnsi(runTool('scripts/graph-impact.mjs', '--blast-radius', 'billing'))
if (graphImpactBillingBlast.includes('(DB queries only')) {
  error('graph-impact blast radius still treats descriptive prose as graph nodes')
} else if (!graphImpactBillingBlast.includes('Invariants at risk: 0')) {
  error('graph-impact blast radius billing no longer reports zero invariants at risk')
} else {
  ok('graph-impact blast radius ignores prose-only dependencies')
}

const archSimulateHelp = stripAnsi(runTool('scripts/arch-simulate.mjs', '--help'))
if (!archSimulateHelp.includes('Usage:') || archSimulateHelp.includes('Changed Files:')) {
  error('arch-simulate --help did not short-circuit into usage output')
} else {
  ok('arch-simulate --help renders usage without executing a simulation')
}

const archPropose = JSON.parse(runTool('scripts/arch-propose.mjs', '--json'))
if (!Array.isArray(archPropose.proposals) || archPropose.proposals.length === 0) {
  error('arch-propose --json returned no proposals')
} else if (!archPropose.proposals.some((proposal) => proposal.category === 'multi_org_safety')) {
  error('arch-propose --json missed the org_context_safety proposal')
} else {
  ok('arch-propose surfaces the remaining multi-org cleanup debt')
}

const criticalGateFiles = JSON.parse(runTool('scripts/arch-critical-path-gate.mjs', '--list-critical-files'))
const criticalGateSet = new Set(criticalGateFiles)
if (!criticalGateSet.has('supabase/functions/reverse-transaction/index.ts')) {
  error('arch-critical-path-gate missed reverse-transaction in critical coverage')
} else if (!criticalGateSet.has('supabase/functions/process-webhooks/index.ts')) {
  error('arch-critical-path-gate missed process-webhooks in critical coverage')
} else if (!criticalGateSet.has('supabase/functions/_shared/webhook-signing.ts')) {
  error('arch-critical-path-gate missed webhook-signing in critical coverage')
} else if (!criticalGateSet.has('supabase/functions/platform-payouts/index.ts')) {
  error('arch-critical-path-gate missed platform-payouts in critical coverage')
} else if (!criticalGateSet.has('supabase/functions/credits/index.ts')) {
  error('arch-critical-path-gate missed credits in critical coverage')
} else {
  ok('arch-critical-path-gate critical coverage stays aligned with repo index paths')
}

const financialValidation = stripAnsi(runTool('scripts/arch-validate-financial.mjs'))
const financialSelfTest = stripAnsi(runTool('scripts/arch-validate-financial.mjs', '--self-test'))
if (!financialSelfTest.includes('Financial validator heuristics look healthy')) {
  error('arch-validate-financial self-test failed')
} else if (!financialValidation.includes('All amount divisions use proper rounding')) {
  error('arch-validate-financial amount-rounding heuristic regressed')
} else if (financialValidation.includes('checkout-service.ts:150') || financialValidation.includes('payout-service.ts:394')) {
  error('arch-validate-financial still flags display-only amount conversions')
} else if (!financialValidation.includes('No unauthorized direct inserts into financial tables')) {
  error('arch-validate-financial no longer reports a clean direct-insert state for the repo')
} else {
  ok('arch-validate-financial self-tests pass and the repo stays clean of direct-write violations')
}

if (errors > 0) {
  console.error(`\n\x1b[31m${errors} graph tooling error(s)\x1b[0m`)
  process.exit(1)
}

console.log('\n\x1b[32mGraph tooling looks healthy\x1b[0m')
