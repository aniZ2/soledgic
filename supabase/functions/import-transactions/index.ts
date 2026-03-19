// SERVICE_ID: SVC_IMPORT_ENGINE
// Soledgic Edge Function: Import Transactions
// POST /import-transactions - Parse and import bank exports (CSV, OFX)
// SECURITY HARDENED VERSION

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateString,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { detectFileFormat, parseFinancialFile, type FileFormat } from '../_shared/financial-file-parsers.ts'

interface ImportRequest {
  action: 'parse_preview' | 'import' | 'get_templates' | 'save_template' | 'get_sessions'
  format?: 'csv' | 'ofx' | 'qfx' | 'camt053' | 'bai2' | 'mt940' | 'auto'
  data?: string
  mapping?: ColumnMapping
  template_id?: string
  template?: ImportTemplate
  transactions?: ParsedTransaction[]
  account_name?: string
  file_name?: string
  // Balance fields from parsed file (for verification)
  opening_balance?: number
  closing_balance?: number
  currency?: string
  auto_match?: boolean  // Run tiered auto-matching after import (default: true)
}

interface ColumnMapping { date: number | string; description: number | string; amount: number | string; debit?: number | string; credit?: number | string; balance?: number | string; reference?: number | string; account_name?: number | string; status?: number | string; date_format?: string }
interface ImportTemplate { name: string; bank_name: string; format: string; mapping: ColumnMapping; skip_rows?: number; delimiter?: string }
interface ParsedTransaction { date: string; description: string; amount: number; reference?: string; balance?: number; account_name?: string; status?: string; row_index?: number; raw_data?: Record<string, any> }

const BANK_TEMPLATES: Record<string, ImportTemplate> = {
  'chase': { name: 'Chase Bank', bank_name: 'Chase', format: 'csv', mapping: { date: 'Posting Date', description: 'Description', amount: 'Amount' }, skip_rows: 0 },
  'bofa': { name: 'Bank of America', bank_name: 'Bank of America', format: 'csv', mapping: { date: 'Date', description: 'Description', amount: 'Amount' }, skip_rows: 0 },
  'wells_fargo': { name: 'Wells Fargo', bank_name: 'Wells Fargo', format: 'csv', mapping: { date: 0, description: 4, amount: 1 }, skip_rows: 0 },
  'relay': { name: 'Relay', bank_name: 'Relay', format: 'csv', mapping: { date: 'Date', description: 'Description', amount: 'Amount', account_name: 'Account Name', reference: 'Reference' }, skip_rows: 0 },
  'mercury': { name: 'Mercury', bank_name: 'Mercury', format: 'csv', mapping: { date: 'Date', description: 'Description', amount: 'Amount' }, skip_rows: 0 },
  'generic': { name: 'Generic CSV', bank_name: 'Unknown', format: 'csv', mapping: { date: 0, description: 1, amount: 2 }, skip_rows: 1 },
}

const VALID_ACTIONS = ['parse_preview', 'import', 'get_templates', 'save_template', 'get_sessions']

async function generateTxnHash(txn: ParsedTransaction): Promise<string> {
  const parts = [txn.date, txn.amount.toFixed(2), txn.description.substring(0, 100).toLowerCase().trim(), txn.reference || '', txn.account_name || '', txn.row_index?.toString() || '']
  const data = new TextEncoder().encode(parts.join('|'))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return `import_${Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32)}`
}

