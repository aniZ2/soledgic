// SERVICE_ID: SVC_FINANCIAL_FILE_PARSERS
// Soledgic: Universal financial file format parsers
// Supported: OFX/QFX, CAMT.053 (ISO 20022), BAI2, MT940 (SWIFT)
//
// All parsers normalize to ParsedTransaction[] — the same format used by
// import-transactions, so every format flows into the same reconciliation engine.

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface ParsedTransaction {
  date: string              // ISO: YYYY-MM-DD
  description: string
  amount: number            // Signed: negative = debit
  reference?: string        // Bank's unique transaction ID (FITID, EndToEndId, etc.)
  balance?: number          // Running balance (if available)
  account_name?: string
  currency?: string         // ISO 4217
  type?: string             // CREDIT, DEBIT, CHECK, XFER, etc.
  status?: string
  row_index?: number
  raw_data?: Record<string, unknown>
}

export interface ParseResult {
  format: string
  transactions: ParsedTransaction[]
  accounts: string[]        // Distinct account names found
  currency?: string         // Primary currency
  statement_date?: string   // Statement/balance date
  opening_balance?: number
  closing_balance?: number
}

export type FileFormat = 'csv' | 'ofx' | 'qfx' | 'camt053' | 'bai2' | 'mt940' | 'unknown'

// ============================================================================
// FORMAT DETECTION
// ============================================================================

export function detectFileFormat(content: string): FileFormat {
  const trimmed = content.trim()
  const first500 = trimmed.substring(0, 500)

  // OFX/QFX: SGML or XML header
  if (first500.startsWith('OFXHEADER') || first500.includes('<OFX>') || first500.includes('<OFX ')) return 'ofx'

  // CAMT.053: ISO 20022 XML with BkToCstmrStmt
  if (first500.includes('BkToCstmrStmt') || first500.includes('camt.053') || first500.includes('urn:iso:std:iso:20022:tech:xsd:camt.053')) return 'camt053'

  // MT940: SWIFT message starting with :20: or {1:
  if (/^(:\d{2}\w?:|\{1:F01)/.test(trimmed) || first500.includes(':60F:') || first500.includes(':61:')) return 'mt940'

  // BAI2: starts with 01, (file header) and contains 03, (account header)
  if (/^01,/.test(trimmed) && /\n03,/m.test(trimmed)) return 'bai2'

  // CSV fallback
  if (trimmed.includes(',') || trimmed.includes('\t')) return 'csv'

  return 'unknown'
}

// ============================================================================
// OFX/QFX PARSER (SGML + XML)
// ============================================================================

function getOFXTag(block: string, tag: string): string {
  // Handles both SGML (no closing tag) and XML (with closing tag)
  const re = new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : ''
}

function parseOFXDate(raw: string): string | null {
  if (!raw || raw.length < 8) return null
  // YYYYMMDDHHMMSS.SSS[offset:TZ] — only first 8 chars matter for date
  const y = raw.substring(0, 4)
  const m = raw.substring(4, 6)
  const d = raw.substring(6, 8)
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return null
  return `${y}-${m}-${d}`
}

export function parseOFX(content: string): ParseResult {
  const transactions: ParsedTransaction[] = []

  // Extract currency
  const curMatch = content.match(/<CURDEF>([A-Z]{3})/i)
  const currency = curMatch ? curMatch[1].toUpperCase() : 'USD'

  // Extract account info
  const acctIdMatch = content.match(/<ACCTID>([^<\n]+)/i)
  const acctTypeMatch = content.match(/<ACCTTYPE>([^<\n]+)/i)
  const accountName = acctIdMatch
    ? `${acctTypeMatch ? acctTypeMatch[1].trim() : 'Account'} ${acctIdMatch[1].trim().slice(-4)}`
    : undefined

  // Extract balances
  const ledgerBalMatch = content.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\n]+)/i)
  const availBalMatch = content.match(/<AVAILBAL>[\s\S]*?<BALAMT>([^<\n]+)/i)
  const closingBalance = ledgerBalMatch ? parseFloat(ledgerBalMatch[1].trim()) : undefined

  // Parse transactions — handle both <STMTTRN>...</STMTTRN> and SGML blocks
  const stmtTrnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST|<\/CCSTMTTRNRS|$))/gi
  let match
  let rowIndex = 0

  while ((match = stmtTrnRegex.exec(content)) !== null) {
    const block = match[1]
    const trnType = getOFXTag(block, 'TRNTYPE')
    const dateRaw = getOFXTag(block, 'DTPOSTED')
    const amountRaw = getOFXTag(block, 'TRNAMT')
    const name = getOFXTag(block, 'NAME') || getOFXTag(block, 'MEMO') || getOFXTag(block, 'PAYEE')
    const memo = getOFXTag(block, 'MEMO')
    const fitid = getOFXTag(block, 'FITID')
    const checkNum = getOFXTag(block, 'CHECKNUM')
    const refNum = getOFXTag(block, 'REFNUM')

    // Skip pending/hold transactions
    if (trnType.toUpperCase() === 'HOLD' || name.toLowerCase().includes('pending')) {
      rowIndex++
      continue
    }

    const date = parseOFXDate(dateRaw)
    const amount = parseFloat(amountRaw.replace(/,/g, ''))

    if (date && !isNaN(amount) && name) {
      const description = memo && memo !== name ? `${name} - ${memo}` : name

      transactions.push({
        date,
        description,
        amount,
        reference: fitid || refNum || checkNum || undefined,
        type: trnType || undefined,
        account_name: accountName,
        currency,
        row_index: rowIndex,
        raw_data: {
          trntype: trnType,
          fitid,
          checknum: checkNum || undefined,
          refnum: refNum || undefined,
          memo: memo || undefined,
        },
      })
    }
    rowIndex++
  }

  return {
    format: 'ofx',
    transactions,
    accounts: accountName ? [accountName] : [],
    currency,
    closing_balance: closingBalance,
  }
}

