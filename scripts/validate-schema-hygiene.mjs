#!/usr/bin/env node
/**
 * Schema Hygiene Validator
 *
 * Detects:
 * 1. Dead tables — created in migrations but never referenced in code
 * 2. Dead columns — exist in migrations but never referenced in any code file
 * 3. Vendor naming violations — stripe_*, plaid_* columns that weren't dropped
 * 4. RPC parameter mismatches — code passes different params than SQL expects
 *
 * Usage: node scripts/validate-schema-hygiene.mjs [--enforce]
 */

import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations')
const ENFORCE = process.argv.includes('--enforce')

// ── Helpers ──────────────────────────────────────────────────────────

let errorCount = 0
let warningCount = 0

function error(msg) {
  console.error(`  \x1b[31m✗ ERROR\x1b[0m ${msg}`)
  errorCount++
}
function warn(msg) {
  if (ENFORCE) {
    console.error(`  \x1b[31m✗ ERROR\x1b[0m ${msg}`)
    errorCount++
  } else {
    console.warn(`  \x1b[33m! WARN\x1b[0m  ${msg}`)
    warningCount++
  }
}
function ok(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
}
function heading(msg) {
  console.log(`\n\x1b[1m${msg}\x1b[0m`)
}

// System tables and schemas to ignore
const IGNORED_TABLES = new Set([
  'schema_migrations', 'spatial_ref_sys', 'pg_stat_statements',
  'pg_stat_statements_info',
])
const IGNORED_PREFIXES = ['auth.', 'storage.', 'vault.', 'extensions.', 'graphql.', 'pg_catalog.']

function isIgnoredTable(name) {
  if (IGNORED_TABLES.has(name)) return true
  return IGNORED_PREFIXES.some((p) => name.startsWith(p))
}

// ── Collect all source files ─────────────────────────────────────────

