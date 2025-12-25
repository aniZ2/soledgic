// Script to apply migrations using supabase-js admin client
// Run with: node scripts/apply-migrations.mjs

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load environment variables
import 'dotenv/config'

const SUPABASE_URL = process.env.SOLEDGIC_URL?.replace('/functions/v1', '') || 'https://ocjrcsmoeikxfooeglkt.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  console.error('You can find it in your Supabase project settings -> API -> service_role key')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
})

// SQL statements to execute
const migrations = [
  // Drop functions first to allow return type changes
  `DROP FUNCTION IF EXISTS send_invoice_atomic(UUID, UUID)`,
  `DROP FUNCTION IF EXISTS record_invoice_payment_atomic(UUID, UUID, BIGINT, TEXT, DATE, TEXT, TEXT)`,
  `DROP FUNCTION IF EXISTS void_invoice_atomic(UUID, UUID, TEXT)`,
  `DROP FUNCTION IF EXISTS diagnose_balance_sheet(UUID)`,
  `DROP FUNCTION IF EXISTS find_imbalanced_transactions(UUID)`,
  `DROP FUNCTION IF EXISTS check_balance_equation(UUID)`,
  `DROP FUNCTION IF EXISTS find_orphaned_entries(UUID)`,
]

async function runSQL(sql, description) {
  console.log(`Executing: ${description || sql.substring(0, 50)}...`)
  const { data, error } = await supabase.rpc('pg_query', { query: sql })
  if (error) {
    console.error(`Error: ${error.message}`)
    return false
  }
  console.log('  ✓ Success')
  return true
}

async function main() {
  console.log('Applying migrations via Supabase API...\n')

  // Read migration files
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations')
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.startsWith('20260') && f.endsWith('.sql') && !f.includes('_OLD_'))
    .sort()

  console.log('Found migrations:', migrationFiles.join(', '))

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    console.log(`\nApplying ${file}...`)

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })
    if (error) {
      console.error(`Error in ${file}: ${error.message}`)
      // Try executing line by line
      const lines = sql.split(';').filter(l => l.trim())
      for (const line of lines) {
        if (line.trim()) {
          const { error: lineError } = await supabase.rpc('exec_sql', { sql_query: line + ';' })
          if (lineError) {
            console.error(`  Error: ${lineError.message}`)
          }
        }
      }
    } else {
      console.log(`  ✓ ${file} applied`)
    }
  }

  console.log('\nDone!')
}

main().catch(console.error)
