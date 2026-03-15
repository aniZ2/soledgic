#!/usr/bin/env node
/**
 * Architecture health metrics for the Soledgic codebase.
 *
 * Computes:
 * - File count, dependency edge count, coupling ratio
 * - Hub Dependency Ratio (HDR) — concentration around top modules
 * - God-Service Detection — domain modules with too many importers
 * - Circular dependency check
 * - Trend comparison against last recorded baseline
 *
 * Usage: node scripts/graph-health.mjs
 *        node scripts/graph-health.mjs --save-baseline
 */

import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'fs'
import { join, relative, dirname } from 'path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const BASELINE_PATH = join(ROOT, '.graph-health-baseline.json')

// ── Scan the codebase for imports ───────────────────────────────────

const SCAN_DIRS = [
  'supabase/functions',
  'apps/web/src',
  'sdk/typescript/src',
  'packages/mcp-server/src',
]

const IGNORE_PATTERNS = [
  'node_modules',
  '.next',
  'dist',
  '__tests__',
  '.test.',
  '.spec.',
  '_test.',
]

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some((p) => filePath.includes(p))
}

function findSourceFiles(dir) {
  const files = []
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue
      files.push(...findSourceFiles(full))
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !shouldIgnore(full)) {
      files.push(full)
    }
  }
  return files
}

function extractImports(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const imports = []

  // ES imports: import ... from '...'
  const esRegex = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g
  let match
  while ((match = esRegex.exec(content)) !== null) {
    imports.push(match[1])
  }

  // Dynamic imports: import('...')
  const dynRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = dynRegex.exec(content)) !== null) {
    imports.push(match[1])
  }

  // require('...')
  const reqRegex = /require\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = reqRegex.exec(content)) !== null) {
    imports.push(match[1])
  }

  return imports
}

function resolveImport(importPath, fromFile) {
  // Skip external packages
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) return null

  const fromDir = dirname(fromFile)
  let resolved = join(fromDir, importPath)

  // Try extensions
  const extensions = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js']
  for (const ext of extensions) {
    const candidate = resolved + ext
    if (existsSync(candidate) && !statSync(candidate).isDirectory()) {
      return candidate
    }
  }
  return null
}

// ── Build dependency graph ──────────────────────────────────────────

console.log('\n\x1b[1mArchitecture Health Check\x1b[0m\n')
console.log('Scanning codebase...')

const allFiles = []
for (const dir of SCAN_DIRS) {
  allFiles.push(...findSourceFiles(join(ROOT, dir)))
}

const edges = [] // { from, to }
const importCounts = new Map() // file → number of times imported

for (const file of allFiles) {
  const imports = extractImports(file)
  for (const imp of imports) {
    const resolved = resolveImport(imp, file)
    if (resolved && allFiles.includes(resolved)) {
      const relFrom = relative(ROOT, file)
      const relTo = relative(ROOT, resolved)
      edges.push({ from: relFrom, to: relTo })
      importCounts.set(relTo, (importCounts.get(relTo) || 0) + 1)
    }
  }
}

const fileCount = allFiles.length
const edgeCount = edges.length
const couplingRatio = edgeCount / fileCount

// ── Hub analysis ────────────────────────────────────────────────────

const sortedHubs = [...importCounts.entries()]
  .sort((a, b) => b[1] - a[1])

const topN = 5
const topHubs = sortedHubs.slice(0, topN)
const topHubImports = topHubs.reduce((sum, [, count]) => sum + count, 0)
const hdr = edgeCount > 0 ? topHubImports / edgeCount : 0

// ── Infrastructure vs domain classification ─────────────────────────

const INFRA_PATTERNS = [
  'utils', 'types', 'config', 'constants', 'helpers', 'lib/',
  'node_modules', 'supabase-js', 'treasury-resource', 'api-types',
  'navigation', 'ledger-functions', 'schema',
]

function isInfraModule(filePath) {
  const lower = filePath.toLowerCase()
  return INFRA_PATTERNS.some((p) => lower.includes(p))
}