const handler = createHandler(
  { endpoint: 'import-transactions', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: ImportRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return errorResponse(`Invalid action: must be one of ${VALID_ACTIONS.join(', ')}`, 400, req)
    }

    switch (body.action) {
      case 'get_templates': {
        const { data: userTemplates } = await supabase.from('import_templates').select('*').eq('ledger_id', ledger.id)
        const { data: accounts } = await supabase.from('accounts').select('id, name, account_type, entity_id').eq('ledger_id', ledger.id).eq('is_active', true)
        return jsonResponse({ success: true, data: { builtin: Object.entries(BANK_TEMPLATES).map(([id, t]) => ({ id, ...t })), custom: userTemplates || [], accounts: accounts || [] } }, 200, req)
      }

      case 'parse_preview': {
        if (!body.data) return errorResponse('No file data provided', 400, req)
        const fileContent = atob(body.data)
        const detectedFormat = (body.format && body.format !== 'auto')
          ? body.format as FileFormat
          : detectFileFormat(fileContent)

        // CSV uses the existing template-aware parser
        if (detectedFormat === 'csv') {
          const result = parseCSV(fileContent, body.mapping)
          return jsonResponse({ success: true, data: { format: 'csv', detected_template: result.detectedTemplate, headers: result.headers, row_count: result.transactions.length, preview: result.transactions.slice(0, 10), all_transactions: result.transactions, account_names: [...new Set(result.transactions.map(t => t.account_name).filter(Boolean))] } }, 200, req)
        }

        // All other formats (OFX, QFX, CAMT.053, BAI2, MT940) use the universal parser
        if (detectedFormat === 'unknown') return errorResponse('Unsupported file format', 400, req)

        const result = parseFinancialFile(fileContent, detectedFormat)
        return jsonResponse({ success: true, data: {
          format: result.format,
          detected_template: null,
          headers: [],
          row_count: result.transactions.length,
          preview: result.transactions.slice(0, 10),
          all_transactions: result.transactions,
          account_names: result.accounts,
          currency: result.currency,
          opening_balance: result.opening_balance,
          closing_balance: result.closing_balance,
          statement_date: result.statement_date,
        } }, 200, req)
      }

      case 'import': {
        if (!body.transactions?.length) return errorResponse('No transactions to import', 400, req)

        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name')
          .eq('ledger_id', ledger.id)
          .eq('is_active', true)
        const accountNameMap = new Map<string, string>()
        for (const acc of accounts || []) accountNameMap.set(acc.name.toLowerCase(), acc.id)

        // Ensure a stable "manual import" bank connection exists for this ledger.
        const providerAccountId = 'manual_import'
        const connectionName = body.account_name?.trim() || 'Manual Import'
        const linkedAccountId = accountNameMap.get(connectionName.toLowerCase()) || null

        const { data: existingConn, error: existingConnError } = await supabase
          .from('bank_connections')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('provider', 'manual')
          .eq('provider_account_id', providerAccountId)
          .maybeSingle()

        if (existingConnError) {
          return errorResponse('Failed to access bank connections', 500, req)
        }

        let bankConnectionId = existingConn?.id as string | undefined
        if (!bankConnectionId) {
          const { data: insertedConn, error: insertConnError } = await supabase
            .from('bank_connections')
            .insert({
              ledger_id: ledger.id,
              provider: 'manual',
              provider_account_id: providerAccountId,
              provider_institution_id: null,
              account_name: connectionName,
              account_type: 'other',
              account_mask: null,
              institution_name: 'Manual Import',
              linked_account_id: linkedAccountId,
              sync_status: 'active',
            } as any)
            .select('id')
            .single()

          if (insertConnError || !insertedConn?.id) {
            console.error('Failed creating manual bank connection:', insertConnError)
            return errorResponse('Failed to prepare bank import', 500, req)
          }

          bankConnectionId = insertedConn.id as string
        }

        // ── Create import session ────────────────────────────────
        const fileFormat = body.format || 'csv'
        const { data: session } = await supabase
          .from('import_sessions')
          .insert({
            ledger_id: ledger.id,
            file_name: body.file_name || null,
            file_format: fileFormat,
            row_count: body.transactions.length,
            opening_balance: body.opening_balance ?? null,
            closing_balance: body.closing_balance ?? null,
            currency: body.currency || 'USD',
            status: 'pending',
          } as any)
          .select('id')
          .single()

        const sessionId = (session?.id as string) || null

        // ── Import transactions ──────────────────────────────────
        let imported = 0, skipped = 0
        const errors: string[] = [], seenHashes = new Set<string>()
        const importedIds: string[] = []

        for (let i = 0; i < body.transactions.length; i++) {
          const txn = body.transactions[i]
          txn.row_index = i
          try {
            // Use FITID/reference as primary fingerprint when available
            let txnHash: string
            if (txn.reference && txn.reference.length > 3) {
              txnHash = `ref_${txn.reference}`
            } else {
              txnHash = await generateTxnHash(txn)
            }
            if (seenHashes.has(txnHash)) txnHash = `${txnHash}_${i}`
            seenHashes.add(txnHash)

            const { data: existing } = await supabase
              .from('bank_transactions')
              .select('id')
              .eq('bank_connection_id', bankConnectionId)
              .eq('provider_transaction_id', txnHash)
              .maybeSingle()
            if (existing) { skipped++; continue }

            const { data: inserted } = await supabase.from('bank_transactions').insert({
              ledger_id: ledger.id,
              bank_connection_id: bankConnectionId,
              provider_transaction_id: txnHash,
              amount: txn.amount,
              transaction_date: txn.date,
              posted_date: txn.date,
              name: txn.description,
              merchant_name: extractMerchant(txn.description),
              reconciliation_status: 'unmatched',
              import_session_id: sessionId,
              raw_data: {
                source: 'file_import',
                format: fileFormat,
                account_name: txn.account_name,
                reference: txn.reference,
                row_index: txn.row_index,
                ...txn.raw_data,
              },
            } as any).select('id').single()

            imported++
            if (inserted?.id) importedIds.push(inserted.id as string)

            // Also create real ledger transaction for tax/reporting if requested
            if (body.create_ledger_entries !== false && inserted?.id) {
              try {
                const isIncome = txn.amount > 0
                const absAmount = Math.abs(txn.amount)
                const txnType = isIncome ? 'income' : 'expense'

                // Get or create the accounts
                const cashAccountType = 'cash'
                const counterAccountType = isIncome ? 'platform_revenue' : 'expense'

                const { data: cashAccount } = await supabase
                  .from('accounts')
                  .select('id')
                  .eq('ledger_id', ledger.id)
                  .eq('account_type', cashAccountType)
                  .limit(1)
                  .single()

                const { data: counterAccount } = await supabase
                  .from('accounts')
                  .select('id')
                  .eq('ledger_id', ledger.id)
                  .eq('account_type', counterAccountType)
                  .limit(1)
                  .maybeSingle()

                if (cashAccount && counterAccount) {
                  const { data: ledgerTxn } = await supabase
                    .from('transactions')
                    .insert({
                      ledger_id: ledger.id,
                      transaction_type: txnType,
                      reference_id: `import_${txnHash}`,
                      reference_type: 'bank_import',
                      description: txn.description,
                      amount: absAmount,
                      currency: body.currency || 'USD',
                      status: 'completed',
                      entry_method: 'imported',
                      metadata: { import_session_id: sessionId, bank_transaction_id: inserted.id, source: 'file_import' },
                    })
                    .select('id')
                    .single()

                  if (ledgerTxn) {
                    const debitAccount = isIncome ? cashAccount.id : counterAccount.id
                    const creditAccount = isIncome ? counterAccount.id : cashAccount.id
                    await supabase.from('entries').insert([
                      { transaction_id: ledgerTxn.id, account_id: debitAccount, entry_type: 'debit', amount: absAmount },
                      { transaction_id: ledgerTxn.id, account_id: creditAccount, entry_type: 'credit', amount: absAmount },
                    ])
                  }
                }
              } catch {
                // Non-fatal — bank transaction is still imported
              }
            }
          } catch (err: any) { errors.push(`Row ${i + 1}: ${err.message}`) }
        }

        // ── Balance verification ─────────────────────────────────
        let balanceVerified: boolean | null = null
        let computedClosing: number | null = null
        let balanceDiscrepancy: number | null = null

        if (typeof body.opening_balance === 'number' && typeof body.closing_balance === 'number') {
          const txnSum = body.transactions.reduce((sum, t) => sum + (t.amount || 0), 0)
          computedClosing = Math.round((body.opening_balance + txnSum) * 100) / 100
          balanceDiscrepancy = Math.round((computedClosing - body.closing_balance) * 100) / 100
          balanceVerified = Math.abs(balanceDiscrepancy) < 0.02 // ±$0.01 tolerance
        }

        // ── Auto-match imported transactions ─────────────────────
        let matched = 0
        const shouldAutoMatch = body.auto_match !== false // default true

        if (shouldAutoMatch && importedIds.length > 0) {
          for (const txnId of importedIds) {
            try {
              const { data: matchResult } = await supabase.rpc(
                'auto_match_bank_aggregator_transaction',
                { p_bank_aggregator_txn_id: txnId }
              )
              const result = typeof matchResult === 'object' ? matchResult : null
              if ((result as any)?.matched) matched++
            } catch {
              // Non-fatal — transaction stays unmatched
            }
          }
        }

        // ── Update import session ────────────────────────────────
        if (sessionId) {
          await supabase
            .from('import_sessions')
            .update({
              imported_count: imported,
              skipped_count: skipped,
              matched_count: matched,
              unmatched_count: imported - matched,
              computed_closing_balance: computedClosing,
              balance_verified: balanceVerified,
              balance_discrepancy: balanceDiscrepancy,
              status: errors.length > 0 && imported === 0 ? 'failed' : 'imported',
              error: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
              completed_at: new Date().toISOString(),
            } as any)
            .eq('id', sessionId)
        }

        // Audit log (fire-and-forget)
        void supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'import_transactions',
          entity_type: 'batch',
          actor_type: 'api',
          ip_address: getClientIp(req),
          request_body: { imported, skipped, matched, errors: errors.length, session_id: sessionId, balance_verified: balanceVerified },
        } as any)

        return jsonResponse({
          success: true,
          data: {
            session_id: sessionId,
            imported,
            skipped,
            matched,
            unmatched: imported - matched,
            errors: errors.slice(0, 10),
            balance: balanceVerified !== null ? {
              opening: body.opening_balance,
              closing_expected: body.closing_balance,
              closing_computed: computedClosing,
              discrepancy: balanceDiscrepancy,
              verified: balanceVerified,
            } : null,
          },
        }, 200, req)
      }

      case 'get_sessions': {
        const { data: sessions } = await supabase
          .from('import_sessions')
          .select('*')
          .eq('ledger_id', ledger.id)
          .order('created_at', { ascending: false })
          .limit(50)

        return jsonResponse({ success: true, data: sessions || [] }, 200, req)
      }

      case 'save_template': {
        if (!body.template) return errorResponse('No template provided', 400, req)
        const name = validateString(body.template.name, 200)
        if (!name) return errorResponse('Invalid template name', 400, req)

        const { data: template, error } = await supabase.from('import_templates').upsert({ ledger_id: ledger.id, name, bank_name: validateString(body.template.bank_name, 200) || 'Unknown', format: body.template.format || 'csv', mapping: body.template.mapping, skip_rows: body.template.skip_rows || 0, delimiter: body.template.delimiter || ',' }, { onConflict: 'ledger_id,name' }).select().single()

        if (error) return errorResponse('Failed to save template', 500, req)
        return jsonResponse({ success: true, data: template }, 200, req)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req)
    }
  }
)

