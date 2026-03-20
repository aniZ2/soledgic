import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { listCreatorConnectedAccountsForUser } from '@/lib/creator-connected-accounts-server'

const VALID_FORMATS = new Set(['pdf', 'csv'])

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatCurrencyCents(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export const GET = createApiHandler(
  async (request, { user }) => {
    // Extract route params from URL
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    // Path: /api/creator/statements/{year}/{month}/{format}
    const format = pathParts[pathParts.length - 1]
    const month = pathParts[pathParts.length - 2]
    const year = pathParts[pathParts.length - 3]

    // Validate format
    if (!format || !VALID_FORMATS.has(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Must be "pdf" or "csv".' },
        { status: 400 }
      )
    }

    // Validate year and month
    const yearNum = parseInt(year, 10)
    const monthNum = parseInt(month, 10)
    if (
      !Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100 ||
      !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12
    ) {
      return NextResponse.json(
        { error: 'Invalid year or month.' },
        { status: 400 }
      )
    }

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const connectedAccounts = await listCreatorConnectedAccountsForUser(user.id, user.email)

    if (connectedAccounts.length === 0) {
      return NextResponse.json(
        { error: 'No linked creator account found.' },
        { status: 404 }
      )
    }

    // Use the first connected account (consistent with the statements page)
    const account = connectedAccounts[0]

    const ledgerId = account.ledger_id
    const creatorEntityId = account.entity_id
    const { data: ledgerRow } = await supabase
      .from('ledgers')
      .select('business_name')
      .eq('id', ledgerId)
      .maybeSingle()
    const businessName = ledgerRow?.business_name || 'Platform'

    // Look up the creator's account record in the ledger
    const { data: creatorAccount } = await supabase
      .from('accounts')
      .select('id, name, entity_id')
      .eq('ledger_id', ledgerId)
      .eq('account_type', 'creator_balance')
      .eq('entity_id', creatorEntityId)
      .single()

    if (!creatorAccount) {
      return NextResponse.json(
        { error: 'Creator account not found in ledger.' },
        { status: 404 }
      )
    }

    // Build date range for the requested month
    const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`
    const endDate = new Date(yearNum, monthNum, 0).toISOString().split('T')[0]

    if (format === 'pdf') {
      return await handlePdfDownload({
        supabase,
        ledgerId,
        creatorEntityId,
        startDate,
        endDate,
        yearNum,
        monthNum,
      })
    }

    // CSV format
    return await handleCsvDownload({
      supabase,
      creatorAccountId: creatorAccount.id,
      creatorName: creatorAccount.name,
      businessName,
      startDate,
      endDate,
      yearNum,
      monthNum,
    })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/creator/statements',
  }
)

// ---------------------------------------------------------------------------
// PDF: call the generate-pdf edge function
// ---------------------------------------------------------------------------
async function handlePdfDownload(opts: {
  supabase: Awaited<ReturnType<typeof createClient>>
  ledgerId: string
  creatorEntityId: string
  startDate: string
  endDate: string
  yearNum: number
  monthNum: number
}): Promise<NextResponse> {
  const { ledgerId, creatorEntityId, startDate, endDate, yearNum, monthNum } = opts

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'PDF generation is not configured.' },
      { status: 503 }
    )
  }

  const pdfResponse = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      report_type: 'creator_statement',
      creator_id: creatorEntityId,
      start_date: startDate,
      end_date: endDate,
      ledger_id: ledgerId,
    }),
  })

  const pdfData = await pdfResponse.json()

  if (!pdfData.success || !pdfData.data) {
    console.error('PDF generation failed:', pdfData)
    return NextResponse.json(
      { error: 'Failed to generate statement PDF.' },
      { status: 502 }
    )
  }

  // pdfData.data is base64-encoded PDF
  const pdfBuffer = Buffer.from(pdfData.data, 'base64')
  const filename = `statement_${MONTH_NAMES[monthNum - 1]}_${yearNum}.pdf`

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
      'Cache-Control': 'private, no-cache',
    },
  })
}

// ---------------------------------------------------------------------------
// CSV: query transaction entries and return as CSV
// ---------------------------------------------------------------------------
async function handleCsvDownload(opts: {
  supabase: Awaited<ReturnType<typeof createClient>>
  creatorAccountId: string
  creatorName: string
  businessName: string
  startDate: string
  endDate: string
  yearNum: number
  monthNum: number
}): Promise<NextResponse> {
  const { supabase, creatorAccountId, creatorName, businessName, startDate, endDate, yearNum, monthNum } = opts

  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select(
      'id, entry_type, amount, created_at, transactions!inner(id, description, transaction_type, status, created_at)'
    )
    .eq('account_id', creatorAccountId)
    .not('transactions.status', 'in', '("voided","reversed")')
    .gte('transactions.created_at', startDate)
    .lte('transactions.created_at', endDate + 'T23:59:59')
    .order('created_at', { ascending: true })

  if (entriesError) {
    console.error('CSV query failed:', entriesError)
    return NextResponse.json(
      { error: 'Failed to fetch transaction data.' },
      { status: 500 }
    )
  }

  // Build CSV
  const rows: string[] = []
  rows.push('Date,Type,Description,Amount,Running Direction')

  let totalEarnings = 0
  let totalPayouts = 0

  for (const entry of entries || []) {
    const tx = (entry as Record<string, unknown>).transactions as {
      id: string
      description: string | null
      transaction_type: string
      status: string
      created_at: string
    }

    const amount = Number(entry.amount)
    const date = new Date(tx.created_at).toISOString().split('T')[0]
    const direction = entry.entry_type === 'credit' ? 'Credit' : 'Debit'
    const description = tx.description || tx.transaction_type || 'Transaction'

    if (entry.entry_type === 'credit') {
      totalEarnings += amount
    } else {
      totalPayouts += amount
    }

    rows.push(
      [
        escapeCsvField(date),
        escapeCsvField(tx.transaction_type),
        escapeCsvField(description),
        formatCurrencyCents(amount),
        direction,
      ].join(',')
    )
  }

  // Summary rows
  rows.push('')
  rows.push(`Total Earnings,,, ${formatCurrencyCents(totalEarnings)},`)
  rows.push(`Total Payouts,,, ${formatCurrencyCents(totalPayouts)},`)
  rows.push(`Net Balance,,, ${formatCurrencyCents(totalEarnings - totalPayouts)},`)
  rows.push('')
  rows.push(`Creator:, ${escapeCsvField(creatorName)}`)
  rows.push(`Platform:, ${escapeCsvField(businessName)}`)
  rows.push(`Period:, ${MONTH_NAMES[monthNum - 1]} ${yearNum}`)

  const csvContent = rows.join('\n')
  const filename = `statement_${MONTH_NAMES[monthNum - 1]}_${yearNum}.csv`

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(Buffer.byteLength(csvContent, 'utf-8')),
      'Cache-Control': 'private, no-cache',
    },
  })
}
