#!/usr/bin/env npx tsx
/**
 * Runbook validation script
 *
 * Validates that:
 * 1. Every ops-monitor check name appears in docs/runbooks/README.md
 * 2. Every health-check name appears in README.md
 * 3. Every security-alert type appears in README.md
 * 4. Every runbook file linked in README.md actually exists
 * 5. Every SQL table name referenced in runbooks exists in migrations
 * 6. Every curl endpoint path referenced in runbooks matches an Edge Function directory
 *
 * Usage: npx tsx scripts/runbook-check.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const RUNBOOK_DIR = path.join(ROOT, "docs", "runbooks");
const FUNCTIONS_DIR = path.join(ROOT, "supabase", "functions");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const OPS_MONITOR_FILE = path.join(
  FUNCTIONS_DIR,
  "ops-monitor",
  "index.ts"
);
const HEALTH_CHECK_FILE = path.join(
  MIGRATIONS_DIR,
  "20260314_health_check_cron.sql"
);
const SECURITY_ALERTS_FILE = path.join(
  FUNCTIONS_DIR,
  "security-alerts",
  "index.ts"
);
const README_FILE = path.join(RUNBOOK_DIR, "README.md");

let errors: string[] = [];
let warnings: string[] = [];

function readFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    errors.push(`File not found: ${filePath}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf-8");
}

// ── 1. ops-monitor check names ──────────────────────────────────────────

function checkOpsMonitorNames() {
  const src = readFile(OPS_MONITOR_FILE);
  const readme = readFile(README_FILE);
  if (!src || !readme) return;

  // Extract check names from ops-monitor: look for check/name patterns
  // The check names appear as string keys like 'failed_payouts_24h'
  const checkNames = new Set<string>();
  const nameRegex = /(?:check|name):\s*['"`]([a-z_0-9]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = nameRegex.exec(src)) !== null) {
    checkNames.add(match[1]);
  }

  // Fallback: also look for quoted strings that match the known pattern
  const knownChecks = [
    "failed_payouts_24h",
    "failed_webhooks_24h",
    "stuck_inbox_rows",
    "unreconciled_checkouts",
    "failed_processor_transactions_24h",
    "webhook_auth_failures_24h",
    "inbox_depth",
    "inbox_oldest_pending_seconds",
    "inbox_processing_rate_1h",
  ];

  for (const name of knownChecks) {
    if (src.includes(name)) {
      checkNames.add(name);
    }
  }

  for (const name of checkNames) {
    if (!readme.includes(name)) {
      errors.push(`ops-monitor check '${name}' not found in README.md`);
    }
  }

  console.log(`  [1] ops-monitor: ${checkNames.size} checks found`);
}

// ── 2. health-check names ───────────────────────────────────────────────

function checkHealthCheckNames() {
  const src = readFile(HEALTH_CHECK_FILE);
  const readme = readFile(README_FILE);
  if (!src || !readme) return;

  // Extract check names from SQL — look for v_check_name := 'xxx' patterns
  const checkNames = new Set<string>();
  const nameRegex = /v_check_name\s*:=\s*'([a-z_]+)'/g;
  let match: RegExpExecArray | null;
  while ((match = nameRegex.exec(src)) !== null) {
    checkNames.add(match[1]);
  }

  // Fallback: known check names
  const knownChecks = [
    "ledger_balance",
    "orphaned_entries",
    "transaction_balance",
    "processor_balance_sync",
    "bank_reconciliation_backlog",
    "processor_reconciliation_backlog",
    "negative_balances",
    "webhook_delivery_health",
    "pending_payouts",
    "creator_balance_integrity",
  ];

  for (const name of knownChecks) {
    if (src.includes(name)) {
      checkNames.add(name);
    }
  }

  for (const name of checkNames) {
    if (!readme.includes(name)) {
      errors.push(`health-check '${name}' not found in README.md`);
    }
  }

  console.log(`  [2] health-check: ${checkNames.size} checks found`);
}

// ── 3. security-alert types ─────────────────────────────────────────────

function checkSecurityAlertTypes() {
  const src = readFile(SECURITY_ALERTS_FILE);
  const readme = readFile(README_FILE);
  if (!src || !readme) return;

  // Extract alert_type strings from security-alerts
  const alertTypes = new Set<string>();
  const typeRegex = /alert_type:\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = typeRegex.exec(src)) !== null) {
    alertTypes.add(match[1]);
  }

  // Also look for type: patterns
  const typeRegex2 = /type:\s*['"`]([A-Z][^'"`]+)['"`]/g;
  while ((match = typeRegex2.exec(src)) !== null) {
    alertTypes.add(match[1]);
  }

  for (const alertType of alertTypes) {
    if (!readme.includes(alertType)) {
      errors.push(
        `security-alert type '${alertType}' not found in README.md`
      );
    }
  }

  console.log(`  [3] security-alerts: ${alertTypes.size} alert types found`);
}

// ── 4. Linked runbook files exist ───────────────────────────────────────

function checkLinkedFiles() {
  const readme = readFile(README_FILE);
  if (!readme) return;

  // Extract markdown links to .md files
  const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  const linkedFiles = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(readme)) !== null) {
    const target = match[2];
    // Skip external links
    if (target.startsWith("http")) continue;
    linkedFiles.add(target);
  }

  let found = 0;
  for (const file of linkedFiles) {
    const fullPath = path.join(RUNBOOK_DIR, file);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Linked runbook '${file}' does not exist at ${fullPath}`);
    } else {
      found++;
    }
  }

  console.log(
    `  [4] Linked files: ${found}/${linkedFiles.size} exist`
  );
}

// ── 5. SQL table names in runbooks exist in migrations ──────────────────

function checkTableReferences() {
  // Read all migrations to build table name set
  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"));

  const tables = new Set<string>();
  for (const file of migrationFiles) {
    const content = fs.readFileSync(
      path.join(MIGRATIONS_DIR, file),
      "utf-8"
    );
    // Match CREATE TABLE statements
    const tableRegex =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = tableRegex.exec(content)) !== null) {
      tables.add(match[1].toLowerCase());
    }
  }

  // Read all runbook files
  const runbookFiles = fs
    .readdirSync(RUNBOOK_DIR)
    .filter((f) => f.endsWith(".md"));

  // Extract table names from SQL blocks in runbooks (FROM/JOIN/UPDATE/INSERT INTO/DELETE FROM patterns)
  const referencedTables = new Set<string>();
  const tableRefRegex =
    /(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:public\.)?([a-z_]+)/gi;

  for (const file of runbookFiles) {
    const content = fs.readFileSync(
      path.join(RUNBOOK_DIR, file),
      "utf-8"
    );
    // Only look inside SQL code blocks
    const sqlBlocks = content.match(/```sql[\s\S]*?```/g) || [];
    for (const block of sqlBlocks) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(tableRefRegex.source, "gi");
      while ((match = regex.exec(block)) !== null) {
        const tableName = match[1].toLowerCase();
        // Skip SQL keywords and common aliases
        if (
          [
            "select",
            "where",
            "set",
            "values",
            "as",
            "on",
            "and",
            "or",
            "not",
            "null",
            "true",
            "false",
            "now",
          ].includes(tableName)
        ) {
          continue;
        }
        referencedTables.add(tableName);
      }
    }
  }

  let missing = 0;
  for (const table of referencedTables) {
    if (!tables.has(table)) {
      // Skip: extension tables (cron.*), RPC/function calls, SQL noise
      if (
        ["job", "job_run_details", "cron"].includes(table) ||
        table.startsWith("auto_match_") ||
        table.startsWith("detect_") ||
        table.startsWith("verify_") ||
        table.startsWith("run_") ||
        table.length <= 3
      ) {
        continue;
      }
      warnings.push(
        `Table '${table}' referenced in runbooks but not found in CREATE TABLE migrations (may be created by extension or RPC)`
      );
      missing++;
    }
  }

  console.log(
    `  [5] Tables: ${referencedTables.size} referenced, ${missing} not found in migrations`
  );
}

// ── 6. curl endpoint paths match Edge Function directories ──────────────

function checkEndpointPaths() {
  // Get all Edge Function directory names
  const functionDirs = new Set(
    fs
      .readdirSync(FUNCTIONS_DIR)
      .filter((f) => {
        const stat = fs.statSync(path.join(FUNCTIONS_DIR, f));
        return stat.isDirectory() && f !== "_shared";
      })
  );

  // Read all runbook files
  const runbookFiles = fs
    .readdirSync(RUNBOOK_DIR)
    .filter((f) => f.endsWith(".md"));

  const referencedEndpoints = new Set<string>();

  for (const file of runbookFiles) {
    const content = fs.readFileSync(
      path.join(RUNBOOK_DIR, file),
      "utf-8"
    );
    // Match /functions/v1/xxx patterns in curl commands
    const endpointRegex = /\/functions\/v1\/([a-z-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = endpointRegex.exec(content)) !== null) {
      referencedEndpoints.add(match[1]);
    }
  }

  let missing = 0;
  for (const endpoint of referencedEndpoints) {
    if (!functionDirs.has(endpoint)) {
      errors.push(
        `Endpoint '${endpoint}' referenced in runbooks but no matching Edge Function directory found`
      );
      missing++;
    }
  }

  console.log(
    `  [6] Endpoints: ${referencedEndpoints.size} referenced, ${missing} missing`
  );
}

// ── Main ────────────────────────────────────────────────────────────────

console.log("Runbook validation\n");

checkOpsMonitorNames();
checkHealthCheckNames();
checkSecurityAlertTypes();
checkLinkedFiles();
checkTableReferences();
checkEndpointPaths();

console.log("");

if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) {
    console.log(`  ⚠ ${w}`);
  }
  console.log("");
}

if (errors.length > 0) {
  console.log(`Errors (${errors.length}):`);
  for (const e of errors) {
    console.log(`  ✗ ${e}`);
  }
  console.log("");
  process.exit(1);
} else {
  console.log("All checks passed.");
  process.exit(0);
}
