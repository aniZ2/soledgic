#!/usr/bin/env node
/**
 * Queryable architecture graph — JSON output for agent consumption.
 *
 * Parses the repo-index.md knowledge graph and answers structured queries.
 * All output is JSON to stdout (no ANSI colors, no prose).
 *
 * Usage:
 *   node scripts/graph-query.mjs node SVC_REFUND_ENGINE
 *   node scripts/graph-query.mjs deps SVC_PAYOUT_ENGINE
 *   node scripts/graph-query.mjs dependents RPC_RECORD_SALE_ATOMIC
 *   node scripts/graph-query.mjs risk SVC_PAYMENT_PROVIDER
 *   node scripts/graph-query.mjs tables refund-service
 *   node scripts/graph-query.mjs blast SVC_REFUND_ENGINE
 *   node scripts/graph-query.mjs path SVC_CHECKOUT_ORCHESTRATOR EXT_FINIX
 *   node scripts/graph-query.mjs search payout
 *   node scripts/graph-query.mjs summary
 *   node scripts/graph-query.mjs critical-paths
 *   node scripts/graph-query.mjs invariants
 *
 * npm script:  npm run graph:query -- node SVC_REFUND_ENGINE
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const INDEX_PATH = join(
  process.env.HOME,
  '.claude/projects/-Users-osifo-Desktop-soledgic/memory/repo-index.md',
)

const index = readFileSync(INDEX_PATH, 'utf-8')

// ── Parsers (shared with graph-impact) ──────────────────────────────

function extractField(body, field) {
  const regex = new RegExp(`^\\s*${field}:\\s*(.+)`, 'mi')
  const match = body.match(regex)
  return match ? match[1].trim() : null
}

function extractList(body, field) {
  const regex = new RegExp(`^\\s*${field}:\\s*(.+)`, 'mi')
  const match = body.match(regex)
  if (!match) return []
  return match[1].split(',').map((s) => s.trim()).filter(Boolean)
}

/** Strip parenthetical annotations: "SVC_FOO (bar)" → "SVC_FOO" */
function normalizeId(raw) {
  return raw.replace(/\s*\(.*?\)\s*$/, '').trim()
}

/** Normalize a list of IDs, stripping annotations */
function normalizeList(items) {
  return items.map(normalizeId).filter(Boolean)
}