// ============================================================================
// CAMT.053 PARSER (ISO 20022 XML)
// ============================================================================

function getXMLText(block: string, tag: string): string {
  // Simple XML text extractor — handles namespaced and non-namespaced tags
  const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([^<]*)`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : ''
}

function getXMLBlock(content: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, 'gi')
  const blocks: string[] = []
  let m
  while ((m = re.exec(content)) !== null) blocks.push(m[1])
  return blocks
}

export function parseCAMT053(content: string): ParseResult {
  const transactions: ParsedTransaction[] = []
  let currency = 'USD'
  let openingBalance: number | undefined
  let closingBalance: number | undefined
  let statementDate: string | undefined
  const accountNames: string[] = []

  // Extract statement(s)
  const statements = getXMLBlock(content, 'Stmt')

  for (const stmt of statements) {
    // Account identification
    const acctId = getXMLText(stmt, 'IBAN') || getXMLText(stmt, 'Othr>.*?<Id') || getXMLText(stmt, 'Id')
    if (acctId && !accountNames.includes(acctId)) accountNames.push(acctId)

    // Currency from balance
    const curMatch = stmt.match(/<Ccy>([A-Z]{3})/i)
    if (curMatch) currency = curMatch[1]

    // Balances
    const balBlocks = getXMLBlock(stmt, 'Bal')
    for (const bal of balBlocks) {
      // Type code is nested: <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
      const typeMatch = bal.match(/<Tp>[\s\S]*?<Cd>([^<]*)/i)
      const type = typeMatch ? typeMatch[1].trim() : ''
      const amtMatch = bal.match(/<Amt[^>]*>([^<]*)/i)
      const amt = amtMatch ? parseFloat(amtMatch[1].trim()) : NaN
      const cdInd = getXMLText(bal, 'CdtDbtInd')
      if (!isNaN(amt)) {
        const signed = cdInd === 'DBIT' ? -amt : amt
        if (type === 'OPBD') openingBalance = signed
        if (type === 'CLBD') closingBalance = signed
      }
    }

    // Entries
    const entries = getXMLBlock(stmt, 'Ntry')
    let rowIndex = 0

    for (const entry of entries) {
      const amtRaw = getXMLText(entry, 'Amt')
      const amount = parseFloat(amtRaw)
      if (isNaN(amount)) { rowIndex++; continue }

      const cdInd = getXMLText(entry, 'CdtDbtInd')
      const signed = cdInd === 'DBIT' ? -amount : amount

      // Date: BookgDt or ValDt
      const bookDt = getXMLText(entry, 'BookgDt>.*?<Dt') || getXMLText(entry, 'Dt')
      const valDt = getXMLText(entry, 'ValDt>.*?<Dt')
      const date = parseCAMTDate(bookDt) || parseCAMTDate(valDt)
      if (!date) { rowIndex++; continue }

      // Description: Ustrd (unstructured) or AddtlNtryInf
      const ustrd = getXMLText(entry, 'Ustrd')
      const addtlInfo = getXMLText(entry, 'AddtlNtryInf')
      const description = ustrd || addtlInfo || 'Unknown'

      // Reference
      const endToEndId = getXMLText(entry, 'EndToEndId')
      const acctSvcrRef = getXMLText(entry, 'AcctSvcrRef')
      const reference = (endToEndId && endToEndId !== 'NOTPROVIDED') ? endToEndId : acctSvcrRef || undefined

      // Status
      const status = getXMLText(entry, 'Sts')
      if (status && status.toUpperCase() === 'PDNG') { rowIndex++; continue }

      transactions.push({
        date,
        description,
        amount: signed,
        reference,
        currency,
        type: cdInd === 'DBIT' ? 'DEBIT' : 'CREDIT',
        account_name: acctId || undefined,
        row_index: rowIndex,
        raw_data: {
          credit_debit: cdInd,
          status: status || undefined,
          end_to_end_id: endToEndId || undefined,
          acct_svcr_ref: acctSvcrRef || undefined,
        },
      })
      rowIndex++
    }

    if (!statementDate && entries.length > 0) {
      statementDate = transactions[transactions.length - 1]?.date
    }
  }

  return {
    format: 'camt053',
    transactions,
    accounts: accountNames,
    currency,
    statement_date: statementDate,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
  }
}

function parseCAMTDate(raw: string): string | null {
  if (!raw) return null
  // ISO date: 2026-03-15 or 2026-03-15T00:00:00
  const match = raw.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

// ============================================================================
// BAI2 PARSER (Cash Management)
// ============================================================================

export function parseBAI2(content: string): ParseResult {
  const transactions: ParsedTransaction[] = []
  const accountNames: string[] = []
  let currency = 'USD'
  let openingBalance: number | undefined
  let closingBalance: number | undefined

  const lines = content.split(/\r?\n/)
  let currentAccount = ''
  let rowIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = splitBAI2Line(line)
    const recordType = fields[0]

    switch (recordType) {
      case '03': {
        // Account header: 03,acct_number,currency,type_code,amount,...
        currentAccount = fields[1] || ''
        if (currentAccount && !accountNames.includes(currentAccount)) {
          accountNames.push(currentAccount)
        }
        if (fields[2]) currency = fields[2]
        // Fields 3+ are summary amounts. First pair is usually opening balance.
        if (fields.length >= 5) {
          const typeCode = fields[3]
          const amt = parseInt(fields[4], 10)
          if (!isNaN(amt) && (typeCode === '010' || typeCode === '015')) {
            openingBalance = amt / 100
          }
        }
        break
      }

      case '16': {
        // Transaction detail: 16,type_code,amount,fund_type,bank_ref,cust_ref,text
        const typeCode = fields[1] || ''
        const amountCents = parseInt(fields[2], 10)
        if (isNaN(amountCents)) break

        const amount = amountCents / 100
        // BAI2 type codes: 1xx = credit, 2xx/3xx = debit, 4xx = debit
        const isDebit = typeCode.startsWith('4') || typeCode.startsWith('5') ||
                        (parseInt(typeCode) >= 200 && parseInt(typeCode) < 400)
        const signed = isDebit ? -amount : amount

        const bankRef = fields[4] || ''
        const custRef = fields[5] || ''
        const text = fields.slice(6).join(',').replace(/\/$/, '').trim()

        // Date from group header (record type 02)
        const date = findBAI2Date(lines, i)

        if (date) {
          transactions.push({
            date,
            description: text || `BAI2 ${typeCode}`,
            amount: signed,
            reference: custRef || bankRef || undefined,
            type: isDebit ? 'DEBIT' : 'CREDIT',
            account_name: currentAccount || undefined,
            currency,
            row_index: rowIndex,
            raw_data: {
              type_code: typeCode,
              bank_ref: bankRef || undefined,
              customer_ref: custRef || undefined,
            },
          })
        }
        rowIndex++
        break
      }

      case '49': {
        // Account trailer: 49,account_control_total,number_of_records
        const controlTotal = parseInt(fields[1], 10)
        if (!isNaN(controlTotal)) closingBalance = controlTotal / 100
        break
      }
    }
  }

  return {
    format: 'bai2',
    transactions,
    accounts: accountNames,
    currency,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
  }
}

function splitBAI2Line(line: string): string[] {
  // BAI2 uses comma-separated fields, with / as continuation marker
  return line.replace(/\/$/, '').split(',').map(f => f.trim())
}

function findBAI2Date(lines: string[], currentIdx: number): string | null {
  // Walk backwards to find group header (02,) which contains the date
  // BAI2 group header: 02,originator_id,destination_id,group_status,as_of_date,as_of_time,...
  for (let i = currentIdx; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('02,')) {
      const fields = splitBAI2Line(line)
      // Find the first 6-digit field that looks like YYMMDD
      for (let f = 3; f < fields.length && f < 8; f++) {
        const val = fields[f]
        if (/^\d{6}$/.test(val)) {
          const yy = parseInt(val.substring(0, 2))
          const year = yy > 50 ? 1900 + yy : 2000 + yy
          return `${year}-${val.substring(2, 4)}-${val.substring(4, 6)}`
        }
      }
      break
    }
  }
  return null
}

// ============================================================================
// MT940 PARSER (SWIFT)
// ============================================================================

export function parseMT940(content: string): ParseResult {
  const transactions: ParsedTransaction[] = []
  const accountNames: string[] = []
  let currency = 'USD'
  let openingBalance: number | undefined
  let closingBalance: number | undefined
  let statementDate: string | undefined

  // Split into individual statements (separated by -} or $$)
  const statements = content.split(/(?:\-\}|\$\$)/).filter(s => s.trim())

  for (const stmt of statements) {
    // Account: :25: field
    const acctMatch = stmt.match(/:25:([^\n\r]+)/)
    if (acctMatch) {
      const acct = acctMatch[1].trim()
      if (!accountNames.includes(acct)) accountNames.push(acct)
    }

    // Opening balance: :60F: or :60M:
    const openMatch = stmt.match(/:60[FM]:([CD])(\d{6})([A-Z]{3})([\d,]+)/)
    if (openMatch) {
      const [, cdInd, , cur, amtStr] = openMatch
      currency = cur
      const amt = parseFloat(amtStr.replace(',', '.'))
      openingBalance = cdInd === 'D' ? -amt : amt
    }

    // Closing balance: :62F: or :62M:
    const closeMatch = stmt.match(/:62[FM]:([CD])(\d{6})([A-Z]{3})([\d,]+)/)
    if (closeMatch) {
      const [, cdInd, dateStr, , amtStr] = closeMatch
      const amt = parseFloat(amtStr.replace(',', '.'))
      closingBalance = cdInd === 'D' ? -amt : amt
      statementDate = parseMT940Date(dateStr) || undefined
    }

    // Transactions: :61: lines followed by :86: information
    const lines = stmt.split(/\r?\n/)
    let rowIndex = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line.startsWith(':61:')) continue

      const txnLine = line.substring(4)
      const parsed = parseMT940Transaction(txnLine)
      if (!parsed) { rowIndex++; continue }

      // Look for :86: supplementary info on next line(s)
      let description = ''
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim()
        if (nextLine.startsWith(':86:')) {
          description = nextLine.substring(4)
          // Continuation lines (don't start with :XX:)
          for (let k = j + 1; k < lines.length; k++) {
            const cont = lines[k].trim()
            if (/^:\d{2}\w?:/.test(cont) || cont === '-}' || !cont) break
            description += ' ' + cont
          }
          break
        }
        if (/^:\d{2}\w?:/.test(nextLine)) break
      }

      transactions.push({
        date: parsed.date,
        description: description || parsed.description || 'MT940 transaction',
        amount: parsed.amount,
        reference: parsed.reference || undefined,
        type: parsed.amount >= 0 ? 'CREDIT' : 'DEBIT',
        account_name: acctMatch ? acctMatch[1].trim() : undefined,
        currency,
        row_index: rowIndex,
        raw_data: {
          swift_code: parsed.swiftCode || undefined,
          entry_date: parsed.entryDate || undefined,
        },
      })
      rowIndex++
    }
  }

  return {
    format: 'mt940',
    transactions,
    accounts: accountNames,
    currency,
    statement_date: statementDate,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
  }
}

function parseMT940Transaction(line: string): {
  date: string; amount: number; description: string; reference?: string;
  swiftCode?: string; entryDate?: string
} | null {
  // :61: format: YYMMDD[MMDD]CD[amount]S[swift_code][reference]
  // Example: 260315C500,00NTRFCLIENT001//BANKREF
  // Amount uses comma as decimal separator: 500,00 or 1234,56
  const match = line.match(
    /^(\d{6})(\d{4})?([CD]R?)([\d]+(?:,\d+)?)([A-Z][A-Z0-9]{3})([^\n\/]*)(?:\/\/(.*))?/
  )
  if (!match) return null

  const [, dateStr, entryDateStr, cdInd, amtStr, swiftCode, ref, bankRef] = match
  const date = parseMT940Date(dateStr)
  if (!date) return null

  const amount = parseFloat(amtStr.replace(',', '.'))
  if (isNaN(amount)) return null

  const signed = cdInd.startsWith('D') ? -amount : amount

  return {
    date,
    amount: signed,
    description: ref?.trim() || '',
    reference: ref?.trim() || bankRef?.trim() || undefined,
    swiftCode,
    entryDate: entryDateStr ? (parseMT940Date(dateStr.substring(0, 2) + entryDateStr) || undefined) : undefined,
  }
}

function parseMT940Date(raw: string): string | null {
  if (!raw || raw.length < 6) return null
  const yy = parseInt(raw.substring(0, 2))
  const year = yy > 50 ? 1900 + yy : 2000 + yy
  const mm = raw.substring(2, 4)
  const dd = raw.substring(4, 6)
  if (!/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd)) return null
  return `${year}-${mm}-${dd}`
}

// ============================================================================
// MERCHANT NORMALIZATION
// ============================================================================

const MERCHANT_ALIASES: Record<string, string> = {
  'amzn': 'AMAZON', 'amazon': 'AMAZON', 'amzn mktp': 'AMAZON',
  'wal-mart': 'WALMART', 'walmart': 'WALMART', 'wm supercenter': 'WALMART',
  'target': 'TARGET', 'tgt': 'TARGET',
  'starbucks': 'STARBUCKS', 'starbuck': 'STARBUCKS',
  'uber': 'UBER', 'uber trip': 'UBER', 'uber eats': 'UBER EATS',
  'lyft': 'LYFT',
  'paypal': 'PAYPAL', 'pp*': 'PAYPAL',
  'venmo': 'VENMO',
  'stripe': 'STRIPE', 'stripe transfer': 'STRIPE',
  'square': 'SQUARE', 'sq *': 'SQUARE',
  'google': 'GOOGLE', 'google *': 'GOOGLE',
  'apple': 'APPLE', 'apple.com': 'APPLE',
}

/**
 * Normalize a bank transaction description to a canonical merchant name.
 * Strips POS/ACH prefixes, dates, reference numbers, and resolves known aliases.
 */
export function normalizeMerchant(description: string): string {
  let cleaned = description
    .toUpperCase()
    .replace(/^(POS|ACH|DEBIT|CREDIT|PURCHASE|PAYMENT|TRANSFER|CHECKCARD|VISA|MC|MASTERCARD)\s+/i, '')
    .replace(/\s+\d{2}\/\d{2}.*$/, '')  // trailing dates (before punctuation strip)
    .replace(/\s+#\d+.*$/, '')            // trailing reference numbers
    .replace(/\s+X{2,}\d{4}.*$/, '')      // trailing card masks
    .replace(/[^A-Z0-9\s*\-]/g, ' ')  // remove punctuation except * and -
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Check aliases (longest prefix match)
  const lower = cleaned.toLowerCase()
  for (const [alias, canonical] of Object.entries(MERCHANT_ALIASES)) {
    if (lower.startsWith(alias)) return canonical
  }

  // Take first meaningful segment
  const segment = cleaned.split(/\s{2,}|\s*-\s*|\s*\|\s*/)[0]
  return segment || cleaned
}

// ============================================================================
// UNIVERSAL PARSE ENTRY POINT
// ============================================================================

export function parseFinancialFile(content: string, formatHint?: FileFormat): ParseResult {
  const format = formatHint && formatHint !== 'unknown' ? formatHint : detectFileFormat(content)

  switch (format) {
    case 'ofx':
    case 'qfx':
      return parseOFX(content)
    case 'camt053':
      return parseCAMT053(content)
    case 'bai2':
      return parseBAI2(content)
    case 'mt940':
      return parseMT940(content)
    default:
      return { format: 'unknown', transactions: [], accounts: [] }
  }
}