Deno.serve(handler)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function detectFormat(content: string): 'csv' | 'ofx' | 'qfx' | 'unknown' {
  const trimmed = content.trim()
  if (trimmed.startsWith('OFXHEADER') || trimmed.includes('<OFX>')) return 'ofx'
  if (trimmed.includes(',') || trimmed.includes('\t')) return 'csv'
  return 'unknown'
}

function parseCSV(content: string, mapping?: ColumnMapping): { transactions: ParsedTransaction[]; headers: string[]; detectedTemplate: string | null } {
  const lines = content.split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 2) return { transactions: [], headers: [], detectedTemplate: null }

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headers = parseCSVLine(lines[0], delimiter)
  
  let detectedTemplate: string | null = null, effectiveMapping = mapping
  if (!effectiveMapping) {
    for (const [templateId, template] of Object.entries(BANK_TEMPLATES)) {
      if (matchesTemplate(headers, template)) { detectedTemplate = templateId; effectiveMapping = template.mapping; break }
    }
  }
  if (!effectiveMapping) { effectiveMapping = { date: 0, description: 1, amount: 2 }; detectedTemplate = 'generic' }

  const transactions: ParsedTransaction[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter)
    if (values.length < 2) continue
    try {
      const txn = extractTransaction(values, headers, effectiveMapping, i)
      if (txn && txn.date && !isNaN(txn.amount)) transactions.push(txn)
    } catch { /* skip */ }
  }
  return { transactions, headers, detectedTemplate }
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []; let current = '', inQuotes = false
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes
    else if (char === delimiter && !inQuotes) { result.push(current.trim()); current = '' }
    else current += char
  }
  result.push(current.trim())
  return result
}