function findTsFiles(dir) {
  const files = []
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.next', 'dist', '__tests__'].includes(entry.name)) continue
      files.push(...findTsFiles(full))
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

const sourceFiles = [
  ...findTsFiles(join(ROOT, 'supabase/functions')),
  ...findTsFiles(join(ROOT, 'apps/web/src')),
]

// Read all source content once (keyed by path)
const sourceContents = new Map()
for (const f of sourceFiles) {
  sourceContents.set(f, readFileSync(f, 'utf-8'))
}

// Concatenated source for simple grep-style checks
const allSourceText = [...sourceContents.values()].join('\n')

// ── Read all migration SQL ───────────────────────────────────────────

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

// Read each migration individually (ordered) for sequential processing
const migrationSqls = migrationFiles.map((f) => ({
  name: f,
  sql: readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'),
}))
const allMigrationSql = migrationSqls.map((m) => m.sql).join('\n')

// ── Extract SQL function / trigger / view bodies ─────────────────────
// These are the sections of migration SQL that contain runtime logic
// (as opposed to DDL like CREATE TABLE, ALTER TABLE, indexes, grants).
// We look for content between $function$...$function$, $$...$$, and
// CREATE VIEW ... AS SELECT blocks.

function extractSqlFunctionBodies(sql) {
  const bodies = []

  // Match $function$...$function$ and $$...$$ delimited bodies
  // These capture PL/pgSQL function and trigger bodies
  const bodyRe = /\$(?:function|BODY)?\$([\s\S]*?)\$(?:function|BODY)?\$/gi
  let bm
  while ((bm = bodyRe.exec(sql)) !== null) {
    bodies.push(bm[1])
  }

  // Match CREATE [OR REPLACE] VIEW ... AS <query> ending at next top-level statement
  const viewRe = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+\S+\s+AS\s+([\s\S]*?)(?:;(?:\s*(?:CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT|DO|INSERT|UPDATE|DELETE)\b))/gi
  while ((bm = viewRe.exec(sql)) !== null) {
    bodies.push(bm[1])
  }

  return bodies
}

const sqlFunctionBodies = extractSqlFunctionBodies(allMigrationSql)
const allSqlBodiesText = sqlFunctionBodies.join('\n')

// Helper: check if a table name appears in SQL function bodies
// in a DML/query context (not just DDL). We look for common SQL
// patterns: FROM table, JOIN table, INTO table, UPDATE table,
// DELETE FROM table, variable declarations typed as table%ROWTYPE, etc.
function isTableReferencedInSql(tableName) {
  // Word-boundary check: the table name appears in SQL function bodies
  // in a context that isn't just CREATE TABLE / ALTER TABLE / DROP TABLE
  const re = new RegExp(`\\b${tableName}\\b`, 'i')
  return re.test(allSqlBodiesText)
}

// Helper: check if a column name appears in SQL function bodies
function isColumnReferencedInSql(colName) {
  const re = new RegExp(`\\b${colName}\\b`, 'i')
  return re.test(allSqlBodiesText)
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Dead Table Detection
// ═══════════════════════════════════════════════════════════════════════

heading('1. Dead Table Detection')

// Parse CREATE TABLE statements
const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi
const createdTables = new Set()
let m
while ((m = createTableRe.exec(allMigrationSql)) !== null) {
  const name = m[1].toLowerCase()
  if (!isIgnoredTable(name)) createdTables.add(name)
}

// Parse DROP TABLE statements
const dropTableRe = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/gi
const droppedTables = new Set()
while ((m = dropTableRe.exec(allMigrationSql)) !== null) {
  droppedTables.add(m[1].toLowerCase())
}

// Live tables = created minus dropped
const liveTables = new Set([...createdTables].filter((t) => !droppedTables.has(t)))

// Scan code for .from('table') references
const fromRe = /\.from\(\s*['"](\w+)['"]\s*\)/g
const tablesInCode = new Set()
while ((m = fromRe.exec(allSourceText)) !== null) {
  tablesInCode.add(m[1].toLowerCase())
}

const noTsRefTables = [...liveTables].filter((t) => !tablesInCode.has(t)).sort()

// Second pass: check if "dead" tables are actually used in SQL function bodies
const deadTables = []
const sqlOnlyTables = []
for (const t of noTsRefTables) {
  if (isTableReferencedInSql(t)) {
    sqlOnlyTables.push(t)
  } else {
    deadTables.push(t)
  }
}

if (sqlOnlyTables.length > 0) {
  for (const t of sqlOnlyTables) {
    console.log(`  \x1b[36mℹ INFO\x1b[0m  Table "${t}" has no .ts references but IS used in SQL functions/triggers/views`)
  }
}

if (deadTables.length === 0 && sqlOnlyTables.length === 0) {
  ok(`All ${liveTables.size} live tables are referenced in code`)
} else if (deadTables.length === 0) {
  ok(`All tables with no .ts references are used in SQL functions (${sqlOnlyTables.length} SQL-only)`)
} else {
  for (const t of deadTables) {
    warn(`Table "${t}" exists in migrations but has zero references (code + SQL)`)
  }
}

if (deadTables.length > 0 || sqlOnlyTables.length > 0) {
  const parts = []
  if (deadTables.length > 0) parts.push(`${deadTables.length} dead`)
  if (sqlOnlyTables.length > 0) parts.push(`${sqlOnlyTables.length} SQL-only`)
  console.log(`\n  \x1b[90m${parts.join(', ')} table(s) out of ${liveTables.size} live tables\x1b[0m`)
}

// ═══════════════════════════════════════════════════════════════════════
// 2. Dead Column Detection
// ═══════════════════════════════════════════════════════════════════════

heading('2. Dead Column Detection')

// Build table -> columns map from CREATE TABLE blocks
// Parse column definitions between CREATE TABLE ... ( ... );
const tableColumns = new Map() // table -> Set<column>

// Process CREATE TABLE blocks
const createBlockRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)(?:\n\))/gi
while ((m = createBlockRe.exec(allMigrationSql)) !== null) {
  const tableName = m[1].toLowerCase()
  if (isIgnoredTable(tableName) || droppedTables.has(tableName)) continue

  const body = m[2]
  const cols = new Set()

  // Each line that starts with a column name (not a constraint keyword)
  const constraintKeywords = new Set([
    'primary', 'unique', 'check', 'foreign', 'constraint', 'exclude',
  ])
  for (const line of body.split('\n')) {
    const trimmed = line.trim().replace(/,$/, '')
    if (!trimmed) continue
    const firstWord = trimmed.split(/\s+/)[0].toLowerCase()
    if (constraintKeywords.has(firstWord)) continue
    if (firstWord.startsWith('--')) continue
    // Column name is the first word
    if (/^[a-z_][a-z0-9_]*$/i.test(firstWord)) {
      cols.add(firstWord)
    }
  }

  tableColumns.set(tableName, cols)
}

// Process ALTER TABLE ... ADD COLUMN
const addColRe = /ALTER\s+TABLE\s+(?:(?:IF\s+EXISTS\s+)?(?:public\.)?)?(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi
while ((m = addColRe.exec(allMigrationSql)) !== null) {
  const table = m[1].toLowerCase()
  const col = m[2].toLowerCase()
  if (!tableColumns.has(table)) tableColumns.set(table, new Set())
  tableColumns.get(table).add(col)
}

// Process ALTER TABLE ... RENAME COLUMN old TO new
const renameColRe = /ALTER\s+TABLE\s+(?:(?:IF\s+EXISTS\s+)?(?:public\.)?)?(\w+)\s+RENAME\s+COLUMN\s+(\w+)\s+TO\s+(\w+)/gi
while ((m = renameColRe.exec(allMigrationSql)) !== null) {
  const table = m[1].toLowerCase()
  const oldCol = m[2].toLowerCase()
  const newCol = m[3].toLowerCase()
  if (tableColumns.has(table)) {
    tableColumns.get(table).delete(oldCol)
    tableColumns.get(table).add(newCol)
  }
}

// Process ALTER TABLE ... DROP COLUMN
const dropColRe = /ALTER\s+TABLE\s+(?:(?:IF\s+EXISTS\s+)?(?:public\.)?)?(\w+)\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(\w+)/gi
while ((m = dropColRe.exec(allMigrationSql)) !== null) {
  const table = m[1].toLowerCase()
  const col = m[2].toLowerCase()
  if (tableColumns.has(table)) {
    tableColumns.get(table).delete(col)
  }
}

// Only check columns for tables that ARE referenced in code (or SQL)
const referencedTables = [...liveTables].filter((t) => tablesInCode.has(t))
let deadColumnCount = 0
let sqlOnlyColumnCount = 0
const deadColumnsByTable = []
const sqlOnlyColumnsByTable = []

for (const table of referencedTables.sort()) {
  const cols = tableColumns.get(table)
  if (!cols || cols.size === 0) continue

  const deadCols = []
  const sqlOnlyCols = []
  for (const col of cols) {
    // Skip very common / generic column names that produce false positives
    if (['id', 'created_at', 'updated_at'].includes(col)) continue

    // Simple heuristic: does this column name appear ANYWHERE in any .ts file?
    // Use word-boundary-ish check to avoid substring matches
    const colPattern = new RegExp(`['"\`.]${col}['"\`\\s,)\\]]|['"]${col}['"]`, 'i')
    if (!colPattern.test(allSourceText)) {
      // No .ts reference — check SQL function bodies
      if (isColumnReferencedInSql(col)) {
        sqlOnlyCols.push(col)
      } else {
        deadCols.push(col)
      }
    }
  }

  if (deadCols.length > 0) {
    deadColumnsByTable.push({ table, columns: deadCols.sort() })
    deadColumnCount += deadCols.length
  }
  if (sqlOnlyCols.length > 0) {
    sqlOnlyColumnsByTable.push({ table, columns: sqlOnlyCols.sort() })
    sqlOnlyColumnCount += sqlOnlyCols.length
  }
}

if (sqlOnlyColumnCount > 0) {
  for (const { table, columns } of sqlOnlyColumnsByTable) {
    for (const col of columns) {
      console.log(`  \x1b[36mℹ INFO\x1b[0m  Column "${table}.${col}" has no .ts references but IS used in SQL functions`)
    }
  }
}

if (deadColumnCount === 0 && sqlOnlyColumnCount === 0) {
  ok('No potentially dead columns found on referenced tables')
} else if (deadColumnCount === 0) {
  ok(`All columns with no .ts references are used in SQL functions (${sqlOnlyColumnCount} SQL-only)`)
} else {
  for (const { table, columns } of deadColumnsByTable) {
    for (const col of columns) {
      warn(`Column "${table}.${col}" has zero references in code + SQL (potentially dead)`)
    }
  }
}

if (deadColumnCount > 0 || sqlOnlyColumnCount > 0) {
  const parts = []
  if (deadColumnCount > 0) parts.push(`${deadColumnCount} dead`)
  if (sqlOnlyColumnCount > 0) parts.push(`${sqlOnlyColumnCount} SQL-only`)
  console.log(`\n  \x1b[90m${parts.join(', ')} column(s) across ${deadColumnsByTable.length + sqlOnlyColumnsByTable.length} table(s)\x1b[0m`)
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Vendor Naming Lint
// ═══════════════════════════════════════════════════════════════════════

heading('3. Vendor Naming Lint')

const vendorPrefixes = ['stripe_', 'plaid_']
let vendorViolations = 0

for (const [table, cols] of tableColumns) {
  if (droppedTables.has(table)) continue
  for (const col of cols) {
    for (const prefix of vendorPrefixes) {
      if (col.startsWith(prefix)) {
        error(`Vendor-specific column "${table}.${col}" still exists (should use processor_* naming)`)
        vendorViolations++
      }
    }
  }
}

// Also check for vendor-prefixed table names that are still live
for (const table of liveTables) {
  for (const prefix of vendorPrefixes) {
    if (table.startsWith(prefix)) {
      error(`Vendor-specific table "${table}" still exists (should use processor_* naming)`)
      vendorViolations++
    }
  }
}

if (vendorViolations === 0) {
  ok('No vendor-specific naming violations found')
}

// ═══════════════════════════════════════════════════════════════════════
// 4. RPC Parameter Verification
// ═══════════════════════════════════════════════════════════════════════

heading('4. RPC Parameter Verification')

// Parse SQL function signatures: CREATE OR REPLACE FUNCTION name(param1 type, param2 type, ...)
const funcRe = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)/gi
const sqlFunctions = new Map() // name -> [param names]

while ((m = funcRe.exec(allMigrationSql)) !== null) {
  const funcName = m[1].toLowerCase()
  const paramBlock = m[2].trim()

  if (!paramBlock) {
    sqlFunctions.set(funcName, [])
    continue
  }

  // Parse params: "p_ledger_id uuid, p_amount numeric DEFAULT 0"
  const params = []
  for (const part of paramBlock.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    // First word is the param name
    const paramName = trimmed.split(/\s+/)[0].toLowerCase()
    // Skip if it looks like a type (e.g., bare "uuid" without a name — unlikely but guard)
    if (paramName && /^[a-z_]/.test(paramName)) {
      params.push(paramName)
    }
  }
  sqlFunctions.set(funcName, params)
}

// Parse .rpc('func_name', { key: value, ... }) calls from code
// We need brace-depth tracking to only extract top-level keys
const rpcStartRe = /\.rpc\(\s*['"](\w+)['"]\s*,\s*\{/g
const rpcCalls = [] // { func, params: [keys], file, line }

function extractTopLevelKeys(content, openBraceIndex) {
  // Walk from the char after '{' and extract only top-level keys.
  // Skip strings (single/double/backtick-quoted) and nested braces.
  const keys = []
  let depth = 1
  let i = openBraceIndex + 1
  let expectKey = true // we're at a position where a key could appear

  while (i < content.length && depth > 0) {
    const ch = content[i]

    // Skip string literals
    if (ch === "'" || ch === '"' || ch === '`') {
      i++
      while (i < content.length && content[i] !== ch) {
        if (content[i] === '\\') i++ // skip escaped char
        i++
      }
      i++ // skip closing quote
      expectKey = false
      continue
    }

    if (ch === '{') { depth++; i++; expectKey = true; continue }
    if (ch === '}') { depth--; i++; expectKey = true; continue }

    // Comma or newline at depth 1 means next token could be a key
    if (depth === 1 && (ch === ',' || ch === '\n')) {
      expectKey = true
      i++
      continue
    }

    // Only look for keys at depth 1 when we expect one
    if (depth === 1 && expectKey) {
      // Skip whitespace
      if (/\s/.test(ch)) { i++; continue }
      // Match "key:" pattern
      const keyMatch = content.slice(i).match(/^([a-zA-Z_]\w*)\s*:/)
      if (keyMatch) {
        keys.push(keyMatch[1].toLowerCase())
        i += keyMatch[0].length
        expectKey = false
        continue
      }
      // Not a key — stop expecting
      expectKey = false
    }

    i++
  }
  return keys
}

for (const [file, content] of sourceContents) {
  let rm
  while ((rm = rpcStartRe.exec(content)) !== null) {
    const funcName = rm[1].toLowerCase()
    const openBraceIndex = rm.index + rm[0].length - 1

    const keys = extractTopLevelKeys(content, openBraceIndex)

    // Find approximate line number
    const beforeMatch = content.slice(0, rm.index)
    const lineNum = beforeMatch.split('\n').length

    rpcCalls.push({
      func: funcName,
      params: keys,
      file: file.replace(ROOT + '/', ''),
      line: lineNum,
    })
  }
}

let rpcMismatches = 0

for (const call of rpcCalls) {
  const sqlParams = sqlFunctions.get(call.func)
  if (!sqlParams) {
    // Function not found in migrations — might be a system RPC or defined elsewhere
    continue
  }

  // Check each param passed in code against SQL function params
  for (const codeParam of call.params) {
    // SQL params often have p_ prefix; code often omits it
    const matchesDirectly = sqlParams.includes(codeParam)
    const matchesWithPrefix = sqlParams.includes(`p_${codeParam}`)

    if (!matchesDirectly && !matchesWithPrefix) {
      error(
        `RPC "${call.func}" called with unknown param "${codeParam}" ` +
        `(SQL expects: ${sqlParams.join(', ')}) — ${call.file}:${call.line}`
      )
      rpcMismatches++
    }
  }

  // Check if SQL has required params (no DEFAULT) that code doesn't pass
  // This is best-effort: we check params without DEFAULT in the raw SQL
  // We skip this for now since detecting DEFAULT requires deeper parsing
}

if (rpcMismatches === 0) {
  ok(`${rpcCalls.length} RPC calls verified against ${sqlFunctions.size} SQL functions`)
} else {
  console.log(`\n  \x1b[90m${rpcMismatches} RPC parameter mismatch(es)\x1b[0m`)
}

// ═══════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════

heading('Summary')

const modeLabel = ENFORCE ? ' (--enforce: warnings promoted to errors)' : ''
console.log(
  `\n  ${errorCount === 0 ? '\x1b[32m' : '\x1b[31m'}` +
  `${errorCount} error(s), ${warningCount} warning(s)${modeLabel}\x1b[0m\n`
)

if (errorCount > 0) {
  process.exit(1)
}