// Domain-only HDR (excludes infrastructure hubs — the meaningful metric)
const domainSortedHubs = sortedHubs.filter(([file]) => !isInfraModule(file))
const topDomainHubs = domainSortedHubs.slice(0, topN)
const topDomainImports = topDomainHubs.reduce((sum, [, count]) => sum + count, 0)
const domainHdr = edgeCount > 0 ? topDomainImports / edgeCount : 0

// ── God-service detection ───────────────────────────────────────────

const domainHubs = sortedHubs
  .filter(([file]) => !isInfraModule(file))
  .slice(0, 10)

const godServiceThreshold = Math.max(10, edgeCount * 0.03) // 3% of total edges or 10, whichever is higher
const godServices = domainHubs.filter(([, count]) => count >= godServiceThreshold)

// ── Circular dependency detection ───────────────────────────────────

function findCircularDeps() {
  const adjList = new Map()
  for (const { from, to } of edges) {
    if (!adjList.has(from)) adjList.set(from, new Set())
    adjList.get(from).add(to)
  }

  const cycles = []
  const visited = new Set()
  const inStack = new Set()

  function dfs(node, path) {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node)
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart).concat(node))
      }
      return
    }
    if (visited.has(node)) return

    visited.add(node)
    inStack.add(node)

    const neighbors = adjList.get(node) || new Set()
    for (const neighbor of neighbors) {
      dfs(neighbor, [...path, node])
    }

    inStack.delete(node)
  }

  for (const [node] of adjList) {
    if (!visited.has(node)) {
      dfs(node, [])
    }
  }

  return cycles
}

const cycles = findCircularDeps()

// ── Print report ────────────────────────────────────────────────────

console.log(`\n\x1b[1m╔══════════════════════════════════════════════════╗\x1b[0m`)
console.log(`\x1b[1m║  ARCHITECTURE HEALTH REPORT                      ║\x1b[0m`)
console.log(`\x1b[1m╚══════════════════════════════════════════════════╝\x1b[0m`)

console.log(`\n  \x1b[1mBasic Metrics:\x1b[0m`)
console.log(`    Files:           ${fileCount}`)
console.log(`    Dependency edges: ${edgeCount}`)
console.log(`    Coupling ratio:  ${couplingRatio.toFixed(2)} edges/file`)

const couplingColor = couplingRatio < 2.5 ? '32' : couplingRatio < 4 ? '33' : '31'
const couplingLabel = couplingRatio < 2.5 ? 'HEALTHY' : couplingRatio < 4 ? 'MODERATE' : 'HIGH'
console.log(`    Status:          \x1b[${couplingColor}m${couplingLabel}\x1b[0m`)

console.log(`\n  \x1b[1mHub Dependency Ratio (top ${topN}):\x1b[0m`)
for (const [file, count] of topHubs) {
  const pct = ((count / edgeCount) * 100).toFixed(1)
  console.log(`    ${file}`)
  console.log(`      \x1b[90m${count} importers (${pct}% of edges)\x1b[0m`)
}
const hdrPct = (hdr * 100).toFixed(1)
const domainHdrPct = (domainHdr * 100).toFixed(1)
const domainHdrColor = domainHdr < 0.2 ? '32' : domainHdr < 0.35 ? '33' : '31'
const domainHdrLabel = domainHdr < 0.1 ? 'EXTREMELY MODULAR' : domainHdr < 0.2 ? 'HEALTHY' : domainHdr < 0.35 ? 'CENTRALIZING' : 'DANGEROUS'
console.log(`\n    HDR (all):       ${hdrPct}% \x1b[90m(includes infra hubs — expected to be high)\x1b[0m`)
console.log(`    HDR (domain):    \x1b[${domainHdrColor}m${domainHdrPct}% (${domainHdrLabel})\x1b[0m \x1b[90m← this is the metric that matters\x1b[0m`)

