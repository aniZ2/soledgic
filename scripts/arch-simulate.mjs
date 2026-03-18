#!/usr/bin/env node
/**
 * Impact Simulation Engine
 *
 * Predicts consequences of code changes before commit/push.
 *
 * Usage:
 *   node scripts/arch-simulate.mjs                    # simulate staged changes
 *   node scripts/arch-simulate.mjs --diff HEAD~1      # simulate last commit
 *   node scripts/arch-simulate.mjs --file payout-service.ts  # simulate specific file
 *   node scripts/arch-simulate.mjs --pr               # simulate all changes vs main
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { execSync } from 'child_process'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const INDEX_PATH = join(ROOT, 'docs/repo-index.md')
const BOUNDARIES_PATH = join(ROOT, '.service-boundaries.json')

const index = readFileSync(INDEX_PATH, 'utf-8')

// ── Parse graph ─────────────────────────────────────────────────────

function extractField(body, field) {
  const match = body.match(new RegExp(`^\\s*${field}:\\s*(.+)`, 'mi'))
  return match ? match[1].trim() : null
}

function extractList(body, field) {
  const match = body.match(new RegExp(`^\\s*${field}:\\s*(.+)`, 'mi'))
  return match ? match[1].split(',').map(s => s.trim()).filter(Boolean) : []
}

function parseServices() {
  const blocks = []
  const regex = /^SERVICE: (\S+)\n([\s\S]*?)(?=\n(?:SERVICE:|RPC:|---|\n## ))/gm
  let m
  while ((m = regex.exec(index)) !== null) {
    blocks.push({
      id: m[1],
      file: extractField(m[2], 'FILE'),
      risk: extractField(m[2], 'RISK'),
      calls: extractList(m[2], 'CALLS'),
      calledBy: extractList(m[2], 'CALLED_BY'),
      writes: extractList(m[2], 'WRITES'),
      reads: extractList(m[2], 'READS'),
      testedBy: extractField(m[2], 'TESTED_BY'),
      changeImpact: extractField(m[2], 'CHANGE_IMPACT'),
    })
  }
  return blocks
}

function parseCriticalPaths() {
  const paths = []
  const regex = /^CRITICAL_PATH: (\S+)\n([\s\S]*?)(?=\nCRITICAL_PATH:|\n```)/gm
  let m
  while ((m = regex.exec(index)) !== null) {
    paths.push({ id: m[1], chain: extractField(m[2], 'chain') })
  }
  return paths
}

// ── Map files → services ────────────────────────────────────────────

function fileToServiceId(filePath, services) {
  for (const svc of services) {
    if (svc.file && filePath.includes(svc.file)) return svc.id
  }
  // Edge function: supabase/functions/<name>/index.ts
  const edgeMatch = filePath.match(/supabase\/functions\/([^/]+)\/index\.ts$/)
  if (edgeMatch) return edgeMatch[1]
  // Shared service: supabase/functions/_shared/<name>.ts
  const sharedMatch = filePath.match(/supabase\/functions\/_shared\/([^/]+)\.ts$/)
  if (sharedMatch) return sharedMatch[1]
  return null
}

// ── Get changed files ───────────────────────────────────────────────

function getChangedFiles(mode) {
  try {
    if (mode === '--pr') {
      return execSync('git diff --name-only origin/main...HEAD', { encoding: 'utf-8', cwd: ROOT }).trim().split('\n').filter(Boolean)
    }
    if (mode?.startsWith('--diff')) {
      const ref = mode.split(' ')[1] || 'HEAD~1'
      return execSync(`git diff --name-only ${ref}`, { encoding: 'utf-8', cwd: ROOT }).trim().split('\n').filter(Boolean)
    }
    if (mode?.startsWith('--file')) {
      return [mode.split(' ').slice(1).join(' ')]
    }
    // Default: staged + unstaged
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf-8', cwd: ROOT }).trim()
    const unstaged = execSync('git diff --name-only', { encoding: 'utf-8', cwd: ROOT }).trim()
    return [...new Set([...staged.split('\n'), ...unstaged.split('\n')].filter(Boolean))]
  } catch {
    return []
  }
}

// ── Blast radius (BFS) ──────────────────────────────────────────────

function computeBlastRadius(serviceIds, services) {
  const affected = new Set(serviceIds)
  const queue = [...serviceIds]

  while (queue.length > 0) {
    const current = queue.shift()
    const svc = services.find(s => s.id === current)
    if (!svc) continue

    // Anyone who calls this service is affected
    for (const caller of svc.calledBy) {
      if (!affected.has(caller)) {
        affected.add(caller)
        queue.push(caller)
      }
    }
  }

  return [...affected]
}

// ── Find tests for affected services ────────────────────────────────

function findTests(affectedIds, services, changedFiles) {
  const tests = new Set()

  // Direct test files from repo-index
  for (const id of affectedIds) {
    const svc = services.find(s => s.id === id)
    if (svc?.testedBy) {
      for (const t of svc.testedBy.split(',').map(s => s.trim())) {
        tests.add(t)
      }
    }
  }

  // Match changed shared files to test files
  const testDir = join(ROOT, 'supabase/functions/_shared/__tests__')
  if (existsSync(testDir)) {
    const testFiles = readdirSync(testDir).filter(f => f.endsWith('_test.ts'))
    for (const file of changedFiles) {
      const name = basename(file, '.ts')
      const match = testFiles.find(t => t.startsWith(name) || t.includes(name))
      if (match) tests.add(match)
    }
  }

  return [...tests]
}

// ── Risk scoring ────────────────────────────────────────────────────

const RISK_WEIGHTS = {
  CRITICAL_LEDGER: 100,
  CRITICAL_EXTERNAL: 90,
  FINANCIAL_ORCHESTRATION: 60,
  API_SURFACE: 30,
  UI_ONLY: 10,
}

function computeRisk(affectedIds, services) {
  let maxRisk = 0
  const riskCategories = new Set()

  for (const id of affectedIds) {
    const svc = services.find(s => s.id === id)
    if (!svc) continue
    const weight = RISK_WEIGHTS[svc.risk] || 0
    if (weight > maxRisk) maxRisk = weight
    if (svc.risk) riskCategories.add(svc.risk)

    // Check for money-touching signals
    const writes = (svc.writes || []).join(' ').toLowerCase()
    if (writes.includes('transaction') || writes.includes('entries') || writes.includes('payout') || writes.includes('balance')) {
      riskCategories.add('TOUCHES_MONEY')
    }
    if (writes.includes('audit_log')) {
      riskCategories.add('TOUCHES_AUDIT')
    }
  }

  let grade = 'LOW'
  if (maxRisk >= 90) grade = 'CRITICAL'
  else if (maxRisk >= 60) grade = 'HIGH'
  else if (maxRisk >= 30) grade = 'MEDIUM'

  return { score: maxRisk, grade, categories: [...riskCategories] }
}

// ── Boundary violations ─────────────────────────────────────────────

function checkBoundaryViolations(changedFiles) {
  if (!existsSync(BOUNDARIES_PATH)) return []
  const boundaries = JSON.parse(readFileSync(BOUNDARIES_PATH, 'utf-8')).boundaries
  const violations = []

  for (const boundary of boundaries) {
    for (const file of changedFiles) {
      if (file.includes(boundary.module.replace(/^supabase\/functions\//, ''))) {
        violations.push({
          boundary: boundary.id,
          module: boundary.module,
          reason: boundary.reason,
          allowed: boundary.allowed.length,
        })
      }
    }
  }

  return violations
}

// ── Tables affected ─────────────────────────────────────────────────

function getAffectedTables(affectedIds, services) {
  const tables = { writes: new Set(), reads: new Set() }
  for (const id of affectedIds) {
    const svc = services.find(s => s.id === id)
    if (!svc) continue
    for (const t of svc.writes || []) tables.writes.add(t)
    for (const t of svc.reads || []) tables.reads.add(t)
  }
  return { writes: [...tables.writes], reads: [...tables.reads] }
}

// ── Main ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const mode = args.join(' ') || null
const changedFiles = getChangedFiles(mode)

if (changedFiles.length === 0) {
  console.log('\x1b[32mNo changes detected.\x1b[0m')
  process.exit(0)
}

const services = parseServices()
const criticalPaths = parseCriticalPaths()

// Map files → service IDs
const directServiceIds = []
for (const file of changedFiles) {
  const id = fileToServiceId(file, services)
  if (id && !directServiceIds.includes(id)) directServiceIds.push(id)
}

// Compute blast radius
const affectedIds = computeBlastRadius(directServiceIds, services)
const risk = computeRisk(affectedIds, services)
const tests = findTests(affectedIds, services, changedFiles)
const tables = getAffectedTables(affectedIds, services)
const boundaryTouches = checkBoundaryViolations(changedFiles)

// Critical paths
const affectedCriticalPaths = criticalPaths.filter(p =>
  p.chain && affectedIds.some(id => p.chain.includes(id))
)

// Migration detection
const hasMigrations = changedFiles.some(f => f.includes('supabase/migrations/'))

// ── Output ──────────────────────────────────────────────────────────

console.log('\n\x1b[1m╔══════════════════════════════════════════════════╗\x1b[0m')
console.log('\x1b[1m║  IMPACT SIMULATION                               ║\x1b[0m')
console.log('\x1b[1m╚══════════════════════════════════════════════════╝\x1b[0m')

console.log(`\n  \x1b[1mChanged Files:\x1b[0m ${changedFiles.length}`)
for (const f of changedFiles.slice(0, 10)) {
  console.log(`    ${f}`)
}
if (changedFiles.length > 10) console.log(`    ... and ${changedFiles.length - 10} more`)

console.log(`\n  \x1b[1mDirect Services:\x1b[0m ${directServiceIds.length}`)
for (const id of directServiceIds) {
  const svc = services.find(s => s.id === id)
  console.log(`    \x1b[36m${id}\x1b[0m${svc?.risk ? ` (${svc.risk})` : ''}`)
}

if (affectedIds.length > directServiceIds.length) {
  const downstream = affectedIds.filter(id => !directServiceIds.includes(id))
  console.log(`\n  \x1b[1mBlast Radius:\x1b[0m +${downstream.length} downstream`)
  for (const id of downstream) {
    console.log(`    \x1b[33m↳ ${id}\x1b[0m`)
  }
}

const riskColor = risk.grade === 'CRITICAL' ? '31' : risk.grade === 'HIGH' ? '33' : risk.grade === 'MEDIUM' ? '33' : '32'
console.log(`\n  \x1b[1mRisk:\x1b[0m \x1b[${riskColor}m${risk.grade}\x1b[0m (score: ${risk.score})`)
if (risk.categories.length) {
  console.log(`    ${risk.categories.join(', ')}`)
}

if (tables.writes.length) {
  console.log(`\n  \x1b[1mTables Written:\x1b[0m ${tables.writes.join(', ')}`)
}
if (tables.reads.length) {
  console.log(`  \x1b[1mTables Read:\x1b[0m ${tables.reads.join(', ')}`)
}

if (affectedCriticalPaths.length) {
  console.log(`\n  \x1b[31m\x1b[1mCritical Paths Touched:\x1b[0m`)
  for (const p of affectedCriticalPaths) {
    console.log(`    \x1b[31m🔥 ${p.id}\x1b[0m`)
  }
}

if (boundaryTouches.length) {
  console.log(`\n  \x1b[1mBoundaries Touched:\x1b[0m ${boundaryTouches.length}`)
  for (const b of boundaryTouches) {
    console.log(`    \x1b[35m${b.boundary}\x1b[0m — ${b.reason.slice(0, 60)}`)
  }
}

if (hasMigrations) {
  console.log(`\n  \x1b[33m⚠  Contains database migrations — requires \`supabase db push\`\x1b[0m`)
}

if (tests.length) {
  console.log(`\n  \x1b[1mTests to Run:\x1b[0m`)
  for (const t of tests) {
    console.log(`    \x1b[32m✓\x1b[0m ${t}`)
  }
} else {
  console.log(`\n  \x1b[33m⚠  No matching tests found for affected services\x1b[0m`)
}

console.log()

// Exit with risk-based code for CI integration
if (risk.grade === 'CRITICAL') process.exit(2)
if (risk.grade === 'HIGH') process.exit(1)
process.exit(0)
