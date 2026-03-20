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

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const INDEX_PATH = join(ROOT, 'docs/repo-index.md')
const index = readFileSync(INDEX_PATH, 'utf-8')

const EXTRA_CRITICAL_FILES = [
  'supabase/functions/_shared/wallet-service.ts',
  'supabase/functions/_shared/payment-provider.ts',
  'supabase/functions/_shared/stripe-payment-provider.ts',
  'supabase/functions/_shared/stripe-rest.ts',
  'supabase/functions/_shared/capabilities.ts',
  'supabase/functions/_shared/mercury-client.ts',
  'supabase/functions/_shared/utils.ts',
  'supabase/functions/_shared/authority.ts',
  'supabase/functions/_shared/identity-service.ts',
  'apps/web/src/lib/internal-platforms.ts',
  'supabase/functions/_shared/transaction-graph.ts',
  'supabase/functions/_shared/holds-service.ts',
  'supabase/functions/_shared/risk-engine.ts',
]

function extractSection(headingRegex) {
  const safeHeadingRegex = new RegExp(
    headingRegex.source,
    headingRegex.flags.replace(/[gy]/g, ''),
  )
  const match = safeHeadingRegex.exec(index)
  if (!match) return ''
  const start = match.index + match[0].length
  const rest = index.slice(start)
  const nextHeadingMatch = rest.match(/\n##\s+/)
  return (nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest).trim()
}

function normalizePath(filePath) {
  return filePath.replace(/^\.\//, '').replace(/\/$/, '')
}

function normalizeIndexedFilePath(filePath) {
  const normalized = normalizePath(filePath.trim())
  if (normalized.startsWith('_shared/')) {
    return normalizePath(`supabase/functions/${normalized}`)
  }
  return normalized
}

function parseServiceFiles() {
  const filesByService = new Map()
  const regex = /^SERVICE: (\S+)\nFILE: ([^\n]+)/gm
  let match

  while ((match = regex.exec(index)) !== null) {
    const files = match[2]
      .split(' + ')
      .map((file) => normalizeIndexedFilePath(file))
      .filter(Boolean)
    filesByService.set(match[1], files)
  }

  return filesByService
}

function resolveCriticalToken(token, serviceFiles) {
  const trimmed = token.trim()
  if (!trimmed || trimmed.startsWith('EXT_') || trimmed.startsWith('TRG_')) return []

  if (serviceFiles.has(trimmed)) {
    return serviceFiles.get(trimmed)
  }

  if (trimmed === 'CRON_PROCESS_WEBHOOKS' && serviceFiles.has('SVC_WEBHOOK_PROCESSOR')) {
    return serviceFiles.get('SVC_WEBHOOK_PROCESSOR')
  }

  const edgeFunctionName = trimmed.startsWith('CRON_')
    ? trimmed.slice(5).toLowerCase().replace(/_/g, '-')
    : trimmed

  if (/^[a-z0-9-]+$/.test(edgeFunctionName)) {
    const relPath = normalizePath(`supabase/functions/${edgeFunctionName}/index.ts`)
    if (existsSync(join(ROOT, relPath))) {
      return [relPath]
    }
  }

  return []
}

function deriveCriticalFiles() {
  const files = new Set(EXTRA_CRITICAL_FILES.map(normalizePath))
  const serviceFiles = parseServiceFiles()
  const section = extractSection(/^##\s+Critical Paths\b[^\n]*$/m)
  const regex = /^CRITICAL_PATH: (\S+)\n([\s\S]*?)(?=\nCRITICAL_PATH:|\n```)/gm
  let match

  while ((match = regex.exec(section)) !== null) {
    const chainLine = match[2]
      .split('\n')
      .find((line) => line.trim().startsWith('chain:'))
    if (!chainLine) continue

    const chain = chainLine.replace(/^\s*chain:\s*/, '')
    for (const token of chain.split('→')) {
      for (const file of resolveCriticalToken(token, serviceFiles)) {
        files.add(file)
      }
    }
  }

  return [...files].sort()
}

const CRITICAL_PATH_FILES = deriveCriticalFiles()

function getExplicitFilesOverride() {
  const filesIndex = process.argv.indexOf('--files')
  if (filesIndex === -1) return null
  return process.argv.slice(filesIndex + 1).filter((arg) => !arg.startsWith('--'))
}

// ── Get changed files ───────────────────────────────────────────────

function getChangedFiles() {
  const explicitFiles = getExplicitFilesOverride()
  if (explicitFiles) return explicitFiles.map(normalizePath)

  try {
    const diff = execSync('git diff --name-only origin/main...HEAD', { encoding: 'utf-8', cwd: ROOT }).trim()
    if (diff) return diff.split('\n').map(normalizePath).filter(Boolean)
    // Fallback to staged
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf-8', cwd: ROOT }).trim()
    return staged.split('\n').map(normalizePath).filter(Boolean)
  } catch {
    return []
  }
}

// ── Check ───────────────────────────────────────────────────────────

if (process.argv.includes('--list-critical-files')) {
  console.log(JSON.stringify(CRITICAL_PATH_FILES, null, 2))
  process.exit(0)
}

const changedFiles = getChangedFiles()
const touchedCritical = []

for (const file of changedFiles) {
  for (const critPath of CRITICAL_PATH_FILES) {
    if (normalizePath(file) === critPath) {
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
