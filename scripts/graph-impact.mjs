#!/usr/bin/env node
/**
 * Query the repo knowledge graph for impact analysis.
 *
 * Usage:
 *   node scripts/graph-impact.mjs refund-service
 *   node scripts/graph-impact.mjs RPC_RECORD_REFUND_ATOMIC_V2
 *   node scripts/graph-impact.mjs SVC_PAYOUT_ENGINE
 *   node scripts/graph-impact.mjs --list              # list all nodes
 *   node scripts/graph-impact.mjs --blast-radius <id>  # full transitive impact prediction
 *   node scripts/graph-impact.mjs --critical-paths     # show critical paths
 *   node scripts/graph-impact.mjs --invariants         # show invariants
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const INDEX_PATH = join(
  process.env.HOME,
  '.claude/projects/-Users-osifo-Desktop-soledgic/memory/repo-index.md',
)

const index = readFileSync(INDEX_PATH, 'utf-8')

// ── Parse service blocks ────────────────────────────────────────────

function parseServiceBlocks() {
  const blocks = []
  const regex = /^SERVICE: (\S+)\n([\s\S]*?)(?=\n(?:SERVICE:|RPC:|---|\n## ))/gm
  let match
  while ((match = regex.exec(index)) !== null) {
    const id = match[1]
    const body = match[2]
    blocks.push({
      type: 'SERVICE',
      id,
      file: extractField(body, 'FILE'),
      risk: extractField(body, 'RISK'),
      calls: extractList(body, 'CALLS'),
      calledBy: extractList(body, 'CALLED_BY'),
      writes: extractList(body, 'WRITES'),
      reads: extractList(body, 'READS'),
      external: extractField(body, 'EXTERNAL'),
      concurrency: extractField(body, 'CONCURRENCY'),
      testedBy: extractField(body, 'TESTED_BY'),
      changeImpact: extractField(body, 'CHANGE_IMPACT'),
    })
  }
  return blocks
}

function parseRpcBlocks() {
  const blocks = []
  const regex = /^RPC: (\S+)\n([\s\S]*?)(?=\n(?:RPC:|TRIGGER:|SERVICE:|---|\n## ))/gm
  let match
  while ((match = regex.exec(index)) !== null) {
    const id = match[1]
    const body = match[2]
    blocks.push({
      type: 'RPC',
      id,
      callers: extractField(body, 'CALLERS'),
      dependsOn: extractField(body, 'DEPENDS_ON'),
      triggers: extractField(body, 'TRIGGERS'),
      downstream: extractField(body, 'DOWNSTREAM'),
      lock: extractField(body, 'LOCK'),
      concurrency: extractField(body, 'CONCURRENCY'),
      guard: extractField(body, 'GUARD'),
      risk: extractField(body, 'RISK'),
      changeImpact: extractField(body, 'CHANGE_IMPACT'),
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
    })
  }
  return invariants
}

function parseEntryPoints() {
  const entries = []
  const regex = /^ENTRYPOINT: (\S+)\n([\s\S]*?)(?=\nENTRYPOINT:|\n```)/gm
  let match
  while ((match = regex.exec(index)) !== null) {
    entries.push({
      id: match[1],
      body: match[2].trim(),
    })
  }
  return entries
}

function extractField(body, field) {
  const regex = new RegExp(`^${field}:\\s*(.+)`, 'mi')
  const match = body.match(regex)
  return match ? match[1].trim() : null
}

function extractList(body, field) {
  const regex = new RegExp(`^${field}:\\s*(.+)`, 'mi')
  const match = body.match(regex)
  if (!match) return []
  return match[1].split(',').map((s) => s.trim()).filter(Boolean)
}

// ── Impact analysis ─────────────────────────────────────────────────

function findImpact(query) {
  const services = parseServiceBlocks()
  const rpcs = parseRpcBlocks()
  const criticalPaths = parseCriticalPaths()
  const invariants = parseInvariants()
  const entryPoints = parseEntryPoints()
  const q = query.toUpperCase()

  // Find matching nodes
  const matchedServices = services.filter(
    (s) =>
      s.id.includes(q) ||
      (s.file && s.file.toLowerCase().includes(query.toLowerCase())),
  )
  const matchedRpcs = rpcs.filter((r) => r.id.includes(q))

  if (matchedServices.length === 0 && matchedRpcs.length === 0) {
    // Fuzzy search across all fields
    const allNodes = [...services, ...rpcs]
    const fuzzy = allNodes.filter((n) => {
      const text = JSON.stringify(n).toLowerCase()
      return text.includes(query.toLowerCase())
    })
    if (fuzzy.length === 0) {
      console.log(`\x1b[31mNo nodes found matching "${query}"\x1b[0m`)
      console.log('\nRun with --list to see all nodes.')
      return
    }
    console.log(
      `\x1b[33mNo exact match. Found ${fuzzy.length} fuzzy matches:\x1b[0m\n`,
    )
    for (const n of fuzzy) {
      console.log(`  ${n.type}: ${n.id}`)
    }
    return
  }

  // Print service impacts
  for (const svc of matchedServices) {
    console.log(`\n\x1b[1m\x1b[36m${svc.id}\x1b[0m`)
    console.log(`  File: ${svc.file || '(inline)'}`)
    console.log(`  Risk: \x1b[${svc.risk === 'CRITICAL_LEDGER' || svc.risk === 'CRITICAL_EXTERNAL' ? '31' : '33'}m${svc.risk}\x1b[0m`)

    if (svc.calls.length) console.log(`\n  Calls:`)
    for (const c of svc.calls) console.log(`    → ${c}`)

    if (svc.calledBy.length) console.log(`\n  Called by:`)
    for (const c of svc.calledBy) console.log(`    ← ${c}`)

    if (svc.writes.length) console.log(`\n  Writes: ${svc.writes.join(', ')}`)
    if (svc.reads.length) console.log(`  Reads: ${svc.reads.join(', ')}`)
    if (svc.external) console.log(`  External: ${svc.external}`)
    if (svc.concurrency) console.log(`  Concurrency: ${svc.concurrency}`)
    if (svc.testedBy) console.log(`  Tested by: ${svc.testedBy}`)

    if (svc.changeImpact) {
      console.log(`\n  \x1b[1mChange Impact:\x1b[0m`)
      for (const item of svc.changeImpact.split(',').map((s) => s.trim())) {
        console.log(`    ⚠  ${item}`)
      }
    }

    // Find critical paths involving this service
    const affectedPaths = criticalPaths.filter(
      (p) => p.chain && p.chain.includes(svc.id),
    )
    if (affectedPaths.length) {
      console.log(`\n  \x1b[31mCritical Paths Affected:\x1b[0m`)
      for (const p of affectedPaths) {
        console.log(`    🔥 ${p.id}`)
        if (p.invariants) console.log(`       Invariants: ${p.invariants}`)
      }
    }

    // Find entry points
    const affectedEntryPoints = entryPoints.filter(
      (e) => e.body.includes(svc.id),
    )
    if (affectedEntryPoints.length) {
      console.log(`\n  Entry Points:`)
      for (const e of affectedEntryPoints) {
        console.log(`    📍 ${e.id}`)
      }
    }
  }

  // Print RPC impacts
  for (const rpc of matchedRpcs) {
    console.log(`\n\x1b[1m\x1b[35m${rpc.id}\x1b[0m`)
    if (rpc.risk) console.log(`  Risk: \x1b[31m${rpc.risk}\x1b[0m`)
    if (rpc.callers) console.log(`  Callers: ${rpc.callers}`)
    if (rpc.dependsOn) console.log(`  Depends on: ${rpc.dependsOn}`)
    if (rpc.triggers) console.log(`  Triggers: ${rpc.triggers}`)
    if (rpc.downstream) console.log(`  Downstream: ${rpc.downstream}`)
    if (rpc.lock) console.log(`  Lock: ${rpc.lock}`)
    if (rpc.guard) console.log(`  Guard: ${rpc.guard}`)
    if (rpc.concurrency) console.log(`  Concurrency: ${rpc.concurrency}`)
    if (rpc.changeImpact) {
      console.log(`\n  \x1b[1mChange Impact:\x1b[0m ${rpc.changeImpact}`)
    }

    const affectedPaths = criticalPaths.filter(
      (p) => p.chain && p.chain.includes(rpc.id),
    )
    if (affectedPaths.length) {
      console.log(`\n  \x1b[31mCritical Paths Affected:\x1b[0m`)
      for (const p of affectedPaths) {
        console.log(`    🔥 ${p.id}`)
      }
    }
  }
}

// ── Blast radius prediction ─────────────────────────────────────────

const RISK_SCORES = {
  CRITICAL_LEDGER: 100,
  CRITICAL_EXTERNAL: 90,
  FINANCIAL_ORCHESTRATION: 60,
  API_SURFACE: 30,
  UI_ONLY: 10,
}

function buildAdjacencyGraph() {
  const services = parseServiceBlocks()
  const rpcs = parseRpcBlocks()
  const criticalPaths = parseCriticalPaths()
  const invariants = parseInvariants()

  // Build a unified node map
  const nodes = new Map()
  for (const s of services) {
    nodes.set(s.id, {
      ...s,
      dependents: [], // who depends on me (reverse edges)
    })
  }
  for (const r of rpcs) {
    nodes.set(r.id, {
      ...r,
      type: 'RPC',
      dependents: [],
    })
  }

  // Build edges: service calls → targets become dependents
  for (const s of services) {
    for (const callTarget of s.calls) {
      const target = nodes.get(callTarget)
      if (target) {
        target.dependents.push(s.id)
      }
    }
    // calledBy → the caller depends on this service
    for (const caller of s.calledBy) {
      // caller depends on s → s's dependents include caller
      // But we want reverse: if s changes, caller is affected
      // So s.dependents should include caller
      if (!s.dependents) s.dependents = []
    }
  }

  // For RPCs: callers are dependents
  for (const r of rpcs) {
    if (r.callers) {
      for (const caller of r.callers.split(',').map((c) => c.trim())) {
        // Find service whose file or id matches the caller
        for (const [id, node] of nodes) {
          if (node.type === 'SERVICE') {
            const fileBase = node.file
              ? node.file.split('/').pop().replace('.ts', '')
              : ''
            if (
              caller.includes(fileBase) ||
              caller.includes(id) ||
              (node.calledBy && node.calledBy.some((cb) => caller.includes(cb)))
            ) {
              if (!r.dependents) r.dependents = []
              r.dependents.push(id)
            }
          }
        }
      }
    }
  }

  return { nodes, services, rpcs, criticalPaths, invariants }
}

function blastRadius(query) {
  const { nodes, services, rpcs, criticalPaths, invariants } =
    buildAdjacencyGraph()
  const q = query.toUpperCase()

  // Find the source node
  let sourceId = null
  for (const [id] of nodes) {
    if (id.includes(q) || id === q) {
      sourceId = id
      break
    }
  }

  // Fuzzy fallback
  if (!sourceId) {
    for (const s of services) {
      if (s.file && s.file.toLowerCase().includes(query.toLowerCase())) {
        sourceId = s.id
        break
      }
    }
  }

  if (!sourceId) {
    console.log(`\x1b[31mNo node found matching "${query}"\x1b[0m`)
    return
  }

  const source = nodes.get(sourceId)

  // BFS to find all transitively affected nodes
  const affected = new Map() // id → { depth, path }
  const queue = [{ id: sourceId, depth: 0, path: [sourceId] }]
  const visited = new Set([sourceId])

  while (queue.length > 0) {
    const { id, depth, path } = queue.shift()
    const node = nodes.get(id)
    if (!node) continue

    // Forward edges: what this node calls
    const calls = node.calls || []
    for (const target of calls) {
      if (!visited.has(target)) {
        visited.add(target)
        const newPath = [...path, target]
        affected.set(target, { depth: depth + 1, path: newPath })
        queue.push({ id: target, depth: depth + 1, path: newPath })
      }
    }

    // Reverse edges: who calls this node (they are affected if this changes)
    const calledBy = node.calledBy || []
    for (const caller of calledBy) {
      if (!visited.has(caller)) {
        visited.add(caller)
        const newPath = [...path, caller]
        affected.set(caller, { depth: depth + 1, path: newPath })
        queue.push({ id: caller, depth: depth + 1, path: newPath })
      }
    }

    // Dependents from RPC callers
    const dependents = node.dependents || []
    for (const dep of dependents) {
      if (!visited.has(dep)) {
        visited.add(dep)
        const newPath = [...path, dep]
        affected.set(dep, { depth: depth + 1, path: newPath })
        queue.push({ id: dep, depth: depth + 1, path: newPath })
      }
    }
  }

  // Compute aggregate risk
  let maxRisk = RISK_SCORES[source.risk] || 0
  let riskLabel = source.risk || 'unknown'
  const affectedTests = new Set()
  const affectedFiles = []

  if (source.testedBy) affectedTests.add(source.testedBy)
  if (source.file) affectedFiles.push(source.file)

  for (const [id, info] of affected) {
    const node = nodes.get(id)
    if (!node) continue
    const score = RISK_SCORES[node.risk] || 0
    if (score > maxRisk) {
      maxRisk = score
      riskLabel = node.risk
    }
    if (node.testedBy) affectedTests.add(node.testedBy)
    if (node.file) affectedFiles.push(node.file)
  }

  // Find affected critical paths
  const affectedCritPaths = criticalPaths.filter((p) => {
    if (!p.chain) return false
    if (p.chain.includes(sourceId)) return true
    for (const [id] of affected) {
      if (p.chain.includes(id)) return true
    }
    return false
  })

  // Find threatened invariants
  const threatenedInvariants = invariants.filter((inv) => {
    const text = `${inv.enforcedBy || ''} ${inv.verifiedBy || ''}`
    if (text.includes(sourceId)) return true
    for (const [id] of affected) {
      if (text.includes(id)) return true
    }
    return false
  })

  // Parse change impact items
  const changeImpactItems = new Set()
  if (source.changeImpact) {
    for (const item of source.changeImpact.split(',').map((s) => s.trim())) {
      changeImpactItems.add(item)
    }
  }
  for (const [id] of affected) {
    const node = nodes.get(id)
    if (node?.changeImpact) {
      for (const item of node.changeImpact.split(',').map((s) => s.trim())) {
        changeImpactItems.add(item)
      }
    }
  }

  // ── Print report ──────────────────────────────────────────────────
  const riskColor = maxRisk >= 90 ? '31' : maxRisk >= 60 ? '33' : '32'

  console.log(`\n\x1b[1m╔══════════════════════════════════════════════════╗\x1b[0m`)
  console.log(`\x1b[1m║  BLAST RADIUS: ${sourceId.padEnd(33)}║\x1b[0m`)
  console.log(`\x1b[1m╚══════════════════════════════════════════════════╝\x1b[0m`)

  console.log(`\n  Source:     ${sourceId}`)
  console.log(`  Risk Level: \x1b[${riskColor}m${riskLabel} (${maxRisk}/100)\x1b[0m`)
  console.log(`  Radius:     ${affected.size} nodes affected`)

  // Depth layers
  const byDepth = new Map()
  for (const [id, info] of affected) {
    if (!byDepth.has(info.depth)) byDepth.set(info.depth, [])
    byDepth.get(info.depth).push(id)
  }

  if (byDepth.size > 0) {
    console.log(`\n  \x1b[1mAffected Nodes (by distance):\x1b[0m`)
    for (const [depth, ids] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`    Depth ${depth}:`)
      for (const id of ids) {
        const node = nodes.get(id)
        const risk = node?.risk ? ` \x1b[90m(${node.risk})\x1b[0m` : ''
        console.log(`      ${depth === 1 ? '├─' : '│ ├─'} ${id}${risk}`)
      }
    }
  }

  if (affectedCritPaths.length > 0) {
    console.log(`\n  \x1b[31m\x1b[1mCritical Paths at Risk (${affectedCritPaths.length}):\x1b[0m`)
    for (const p of affectedCritPaths) {
      console.log(`    🔥 ${p.id}`)
    }
  }

  if (threatenedInvariants.length > 0) {
    console.log(`\n  \x1b[33m\x1b[1mThreatened Invariants (${threatenedInvariants.length}):\x1b[0m`)
    for (const inv of threatenedInvariants) {
      console.log(`    ⚠  ${inv.id}: ${inv.description}`)
    }
  }

  if (affectedTests.size > 0) {
    console.log(`\n  \x1b[36mRequired Test Suites:\x1b[0m`)
    for (const t of affectedTests) {
      console.log(`    🧪 ${t}`)
    }
  }

  if (changeImpactItems.size > 0) {
    console.log(`\n  \x1b[1mFull Change Impact:\x1b[0m`)
    for (const item of changeImpactItems) {
      console.log(`    → ${item}`)
    }
  }

  if (affectedFiles.length > 0) {
    console.log(`\n  \x1b[90mFiles to review:\x1b[0m`)
    for (const f of [...new Set(affectedFiles)]) {
      console.log(`    ${f}`)
    }
  }

  // Safety recommendation
  console.log(`\n  \x1b[1mRecommendation:\x1b[0m`)
  if (maxRisk >= 90) {
    console.log(`    \x1b[31m■ HIGH RISK — Requires careful review, full test suite, staging validation\x1b[0m`)
  } else if (maxRisk >= 60) {
    console.log(`    \x1b[33m■ MODERATE RISK — Run affected tests, verify invariants\x1b[0m`)
  } else {
    console.log(`    \x1b[32m■ LOW RISK — Standard review and testing\x1b[0m`)
  }

  console.log()
}

// ── CLI ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help') {
  console.log(`
\x1b[1mRepo Knowledge Graph Query\x1b[0m

Usage:
  node scripts/graph-impact.mjs <query>                Impact analysis for a service/RPC
  node scripts/graph-impact.mjs --blast-radius <id>    Full transitive blast radius prediction
  node scripts/graph-impact.mjs --list                 List all graph nodes
  node scripts/graph-impact.mjs --critical-paths       Show critical paths
  node scripts/graph-impact.mjs --invariants           Show system invariants
  node scripts/graph-impact.mjs --entry-points         Show entry point chains

Examples:
  node scripts/graph-impact.mjs refund-service
  node scripts/graph-impact.mjs --blast-radius SVC_REFUND_ENGINE
  node scripts/graph-impact.mjs --blast-radius payment-provider
  node scripts/graph-impact.mjs RPC_VOID_TRANSACTION_ATOMIC
`)
  process.exit(0)
}

if (args[0] === '--list') {
  const services = parseServiceBlocks()
  const rpcs = parseRpcBlocks()
  console.log('\n\x1b[1mServices:\x1b[0m')
  for (const s of services) {
    console.log(`  ${s.id}  \x1b[90m(${s.risk || 'unknown'})\x1b[0m`)
  }
  console.log('\n\x1b[1mRPCs:\x1b[0m')
  for (const r of rpcs) {
    console.log(`  ${r.id}  \x1b[90m(${r.risk || 'unknown'})\x1b[0m`)
  }
  process.exit(0)
}

if (args[0] === '--critical-paths') {
  const paths = parseCriticalPaths()
  console.log('\n\x1b[1mCritical Paths:\x1b[0m\n')
  for (const p of paths) {
    console.log(`  \x1b[31m${p.id}\x1b[0m`)
    if (p.chain) console.log(`    Chain: ${p.chain}`)
    if (p.invariants) console.log(`    Invariants: ${p.invariants}`)
    console.log()
  }
  process.exit(0)
}

if (args[0] === '--invariants') {
  const invariants = parseInvariants()
  console.log('\n\x1b[1mSystem Invariants:\x1b[0m\n')
  for (const inv of invariants) {
    console.log(`  \x1b[33m${inv.id}\x1b[0m`)
    console.log(`    ${inv.description}`)
    if (inv.enforcedBy) console.log(`    Enforced by: ${inv.enforcedBy}`)
    if (inv.verifiedBy) console.log(`    Verified by: ${inv.verifiedBy}`)
    console.log()
  }
  process.exit(0)
}

if (args[0] === '--entry-points') {
  const entries = parseEntryPoints()
  console.log('\n\x1b[1mEntry Points:\x1b[0m\n')
  for (const e of entries) {
    console.log(`  \x1b[36m${e.id}\x1b[0m`)
    for (const line of e.body.split('\n')) {
      console.log(`    ${line.trim()}`)
    }
    console.log()
  }
  process.exit(0)
}

if (args[0] === '--blast-radius') {
  const query = args.slice(1).join(' ')
  if (!query) {
    console.log('Usage: --blast-radius <service-or-rpc-id>')
    process.exit(1)
  }
  blastRadius(query)
  process.exit(0)
}

findImpact(args.join(' '))