function parseServiceBlocks() {
  const blocks = []
  const regex = /^SERVICE: (\S+)\n([\s\S]*?)(?=\n(?:SERVICE:|RPC:|---|\n## ))/gm
  let match
  while ((match = regex.exec(index)) !== null) {
    blocks.push({
      type: 'SERVICE',
      id: match[1],
      file: extractField(match[2], 'FILE'),
      risk: extractField(match[2], 'RISK'),
      calls: extractList(match[2], 'CALLS'),
      calledBy: extractList(match[2], 'CALLED_BY'),
      writes: extractList(match[2], 'WRITES'),
      reads: extractList(match[2], 'READS'),
      external: extractField(match[2], 'EXTERNAL'),
      concurrency: extractField(match[2], 'CONCURRENCY'),
      testedBy: extractField(match[2], 'TESTED_BY'),
      changeImpact: extractField(match[2], 'CHANGE_IMPACT'),
    })
  }
  return blocks
}

function parseRpcBlocks() {
  const blocks = []
  const regex = /^RPC: (\S+)\n([\s\S]*?)(?=\n(?:RPC:|TRIGGER:|SERVICE:|---|\n## ))/gm
  let match
  while ((match = regex.exec(index)) !== null) {
    blocks.push({
      type: 'RPC',
      id: match[1],
      callers: extractField(match[2], 'CALLERS'),
      dependsOn: extractField(match[2], 'DEPENDS_ON'),
      triggers: extractField(match[2], 'TRIGGERS'),
      downstream: extractField(match[2], 'DOWNSTREAM'),
      lock: extractField(match[2], 'LOCK'),
      concurrency: extractField(match[2], 'CONCURRENCY'),
      guard: extractField(match[2], 'GUARD'),
      risk: extractField(match[2], 'RISK'),
      changeImpact: extractField(match[2], 'CHANGE_IMPACT'),
    })
  }
  return blocks
}

function parseTriggerBlocks() {
  const blocks = []
  const regex = /^TRIGGER: (\S+)\n([\s\S]*?)(?=\n(?:TRIGGER:|RPC:|SERVICE:|---|\n## ))/gm
  let match
  while ((match = regex.exec(index)) !== null) {
    blocks.push({
      type: 'TRIGGER',
      id: match[1],
      firesOn: extractField(match[2], 'FIRES_ON'),
      updates: extractField(match[2], 'UPDATES'),
      risk: extractField(match[2], 'RISK'),
      changeImpact: extractField(match[2], 'CHANGE_IMPACT'),
    })
  }
  return blocks
}

function parseCriticalPaths() {
  const paths = []
  const regex = /^CRITICAL_PATH: (\S+)\n([\s\S]*?)(?=\nCRITICAL_PATH:|\n```)/gm
  let match
  while ((match = regex.exec(index)) !== null) {
    paths.push({
      id: match[1],
      chain: extractField(match[2], 'chain'),
      invariants: extractField(match[2], 'invariants'),
    })
  }
  return paths
}

function parseInvariants() {
  const invariants = []
  const regex = /^(INVARIANT_\S+)\n([\s\S]*?)(?=\nINVARIANT_|\n```)/gm
  let match
  while ((match = regex.exec(index)) !== null) {
    invariants.push({
      id: match[1],
      description: match[2].split('\n')[0].trim(),
      enforcedBy: extractField(match[2], 'enforced_by'),
      verifiedBy: extractField(match[2], 'verified_by'),
      concurrency: extractField(match[2], 'concurrency'),
      handledBy: extractField(match[2], 'handled_by'),
      immutability: extractField(match[2], 'immutability'),
    })
  }
  return invariants
}

function parseEntryPoints() {
  const entries = []
  const regex = /^ENTRYPOINT: (\S+)\n([\s\S]*?)(?=\nENTRYPOINT:|\n```)/gm
  let match
  while ((match = regex.exec(index)) !== null) {
    const body = match[2].trim()
    const fields = {}
    for (const line of body.split('\n')) {
      const kv = line.match(/^\s*(\w+):\s*(.+)/)
      if (kv) fields[kv[1].toLowerCase()] = kv[2].trim()
    }
    entries.push({ id: match[1], ...fields })
  }
  return entries
}

// ── Resolve a query to a node ───────────────────────────────────────

function allNodes() {
  return [...parseServiceBlocks(), ...parseRpcBlocks(), ...parseTriggerBlocks()]
}

function findNode(query) {
  const nodes = allNodes()
  const q = query.toUpperCase()

  // Exact ID match
  let found = nodes.find((n) => n.id === q)
  if (found) return found

  // Partial ID match
  found = nodes.find((n) => n.id.includes(q))
  if (found) return found

  // File match
  found = nodes.find(
    (n) => n.file && n.file.toLowerCase().includes(query.toLowerCase()),
  )
  if (found) return found

  // Fuzzy: any field contains query
  const matches = nodes.filter((n) =>
    JSON.stringify(n).toLowerCase().includes(query.toLowerCase()),
  )
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return { _ambiguous: true, matches: matches.map((m) => m.id) }

  return null
}

// ── RISK_SCORES (same as graph-impact) ──────────────────────────────

const RISK_SCORES = {
  CRITICAL_LEDGER: 100,
  CRITICAL_EXTERNAL: 90,
  FINANCIAL_ORCHESTRATION: 60,
  API_SURFACE: 30,
  UI_ONLY: 10,
}

// ── Commands ────────────────────────────────────────────────────────

function cmdNode(query) {
  const node = findNode(query)
  if (!node) return { error: `No node found matching "${query}"` }
  if (node._ambiguous) return { error: 'Ambiguous query', candidates: node.matches }
  return node
}

function cmdDeps(query) {
  const node = findNode(query)
  if (!node) return { error: `No node found matching "${query}"` }
  if (node._ambiguous) return { error: 'Ambiguous query', candidates: node.matches }

  const deps = {
    id: node.id,
    calls: node.calls || [],
    external: node.external || null,
  }
  if (node.dependsOn) deps.dependsOn = node.dependsOn
  if (node.triggers) deps.triggers = node.triggers
  if (node.downstream) deps.downstream = node.downstream
  return deps
}

function cmdDependents(query) {
  const node = findNode(query)
  if (!node) return { error: `No node found matching "${query}"` }
  if (node._ambiguous) return { error: 'Ambiguous query', candidates: node.matches }

  const result = { id: node.id, calledBy: node.calledBy || [] }

  // Also find RPCs whose callers reference this node
  if (node.type === 'RPC') {
    result.callers = node.callers || null
  }

  // Find all nodes that call this one
  const nodes = allNodes()
  const transitive = nodes
    .filter((n) => n.calls && n.calls.includes(node.id))
    .map((n) => n.id)
  if (transitive.length > 0) result.calledByResolved = transitive

  return result
}

function cmdRisk(query) {
  const node = findNode(query)
  if (!node) return { error: `No node found matching "${query}"` }
  if (node._ambiguous) return { error: 'Ambiguous query', candidates: node.matches }

  const criticalPaths = parseCriticalPaths()
  const invariants = parseInvariants()

  const affectedPaths = criticalPaths.filter(
    (p) => p.chain && p.chain.includes(node.id),
  )
  const relatedInvariants = invariants.filter((inv) => {
    const text = `${inv.id} ${inv.description} ${inv.enforcedBy || ''} ${inv.verifiedBy || ''}`.toLowerCase()
    return text.includes(node.id.toLowerCase()) ||
      (node.file && text.includes(node.file.split('/').pop().replace('.ts', '').toLowerCase()))
  })

  return {
    id: node.id,
    risk: node.risk || null,
    riskScore: RISK_SCORES[node.risk] || 0,
    criticalPaths: affectedPaths.map((p) => p.id),
    invariants: relatedInvariants.map((i) => i.id),
    concurrency: node.concurrency || null,
    testedBy: node.testedBy || null,
  }
}

function cmdTables(query) {
  const node = findNode(query)
  if (!node) return { error: `No node found matching "${query}"` }
  if (node._ambiguous) return { error: 'Ambiguous query', candidates: node.matches }

  return {
    id: node.id,
    writes: node.writes || [],
    reads: node.reads || [],
  }
}

function cmdBlast(query) {
  const services = parseServiceBlocks()
  const rpcs = parseRpcBlocks()
  const criticalPaths = parseCriticalPaths()
  const invariants = parseInvariants()

  // Build adjacency
  const nodes = new Map()
  for (const s of services) nodes.set(s.id, { ...s, dependents: [] })
  for (const r of rpcs) nodes.set(r.id, { ...r, type: 'RPC', dependents: [] })

  for (const s of services) {
    for (const rawTarget of (s.calls || [])) {
      const target = normalizeId(rawTarget)
      const t = nodes.get(target)
      if (t) t.dependents.push(s.id)
    }
  }

  // Find source
  const q = query.toUpperCase()
  let sourceId = null
  for (const [id] of nodes) {
    if (id === q) { sourceId = id; break }
  }
  if (!sourceId) {
    for (const [id] of nodes) {
      if (id.includes(q)) { sourceId = id; break }
    }
  }
  if (!sourceId) {
    for (const s of services) {
      if (s.file && s.file.toLowerCase().includes(query.toLowerCase())) {
        sourceId = s.id; break
      }
    }
  }
  if (!sourceId) return { error: `No node found matching "${query}"` }

  const source = nodes.get(sourceId)

  // BFS — normalize all edge targets
  const affected = new Map()
  const bfsQueue = [{ id: sourceId, depth: 0, path: [sourceId] }]
  const visited = new Set([sourceId])

  while (bfsQueue.length > 0) {
    const { id, depth, path } = bfsQueue.shift()
    const node = nodes.get(id)
    if (!node) continue

    const neighbors = [
      ...normalizeList(node.calls || []),
      ...normalizeList(node.calledBy || []),
      ...(node.dependents || []),
    ]
    for (const target of neighbors) {
      if (!visited.has(target) && nodes.has(target)) {
        visited.add(target)
        const newPath = [...path, target]
        affected.set(target, { depth: depth + 1, path: newPath })
        bfsQueue.push({ id: target, depth: depth + 1, path: newPath })
      }
    }
  }

  // Aggregate
  let maxRisk = RISK_SCORES[source.risk] || 0
  const allIds = [sourceId, ...affected.keys()]
  let testedCount = 0
  for (const id of allIds) {
    const n = nodes.get(id)
    if (!n) continue
    const s = RISK_SCORES[n.risk] || 0
    if (s > maxRisk) maxRisk = s
    if (n.testedBy && !n.testedBy.includes('no unit tests')) testedCount++
  }
  const coveragePct = Math.round((testedCount / allIds.length) * 100)

  const affectedPaths = criticalPaths.filter((p) => {
    if (!p.chain) return false
    return allIds.some((id) => p.chain.includes(id))
  })

  const touchesExternal = allIds.some((id) => {
    const n = nodes.get(id)
    return n?.external || n?.risk === 'CRITICAL_EXTERNAL'
  })

  const compositeRisk = Math.min(100, Math.round(
    maxRisk * 0.35 +
    Math.min(affected.size * 5, 30) +
    affectedPaths.length * 8 +
    (touchesExternal ? 10 : 0) +
    ((100 - coveragePct) * 0.12),
  ))

  const riskGrade =
    compositeRisk >= 80 ? 'CRITICAL' :
    compositeRisk >= 60 ? 'HIGH' :
    compositeRisk >= 35 ? 'MODERATE' : 'LOW'

  // Group affected by depth
  const byDepth = {}
  for (const [id, info] of affected) {
    const d = String(info.depth)
    if (!byDepth[d]) byDepth[d] = []
    const n = nodes.get(id)
    byDepth[d].push({ id, risk: n?.risk || null })
  }

  return {
    source: sourceId,
    sourceRisk: source.risk || null,
    affectedCount: affected.size,
    compositeRisk,
    riskGrade,
    coveragePct,
    touchesExternal,
    criticalPaths: affectedPaths.map((p) => p.id),
    affectedByDepth: byDepth,
  }
}

function cmdPath(from, to) {
  const services = parseServiceBlocks()
  const nodes = new Map()
  for (const s of services) nodes.set(s.id, s)

  // BFS from source
  const fromQ = from.toUpperCase()
  const toQ = to.toUpperCase()
  let sourceId = null
  let targetId = null
  for (const [id] of nodes) {
    if (id.includes(fromQ)) sourceId = sourceId || id
    if (id.includes(toQ)) targetId = targetId || id
  }
  if (!sourceId) return { error: `Source not found: "${from}"` }
  if (!targetId) return { error: `Target not found: "${to}"` }

  const visited = new Set([sourceId])
  const queue = [{ id: sourceId, path: [sourceId] }]

  while (queue.length > 0) {
    const { id, path } = queue.shift()
    const node = nodes.get(id)
    if (!node) continue
    for (const rawTarget of (node.calls || [])) {
      const target = normalizeId(rawTarget)
      if (target === targetId) return { from: sourceId, to: targetId, path: [...path, target], connected: true }
      if (!visited.has(target) && nodes.has(target)) {
        visited.add(target)
        queue.push({ id: target, path: [...path, target] })
      }
    }
  }

  return { from: sourceId, to: targetId, path: [], connected: false }
}

function cmdSearch(term) {
  const nodes = allNodes()
  const t = term.toLowerCase()
  const matches = nodes
    .filter((n) => JSON.stringify(n).toLowerCase().includes(t))
    .map((n) => ({ id: n.id, type: n.type, risk: n.risk || null, file: n.file || null }))
  return { query: term, resultCount: matches.length, results: matches }
}

function cmdSummary() {
  const services = parseServiceBlocks()
  const rpcs = parseRpcBlocks()
  const triggers = parseTriggerBlocks()
  const criticalPaths = parseCriticalPaths()
  const invariants = parseInvariants()
  const entryPoints = parseEntryPoints()

  const byRisk = {}
  for (const s of services) {
    const r = s.risk || 'unknown'
    byRisk[r] = (byRisk[r] || 0) + 1
  }

  return {
    services: services.length,
    rpcs: rpcs.length,
    triggers: triggers.length,
    criticalPaths: criticalPaths.length,
    invariants: invariants.length,
    entryPoints: entryPoints.length,
    servicesByRisk: byRisk,
    serviceIds: services.map((s) => s.id),
    rpcIds: rpcs.map((r) => r.id),
  }
}

function cmdCriticalPaths() {
  return parseCriticalPaths()
}

function cmdInvariants() {
  return parseInvariants()
}

function cmdEntryPoints() {
  return parseEntryPoints()
}

function cmdBoundaries() {
  const boundariesPath = join(
    new URL('..', import.meta.url).pathname.replace(/\/$/, ''),
    '.service-boundaries.json',
  )
  try {
    const { boundaries } = JSON.parse(readFileSync(boundariesPath, 'utf-8'))
    return boundaries.map((b) => ({
      id: b.id,
      module: b.module,
      allowed: b.allowed,
      reason: b.reason,
    }))
  } catch {
    return { error: 'No .service-boundaries.json found' }
  }
}

// ── CLI dispatch ────────────────────────────────────────────────────

const args = process.argv.slice(2)
const cmd = args[0]

const USAGE = `Architecture graph query tool — JSON output for agents.

Commands:
  node            <id>         Full node details
  deps            <id>         What does <id> depend on?
  dependents      <id>         What depends on <id>?
  risk            <id>         Risk level, critical paths, invariants
  tables          <id>         Tables read/written by <id>
  blast           <id>         Transitive blast radius (composite risk)
  path            <from> <to>  Is there a dependency path?
  search          <term>       Fuzzy search across all nodes
  summary                      Graph stats and node inventory
  critical-paths               All critical paths
  invariants                   All system invariants
  entry-points                 All entry point chains
  boundaries                   Service boundary rules

Examples:
  npm run graph:query -- node SVC_REFUND_ENGINE
  npm run graph:query -- blast payment-provider
  npm run graph:query -- search payout
  npm run graph:query -- risk refund-service`

function output(data) {
  console.log(JSON.stringify(data, null, 2))
}

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(USAGE)
  process.exit(0)
}

switch (cmd) {
  case 'node':
    output(cmdNode(args[1])); break
  case 'deps':
    output(cmdDeps(args[1])); break
  case 'dependents':
    output(cmdDependents(args[1])); break
  case 'risk':
    output(cmdRisk(args[1])); break
  case 'tables':
    output(cmdTables(args[1])); break
  case 'blast':
    output(cmdBlast(args[1])); break
  case 'path':
    output(cmdPath(args[1], args[2])); break
  case 'search':
    output(cmdSearch(args.slice(1).join(' '))); break
  case 'summary':
    output(cmdSummary()); break
  case 'critical-paths':
    output(cmdCriticalPaths()); break
  case 'invariants':
    output(cmdInvariants()); break
  case 'entry-points':
    output(cmdEntryPoints()); break
  case 'boundaries':
    output(cmdBoundaries()); break
  default:
    // Treat as a node query for convenience
    output(cmdNode(cmd))
}