function matchesTemplate(headers: string[], template: ImportTemplate): boolean {
  const headerLower = headers.map(h => h.toLowerCase())
  for (const key of ['date', 'description', 'amount']) {
    const mapValue = template.mapping[key as keyof ColumnMapping]
    if (typeof mapValue === 'string' && !headerLower.includes(mapValue.toLowerCase())) return false
  }
  return true
}

function extractTransaction(values: string[], headers: string[], mapping: ColumnMapping, rowIndex: number): ParsedTransaction | null {
  const getValue = (key: number | string | undefined): string => {
    if (key === undefined) return ''
    if (typeof key === 'number') return values[key] || ''
    const idx = headers.findIndex(h => h.toLowerCase() === key.toLowerCase())
    return idx >= 0 ? values[idx] || '' : ''
  }

  const dateStr = getValue(mapping.date), description = getValue(mapping.description)
  let status: string | undefined
  if (mapping.status !== undefined) status = getValue(mapping.status).toLowerCase().trim()
  if (status && ['pending', 'hold', 'authorization', 'processing'].some(s => status!.includes(s))) return null

  let amount: number
  if (mapping.debit !== undefined && mapping.credit !== undefined) {
    const debit = parseFloat(getValue(mapping.debit).replace(/[,$]/g, '')) || 0
    const credit = parseFloat(getValue(mapping.credit).replace(/[,$]/g, '')) || 0
    amount = credit - debit
  } else {
    amount = parseFloat(getValue(mapping.amount).replace(/[,$]/g, '')) || 0
  }

  const date = parseDate(dateStr, mapping.date_format)
  if (!date) return null

  return { date, description: description.trim(), amount, reference: getValue(mapping.reference) || undefined, balance: mapping.balance ? parseFloat(getValue(mapping.balance).replace(/[,$]/g, '')) : undefined, account_name: getValue(mapping.account_name) || undefined, status, row_index: rowIndex, raw_data: Object.fromEntries(headers.map((h, i) => [h, values[i]])) }
}

