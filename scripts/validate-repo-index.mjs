#!/usr/bin/env node
/**
 * Validates the repo index against the actual codebase.
 * Checks for drift: missing files, new unindexed functions, orphaned references.
 *
 * Usage: node scripts/validate-repo-index.mjs
 */

import { readdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const INDEX_PATH = join(
  process.env.HOME,
  '.claude/projects/-Users-osifo-Desktop-soledgic/memory/repo-index.md',
)

let errors = 0
let warnings = 0

function error(msg) {
  console.error(`  \x1b[31m✗\x1b[0m ${msg}`)
  errors++
}
function warn(msg) {
  console.warn(`  \x1b[33m!\x1b[0m ${msg}`)
  warnings++
}
function ok(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
}

// ── 1. Check that the index file exists ─────────────────────────────
console.log('\n\x1b[1mRepo Index Validation\x1b[0m\n')

if (!existsSync(INDEX_PATH)) {
  error(`Index file not found: ${INDEX_PATH}`)
  process.exit(1)
}
const index = readFileSync(INDEX_PATH, 'utf-8')

// ── 2. Check all edge function directories ──────────────────────────
console.log('Edge Functions:')
const functionsDir = join(ROOT, 'supabase/functions')
const functionDirs = readdirSync(functionsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)

const functionsWithIndex = functionDirs.filter((name) =>
  existsSync(join(functionsDir, name, 'index.ts')),
)
const functionsWithoutIndex = functionDirs.filter(
  (name) => !existsSync(join(functionsDir, name, 'index.ts')),
)

for (const fn of functionsWithIndex) {
  if (!index.includes(`\`${fn}\``) && !index.includes(`| \`${fn}\``)) {
    warn(`Edge function "${fn}" exists but is not in the index`)
  }
}

if (functionsWithoutIndex.length > 0) {
  for (const fn of functionsWithoutIndex) {
    warn(`Empty directory (no index.ts): supabase/functions/${fn}/`)
  }
}

ok(`${functionsWithIndex.length} edge functions checked`)

// ── 3. Check shared service files ───────────────────────────────────
console.log('\nShared Services:')
const sharedDir = join(ROOT, 'supabase/functions/_shared')
const sharedFiles = readdirSync(sharedDir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith('__'))

for (const file of sharedFiles) {
  if (!index.includes(file)) {
    warn(`Shared service "${file}" not referenced in index`)
  }
}
ok(`${sharedFiles.length} shared service files checked`)

// ── 4. Check dashboard pages ────────────────────────────────────────
console.log('\nDashboard Pages:')
function findPages(dir, prefix = '') {
  const pages = []
  if (!existsSync(dir)) return pages
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      pages.push(...findPages(fullPath, `${prefix}${entry.name}/`))
    } else if (entry.name === 'page.tsx') {
      pages.push(prefix.replace(/\/$/, ''))
    }
  }
  return pages
}

const dashboardPages = findPages(
  join(ROOT, 'apps/web/src/app/(dashboard)'),
)
for (const page of dashboardPages) {
  const simplePath = page.replace(/\(dashboard\)\/?/, '')
  if (simplePath && !index.includes(simplePath) && !index.includes(`/${simplePath}`)) {
    warn(`Dashboard page "${simplePath}" not in index`)
  }
}
ok(`${dashboardPages.length} dashboard pages checked`)

// ── 5. Check migrations ─────────────────────────────────────────────
console.log('\nMigrations:')
const migrationsDir = join(ROOT, 'supabase/migrations')
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

const versionNumbers = migrations.map((f) => f.split('_')[0])
const dupes = versionNumbers.filter(
  (v, i) => versionNumbers.indexOf(v) !== i,
)
if (dupes.length > 0) {
  error(`Duplicate migration versions: ${[...new Set(dupes)].join(', ')}`)
} else {
  ok(`${migrations.length} migrations, no version collisions`)
}

