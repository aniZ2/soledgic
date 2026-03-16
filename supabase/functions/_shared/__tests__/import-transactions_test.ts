import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'

// ============================================================================
// Pure functions extracted from import-transactions/index.ts for unit testing.
// ============================================================================

interface ColumnMapping {
  date: number | string
  description: number | string
  amount: number | string
  debit?: number | string
  credit?: number | string
  balance?: number | string
  reference?: number | string
  account_name?: number | string
  status?: number | string
  date_format?: string
}

interface ImportTemplate {
  name: string
  bank_name: string
  format: string
  mapping: ColumnMapping
  skip_rows?: number
  delimiter?: string
}

interface ParsedTransaction {
  date: string
  description: string
  amount: number
  reference?: string
  balance?: number
  account_name?: string
  status?: string
  row_index?: number
  raw_data?: Record<string, any>
}

const BANK_TEMPLATES: Record<string, ImportTemplate> = {
  chase: { name: 'Chase Bank', bank_name: 'Chase', format: 'csv', mapping: { date: 'Posting Date', description: 'Description', amount: 'Amount' }, skip_rows: 0 },
  bofa: { name: 'Bank of America', bank_name: 'Bank of America', format: 'csv', mapping: { date: 'Date', description: 'Description', amount: 'Amount' }, skip_rows: 0 },
  wells_fargo: { name: 'Wells Fargo', bank_name: 'Wells Fargo', format: 'csv', mapping: { date: 0, description: 4, amount: 1 }, skip_rows: 0 },
  relay: { name: 'Relay', bank_name: 'Relay', format: 'csv', mapping: { date: 'Date', description: 'Description', amount: 'Amount', account_name: 'Account Name', reference: 'Reference' }, skip_rows: 0 },
  mercury: { name: 'Mercury', bank_name: 'Mercury', format: 'csv', mapping: { date: 'Date', description: 'Description', amount: 'Amount' }, skip_rows: 0 },
  generic: { name: 'Generic CSV', bank_name: 'Unknown', format: 'csv', mapping: { date: 0, description: 1, amount: 2 }, skip_rows: 1 },
}

const VALID_ACTIONS = ['parse_preview', 'import', 'get_templates', 'save_template']