function parseDate(dateStr: string, format?: string): string | null {
  if (!dateStr) return null
  const cleaned = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.substring(0, 10)
  let match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) { const [, month, day, year] = match; return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` }
  const parsed = new Date(cleaned)
  return !isNaN(parsed.getTime()) ? parsed.toISOString().substring(0, 10) : null
}

function parseOFX(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [], stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let match, rowIndex = 0
  while ((match = stmtTrnRegex.exec(content)) !== null) {
    const block = match[1]
    const getTag = (tag: string): string => { const m = block.match(new RegExp(`<${tag}>([^<\\n]+)`, 'i')); return m ? m[1].trim() : '' }
    const dateStr = getTag('DTPOSTED'), amount = parseFloat(getTag('TRNAMT')) || 0, name = getTag('NAME') || getTag('MEMO'), fitid = getTag('FITID')
    if (getTag('TRNTYPE').toLowerCase() === 'hold' || name.toLowerCase().includes('pending')) { rowIndex++; continue }
    if (dateStr && name) {
      const date = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`
      transactions.push({ date, description: name, amount, reference: fitid || undefined, row_index: rowIndex++ })
    } else rowIndex++
  }
  return transactions
}

function extractMerchant(description: string): string | null {
  let cleaned = description.replace(/^(POS|ACH|DEBIT|CREDIT|PURCHASE|PAYMENT|TRANSFER)\s+/i, '').replace(/\s+\d{2}\/\d{2}.*$/, '').replace(/\s+#\d+.*$/, '').trim()
  return cleaned.split(/\s{2,}|\s*-\s*|\s*\|\s*/)[0] || null
}