console.log(`\n  \x1b[1mGod-Service Detection:\x1b[0m`)
if (godServices.length === 0) {
  console.log(`    \x1b[32mNo god-services detected\x1b[0m`)
  console.log(`    \x1b[90mTop domain modules:\x1b[0m`)
  for (const [file, count] of domainHubs.slice(0, 5)) {
    console.log(`      ${file} \x1b[90m(${count} importers)\x1b[0m`)
  }
} else {
  console.log(`    \x1b[31m${godServices.length} god-service(s) detected:\x1b[0m`)
  for (const [file, count] of godServices) {
    console.log(`      \x1b[31m${file} (${count} importers — threshold: ${Math.round(godServiceThreshold)})\x1b[0m`)
  }
}

console.log(`\n  \x1b[1mCircular Dependencies:\x1b[0m`)
if (cycles.length === 0) {
  console.log(`    \x1b[32m0 cycles detected\x1b[0m`)
} else {
  console.log(`    \x1b[31m${cycles.length} cycle(s) detected:\x1b[0m`)
  for (const cycle of cycles.slice(0, 5)) {
    console.log(`      ${cycle.map((f) => f.split('/').pop()).join(' → ')}`)
  }
  if (cycles.length > 5) {
    console.log(`      ... and ${cycles.length - 5} more`)
  }
}

// ── Trend comparison ────────────────────────────────────────────────

if (existsSync(BASELINE_PATH)) {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))
  console.log(`\n  \x1b[1mTrend (vs baseline ${baseline.date}):\x1b[0m`)

  const delta = (current, prev, label) => {
    const diff = current - prev
    const arrow = diff > 0 ? '\x1b[33m↑\x1b[0m' : diff < 0 ? '\x1b[32m↓\x1b[0m' : '='
    return `    ${label}: ${prev} → ${current} ${arrow}`
  }

  console.log(delta(fileCount, baseline.files, 'Files'))
  console.log(delta(edgeCount, baseline.edges, 'Edges'))
  console.log(`    Coupling: ${baseline.couplingRatio.toFixed(2)} → ${couplingRatio.toFixed(2)}`)
  console.log(`    HDR (domain): ${((baseline.domainHdr || baseline.hdr) * 100).toFixed(1)}% → ${domainHdrPct}%`)
  console.log(`    Cycles:   ${baseline.cycles} → ${cycles.length}`)

  // Warn if trending badly
  if (couplingRatio > baseline.couplingRatio * 1.15) {
    console.log(`\n    \x1b[33m⚠  Coupling ratio increased >15% — review new dependencies\x1b[0m`)
  }
  if (domainHdr > (baseline.domainHdr || baseline.hdr) * 1.2) {
    console.log(`    \x1b[33m⚠  Domain hub concentration increased >20% — check for centralizing modules\x1b[0m`)
  }
}

// ── Overall grade ───────────────────────────────────────────────────

let grade = 'A'
let gradeColor = '32'
if (cycles.length > 0) { grade = 'C'; gradeColor = '33' }
if (godServices.length > 0) { grade = 'C'; gradeColor = '33' }
if (couplingRatio >= 4) { grade = 'D'; gradeColor = '31' }
if (domainHdr >= 0.35) { grade = 'D'; gradeColor = '31' }
if (cycles.length === 0 && godServices.length === 0 && couplingRatio < 2.5 && domainHdr < 0.2) {
  grade = 'A'
  gradeColor = '32'
} else if (cycles.length === 0 && godServices.length === 0) {
  grade = 'B'
  gradeColor = '32'
}

console.log(`\n  \x1b[1mOverall Grade: \x1b[${gradeColor}m${grade}\x1b[0m`)
console.log()

// ── Save baseline ───────────────────────────────────────────────────

if (process.argv.includes('--save-baseline')) {
  const baseline = {
    date: new Date().toISOString().split('T')[0],
    files: fileCount,
    edges: edgeCount,
    couplingRatio,
    hdr,
    domainHdr,
    cycles: cycles.length,
    topHubs: topHubs.map(([file, count]) => ({ file, count })),
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
  console.log(`  \x1b[32mBaseline saved to ${BASELINE_PATH}\x1b[0m\n`)
}