// ── 6. Check proxy allowlist coverage ───────────────────────────────
console.log('\nProxy Allowlist:')
const routePath = join(
  ROOT,
  'apps/web/src/app/api/ledger-functions/[[...endpoint]]/route.ts',
)
if (existsSync(routePath)) {
  const routeContent = readFileSync(routePath, 'utf-8')
  const allowlistMatch = routeContent.match(
    /ALLOWED_ENDPOINT_ROOTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
  )
  if (allowlistMatch) {
    const allowedEndpoints = allowlistMatch[1]
      .match(/'([^']+)'/g)
      ?.map((s) => s.replace(/'/g, ''))
    if (allowedEndpoints) {
      ok(`${allowedEndpoints.length} endpoints in proxy allowlist`)
    }
  }
}

// ── 7. Check SDK method count ───────────────────────────────────────
console.log('\nSDK:')
const sdkPath = join(ROOT, 'sdk/typescript/src/index.ts')
if (existsSync(sdkPath)) {
  const sdkContent = readFileSync(sdkPath, 'utf-8')
  const asyncMethods = sdkContent.match(/^\s+async \w+\(/gm)
  if (asyncMethods) {
    ok(`${asyncMethods.length} async SDK methods`)
  }
}

// ── 8. Check table references against migrations ────────────────────
console.log('\nTable References:')

// Collect all CREATE TABLE names from migrations
const allMigrationSql = migrations
  .map((f) => readFileSync(join(migrationsDir, f), 'utf-8'))
  .join('\n')
const createTableRegex = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)/gi
const tablesInMigrations = new Set()
let ctMatch
while ((ctMatch = createTableRegex.exec(allMigrationSql)) !== null) {
  tablesInMigrations.add(ctMatch[1].toLowerCase())
}

// Collect all .from('table') references in edge function code
const fromRegex = /\.from\(\s*['"](\w+)['"]\s*\)/g
const tablesUsedInCode = new Map() // table -> [files]

function scanDir(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('node_modules') && !entry.name.startsWith('__tests__')) {
      scanDir(fullPath)
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      const content = readFileSync(fullPath, 'utf-8')
      let m
      while ((m = fromRegex.exec(content)) !== null) {
        const table = m[1].toLowerCase()
        if (!tablesUsedInCode.has(table)) tablesUsedInCode.set(table, [])
        tablesUsedInCode.get(table).push(fullPath.replace(ROOT + '/', ''))
      }
    }
  }
}

scanDir(join(ROOT, 'supabase/functions'))
scanDir(join(ROOT, 'apps/web/src'))

// Known non-table .from() targets (Supabase storage, auth, etc.)
const ignoredFromTargets = new Set([
  'auth', 'storage', 'vault', 'secrets',
  'tax-documents', // hyphenated = Supabase view/alias, not a raw table name
])

let ghostTables = 0
for (const [table, files] of tablesUsedInCode) {
  if (ignoredFromTargets.has(table)) continue
  if (!tablesInMigrations.has(table)) {
    warn(`Table "${table}" used in code but no CREATE TABLE in migrations (${files[0]})`)
    ghostTables++
  }
}
ok(`${tablesUsedInCode.size} tables referenced in code, ${ghostTables} missing from migrations`)

// ── 9. Check SERVICE_ID tags in source files ────────────────────────
console.log('\nService Tags:')
const serviceBlocks = index.match(/SERVICE: (SVC_\w+)\nFILE: (.+)/g) || []
let taggedCount = 0
for (const block of serviceBlocks) {
  const [, svcId, filePath] = block.match(/SERVICE: (SVC_\w+)\nFILE: (.+)/)
  const primaryFile = filePath.split(' + ')[0].trim()
  const absPath = join(ROOT, primaryFile)
  if (existsSync(absPath)) {
    const head = readFileSync(absPath, 'utf-8').slice(0, 200)
    if (head.includes(`SERVICE_ID: ${svcId}`)) {
      taggedCount++
    } else {
      warn(`${filePath} missing "// SERVICE_ID: ${svcId}" comment`)
    }
  }
}
ok(`${taggedCount}/${serviceBlocks.length} services tagged in source`)

// ── 9. Check stable IDs in index ────────────────────────────────────
console.log('\nStable IDs:')
const serviceIds = index.match(/SERVICE: (SVC_\w+)/g)?.length || 0
const rpcIds = index.match(/RPC: (RPC_\w+)/g)?.length || 0
const entryPoints = index.match(/ENTRYPOINT: (\w+)/g)?.length || 0
const invariants = index.match(/INVARIANT_\w+/g)
const uniqueInvariants = new Set(invariants || []).size
ok(
  `${serviceIds} services, ${rpcIds} RPCs, ${entryPoints} entry points, ${uniqueInvariants} invariants`,
)

// ── Summary ─────────────────────────────────────────────────────────
console.log(
  `\n${errors === 0 ? '\x1b[32m' : '\x1b[31m'}` +
    `${errors} errors, ${warnings} warnings\x1b[0m\n`,
)
process.exit(errors > 0 ? 1 : 0)