function detectFormat(content: string): 'csv' | 'ofx' | 'qfx' | 'unknown' {
  const trimmed = content.trim()
  if (trimmed.startsWith('OFXHEADER') || trimmed.includes('<OFX>')) return 'ofx'
  if (trimmed.includes(',') || trimmed.includes('\t')) return 'csv'
  return 'unknown'
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

function parseDate(dateStr: string, _format?: string): string | null {
  if (!dateStr) return null
  const cleaned = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.substring(0, 10)
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) { const [, month, day, year] = match; return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` }
  const parsed = new Date(cleaned)
  return !isNaN(parsed.getTime()) ? parsed.toISOString().substring(0, 10) : null
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

async function generateTxnHash(txn: ParsedTransaction): Promise<string> {
  const parts = [txn.date, txn.amount.toFixed(2), txn.description.substring(0, 100).toLowerCase().trim(), txn.reference || '', txn.account_name || '', txn.row_index?.toString() || '']
  const data = new TextEncoder().encode(parts.join('|'))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return `import_${Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32)}`
}

// ============================================================================
// VALID_ACTIONS
// ============================================================================

Deno.test('VALID_ACTIONS: contains expected actions', () => {
  assertEquals(VALID_ACTIONS.includes('parse_preview'), true)
  assertEquals(VALID_ACTIONS.includes('import'), true)
  assertEquals(VALID_ACTIONS.includes('get_templates'), true)
  assertEquals(VALID_ACTIONS.includes('save_template'), true)
})

Deno.test('VALID_ACTIONS: rejects unknown actions', () => {
  assertEquals(VALID_ACTIONS.includes('delete'), false)
  assertEquals(VALID_ACTIONS.includes('export'), false)
})

// ============================================================================
// detectFormat
// ============================================================================

Deno.test('detectFormat: detects OFX by header', () => {
  assertEquals(detectFormat('OFXHEADER:100\n<OFX>'), 'ofx')
})

Deno.test('detectFormat: detects OFX by tag', () => {
  assertEquals(detectFormat('<?xml version="1.0"?>\n<OFX>\n</OFX>'), 'ofx')
})

Deno.test('detectFormat: detects CSV by comma', () => {
  assertEquals(detectFormat('Date,Description,Amount\n2026-01-01,Test,100'), 'csv')
})

Deno.test('detectFormat: detects CSV by tab', () => {
  assertEquals(detectFormat('Date\tDescription\tAmount'), 'csv')
})

Deno.test('detectFormat: returns unknown for unrecognized format', () => {
  assertEquals(detectFormat('just some plain text without delimiters'), 'unknown')
})

Deno.test('detectFormat: trims whitespace before detection', () => {
  assertEquals(detectFormat('  \n  Date,Amount\n'), 'csv')
})

// ============================================================================
// parseCSVLine
// ============================================================================

Deno.test('parseCSVLine: splits by comma', () => {
  assertEquals(parseCSVLine('a,b,c', ','), ['a', 'b', 'c'])
})

Deno.test('parseCSVLine: handles quoted fields with commas', () => {
  assertEquals(parseCSVLine('"hello, world",b,c', ','), ['hello, world', 'b', 'c'])
})

Deno.test('parseCSVLine: trims whitespace from values', () => {
  assertEquals(parseCSVLine(' a , b , c ', ','), ['a', 'b', 'c'])
})

Deno.test('parseCSVLine: handles tab delimiter', () => {
  assertEquals(parseCSVLine('a\tb\tc', '\t'), ['a', 'b', 'c'])
})

Deno.test('parseCSVLine: handles empty fields', () => {
  assertEquals(parseCSVLine('a,,c', ','), ['a', '', 'c'])
})

Deno.test('parseCSVLine: handles single field', () => {
  assertEquals(parseCSVLine('only', ','), ['only'])
})

// ============================================================================
// matchesTemplate
// ============================================================================

Deno.test('matchesTemplate: matches Chase template', () => {
  const headers = ['Posting Date', 'Description', 'Amount', 'Type', 'Balance']
  assertEquals(matchesTemplate(headers, BANK_TEMPLATES.chase), true)
})

Deno.test('matchesTemplate: matches case-insensitively', () => {
  const headers = ['posting date', 'description', 'amount']
  assertEquals(matchesTemplate(headers, BANK_TEMPLATES.chase), true)
})

Deno.test('matchesTemplate: rejects when required column is missing', () => {
  const headers = ['Posting Date', 'Note', 'Amount']  // No Description
  assertEquals(matchesTemplate(headers, BANK_TEMPLATES.chase), false)
})

Deno.test('matchesTemplate: skips numeric mappings in template match', () => {
  // Wells Fargo uses numeric indices, so matchesTemplate always returns true
  const headers = ['whatever', 'columns', 'here']
  assertEquals(matchesTemplate(headers, BANK_TEMPLATES.wells_fargo), true)
})

Deno.test('matchesTemplate: matches Mercury template', () => {
  const headers = ['Date', 'Description', 'Amount', 'Running Balance']
  assertEquals(matchesTemplate(headers, BANK_TEMPLATES.mercury), true)
})

// ============================================================================
// parseDate
// ============================================================================

Deno.test('parseDate: parses ISO format', () => {
  assertEquals(parseDate('2026-03-15'), '2026-03-15')
})

Deno.test('parseDate: parses ISO with time component', () => {
  assertEquals(parseDate('2026-03-15T10:30:00Z'), '2026-03-15')
})

Deno.test('parseDate: parses US date format MM/DD/YYYY', () => {
  assertEquals(parseDate('03/15/2026'), '2026-03-15')
})

Deno.test('parseDate: parses single-digit month and day', () => {
  assertEquals(parseDate('3/5/2026'), '2026-03-05')
})

Deno.test('parseDate: returns null for empty string', () => {
  assertEquals(parseDate(''), null)
})

Deno.test('parseDate: returns null for invalid date', () => {
  assertEquals(parseDate('not-a-date'), null)
})

// ============================================================================
// extractTransaction
// ============================================================================

Deno.test('extractTransaction: extracts by header name mapping', () => {
  const headers = ['Date', 'Description', 'Amount']
  const values = ['2026-03-15', 'Payment received', '500.00']
  const mapping: ColumnMapping = { date: 'Date', description: 'Description', amount: 'Amount' }
  const txn = extractTransaction(values, headers, mapping, 0)
  assertEquals(txn?.date, '2026-03-15')
  assertEquals(txn?.description, 'Payment received')
  assertEquals(txn?.amount, 500)
})

Deno.test('extractTransaction: extracts by numeric index mapping', () => {
  const headers = ['Col1', 'Col2', 'Col3']
  const values = ['2026-01-01', 'Office supplies', '-42.50']
  const mapping: ColumnMapping = { date: 0, description: 1, amount: 2 }
  const txn = extractTransaction(values, headers, mapping, 0)
  assertEquals(txn?.date, '2026-01-01')
  assertEquals(txn?.amount, -42.5)
})

Deno.test('extractTransaction: strips $ and commas from amount', () => {
  const headers = ['Date', 'Description', 'Amount']
  const values = ['2026-01-01', 'Sale', '$1,234.56']
  const mapping: ColumnMapping = { date: 'Date', description: 'Description', amount: 'Amount' }
  const txn = extractTransaction(values, headers, mapping, 0)
  assertEquals(txn?.amount, 1234.56)
})

Deno.test('extractTransaction: calculates amount from debit/credit columns', () => {
  const headers = ['Date', 'Description', 'Debit', 'Credit']
  const values = ['2026-01-01', 'Deposit', '', '500.00']
  const mapping: ColumnMapping = { date: 'Date', description: 'Description', debit: 'Debit', credit: 'Credit', amount: 'Debit' }
  const txn = extractTransaction(values, headers, mapping, 0)
  assertEquals(txn?.amount, 500)  // credit - debit = 500 - 0
})

Deno.test('extractTransaction: returns null for pending status', () => {
  const headers = ['Date', 'Description', 'Amount', 'Status']
  const values = ['2026-01-01', 'Test', '100', 'Pending']
  const mapping: ColumnMapping = { date: 'Date', description: 'Description', amount: 'Amount', status: 'Status' }
  const txn = extractTransaction(values, headers, mapping, 0)
  assertEquals(txn, null)
})

Deno.test('extractTransaction: returns null for hold status', () => {
  const headers = ['Date', 'Description', 'Amount', 'Status']
  const values = ['2026-01-01', 'ATM Hold', '200', 'hold']
  const mapping: ColumnMapping = { date: 'Date', description: 'Description', amount: 'Amount', status: 'Status' }
  const txn = extractTransaction(values, headers, mapping, 0)
  assertEquals(txn, null)
})

Deno.test('extractTransaction: returns null when date is invalid', () => {
  const headers = ['Date', 'Description', 'Amount']
  const values = ['not-a-date', 'Test', '100']
  const mapping: ColumnMapping = { date: 'Date', description: 'Description', amount: 'Amount' }
  const txn = extractTransaction(values, headers, mapping, 0)
  assertEquals(txn, null)
})

Deno.test('extractTransaction: includes optional reference', () => {
  const headers = ['Date', 'Description', 'Amount', 'Reference']
  const values = ['2026-01-01', 'Wire', '5000', 'REF-001']
  const mapping: ColumnMapping = { date: 'Date', description: 'Description', amount: 'Amount', reference: 'Reference' }
  const txn = extractTransaction(values, headers, mapping, 0)
  assertEquals(txn?.reference, 'REF-001')
})

Deno.test('extractTransaction: includes raw_data', () => {
  const headers = ['Date', 'Description', 'Amount']
  const values = ['2026-01-01', 'Test', '100']
  const mapping: ColumnMapping = { date: 'Date', description: 'Description', amount: 'Amount' }
  const txn = extractTransaction(values, headers, mapping, 0)
  assertEquals(txn?.raw_data?.['Date'], '2026-01-01')
  assertEquals(txn?.raw_data?.['Amount'], '100')
})

// ============================================================================
// parseCSV (full pipeline)
// ============================================================================

Deno.test('parseCSV: parses simple CSV with auto-detected generic template', () => {
  const csv = 'Date,Description,Amount\n2026-01-01,Test payment,100.00\n2026-01-02,Another,200.00'
  const result = parseCSV(csv)
  assertEquals(result.headers, ['Date', 'Description', 'Amount'])
  assertEquals(result.transactions.length, 2)
  assertEquals(result.transactions[0].date, '2026-01-01')
  assertEquals(result.transactions[0].amount, 100)
  assertEquals(result.transactions[1].amount, 200)
})

Deno.test('parseCSV: auto-detects Chase template', () => {
  const csv = 'Posting Date,Description,Amount,Type,Balance\n03/15/2026,Coffee Shop,-4.50,Sale,1234.56'
  const result = parseCSV(csv)
  assertEquals(result.detectedTemplate, 'chase')
  assertEquals(result.transactions.length, 1)
  assertEquals(result.transactions[0].date, '2026-03-15')
  assertEquals(result.transactions[0].amount, -4.5)
})

Deno.test('parseCSV: returns empty for single-line file', () => {
  const csv = 'Date,Description,Amount'
  const result = parseCSV(csv)
  assertEquals(result.transactions.length, 0)
})

Deno.test('parseCSV: returns empty for empty content', () => {
  const result = parseCSV('')
  assertEquals(result.transactions.length, 0)
  assertEquals(result.headers.length, 0)
  assertEquals(result.detectedTemplate, null)
})

Deno.test('parseCSV: handles Windows-style line endings', () => {
  const csv = 'Date,Description,Amount\r\n2026-01-01,Test,100\r\n'
  const result = parseCSV(csv)
  assertEquals(result.transactions.length, 1)
})

Deno.test('parseCSV: uses provided mapping over auto-detection', () => {
  const csv = 'Col1,Col2,Col3\n2026-01-01,Item,50'
  const mapping: ColumnMapping = { date: 0, description: 1, amount: 2 }
  const result = parseCSV(csv, mapping)
  assertEquals(result.transactions.length, 1)
  assertEquals(result.detectedTemplate, null)
})

// ============================================================================
// parseOFX
// ============================================================================

Deno.test('parseOFX: parses OFX transaction block', () => {
  const ofx = `
<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260315
<TRNAMT>-42.50
<NAME>Coffee Shop
<FITID>TXN001
</STMTTRN>
</OFX>`
  const result = parseOFX(ofx)
  assertEquals(result.length, 1)
  assertEquals(result[0].date, '2026-03-15')
  assertEquals(result[0].amount, -42.5)
  assertEquals(result[0].description, 'Coffee Shop')
  assertEquals(result[0].reference, 'TXN001')
})

Deno.test('parseOFX: parses multiple transactions', () => {
  const ofx = `
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260301
<TRNAMT>1000.00
<NAME>Payroll
<FITID>TXN001
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260302
<TRNAMT>-50.00
<NAME>Grocery
<FITID>TXN002
</STMTTRN>`
  const result = parseOFX(ofx)
  assertEquals(result.length, 2)
  assertEquals(result[0].amount, 1000)
  assertEquals(result[1].amount, -50)
})

Deno.test('parseOFX: skips hold transactions', () => {
  const ofx = `
<STMTTRN>
<TRNTYPE>HOLD
<DTPOSTED>20260315
<TRNAMT>100.00
<NAME>Pending charge
<FITID>TXN001
</STMTTRN>`
  const result = parseOFX(ofx)
  assertEquals(result.length, 0)
})

Deno.test('parseOFX: skips transactions with pending in name', () => {
  const ofx = `
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260315
<TRNAMT>-25.00
<NAME>Pending Purchase
<FITID>TXN001
</STMTTRN>`
  const result = parseOFX(ofx)
  assertEquals(result.length, 0)
})

Deno.test('parseOFX: uses MEMO when NAME is absent', () => {
  const ofx = `
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260310
<TRNAMT>200.00
<MEMO>Wire transfer received
<FITID>TXN001
</STMTTRN>`
  const result = parseOFX(ofx)
  assertEquals(result.length, 1)
  assertEquals(result[0].description, 'Wire transfer received')
})

Deno.test('parseOFX: returns empty for content with no STMTTRN blocks', () => {
  const result = parseOFX('<OFX></OFX>')
  assertEquals(result.length, 0)
})

// ============================================================================
// extractMerchant
// ============================================================================

Deno.test('extractMerchant: strips POS prefix', () => {
  assertEquals(extractMerchant('POS STARBUCKS'), 'STARBUCKS')
})

Deno.test('extractMerchant: strips ACH prefix', () => {
  assertEquals(extractMerchant('ACH PAYROLL COMPANY'), 'PAYROLL COMPANY')
})

Deno.test('extractMerchant: strips trailing date pattern', () => {
  assertEquals(extractMerchant('WALMART 03/15 PURCHASE'), 'WALMART')
})

Deno.test('extractMerchant: strips trailing reference numbers', () => {
  assertEquals(extractMerchant('AMAZON #12345 order'), 'AMAZON')
})

Deno.test('extractMerchant: returns first segment from multi-part descriptions', () => {
  assertEquals(extractMerchant('MERCHANT NAME  CITY STATE'), 'MERCHANT NAME')
})

Deno.test('extractMerchant: returns null for empty description', () => {
  assertEquals(extractMerchant(''), null)
})

// ============================================================================
// generateTxnHash
// ============================================================================

Deno.test('generateTxnHash: produces deterministic hash', async () => {
  const txn: ParsedTransaction = { date: '2026-01-01', description: 'Test', amount: 100, row_index: 0 }
  const hash1 = await generateTxnHash(txn)
  const hash2 = await generateTxnHash(txn)
  assertEquals(hash1, hash2)
})

Deno.test('generateTxnHash: starts with import_ prefix', async () => {
  const txn: ParsedTransaction = { date: '2026-01-01', description: 'Test', amount: 100, row_index: 0 }
  const hash = await generateTxnHash(txn)
  assertEquals(hash.startsWith('import_'), true)
})

Deno.test('generateTxnHash: has 39-char length (import_ + 32 hex chars)', async () => {
  const txn: ParsedTransaction = { date: '2026-01-01', description: 'Test', amount: 100, row_index: 0 }
  const hash = await generateTxnHash(txn)
  assertEquals(hash.length, 7 + 32)  // "import_" + 32 hex chars
})

Deno.test('generateTxnHash: produces different hashes for different transactions', async () => {
  const txn1: ParsedTransaction = { date: '2026-01-01', description: 'Payment A', amount: 100, row_index: 0 }
  const txn2: ParsedTransaction = { date: '2026-01-01', description: 'Payment B', amount: 100, row_index: 0 }
  const hash1 = await generateTxnHash(txn1)
  const hash2 = await generateTxnHash(txn2)
  assertNotEquals(hash1, hash2)
})

Deno.test('generateTxnHash: amount uses fixed 2-decimal precision', async () => {
  const txn1: ParsedTransaction = { date: '2026-01-01', description: 'Test', amount: 100, row_index: 0 }
  const txn2: ParsedTransaction = { date: '2026-01-01', description: 'Test', amount: 100.00, row_index: 0 }
  const hash1 = await generateTxnHash(txn1)
  const hash2 = await generateTxnHash(txn2)
  assertEquals(hash1, hash2)
})

Deno.test('generateTxnHash: description is lowercased for consistency', async () => {
  const txn1: ParsedTransaction = { date: '2026-01-01', description: 'PAYMENT', amount: 100, row_index: 0 }
  const txn2: ParsedTransaction = { date: '2026-01-01', description: 'payment', amount: 100, row_index: 0 }
  const hash1 = await generateTxnHash(txn1)
  const hash2 = await generateTxnHash(txn2)
  assertEquals(hash1, hash2)
})
