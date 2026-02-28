import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createApiHandler } from '@/lib/api-handler'
import { callLedgerFunctionServer, jsonFromResponse, proxyResponse } from '@/lib/ledger-functions-server'

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return fallback
}

function getPayloadError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const maybeError = (payload as Record<string, unknown>).error
  return typeof maybeError === 'string' && maybeError.trim().length > 0 ? maybeError : fallback
}

export const GET = createApiHandler(
  async (request: Request, { user }) => {
    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get('type') // profit-loss, trial-balance, transactions, creators
    const format = searchParams.get('format') || 'csv' // csv or pdf
    const ledgerId = searchParams.get('ledger_id')
    const year = searchParams.get('year') || new Date().getFullYear().toString()
    const month = searchParams.get('month')

    if (!reportType || !ledgerId) {
      return NextResponse.json({ error: 'Missing type or ledger_id' }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify user has access to this ledger
    const { data: ledger } = await supabase
      .from('ledgers')
      .select('id, business_name, organization_id')
      .eq('id', ledgerId)
      .single()

    if (!ledger) {
      return NextResponse.json({ error: 'Ledger not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user!.id)
      .eq('organization_id', ledger.organization_id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Call edge function for export through internal proxy auth.
    const endpoint = format === 'pdf' ? 'generate-pdf' : 'export-report'

    try {
      const response = await callLedgerFunctionServer(endpoint, {
        ledgerId: ledger.id,
        method: 'POST',
        body: {
          report_type: reportType,
          year: parseInt(year),
          month: month ? parseInt(month) : undefined,
          format,
        },
      })

      if (!response.ok) {
        const error = await jsonFromResponse(response)
        return NextResponse.json(
          { error: getPayloadError(error, 'Export failed') },
          { status: response.status }
        )
      }

      const filename = `${reportType}-${year}${month ? '-' + month : ''}.${format}`

      const proxied = proxyResponse(
        response,
        format === 'pdf' ? 'application/pdf' : 'text/csv'
      )
      if (!proxied.headers.get('Content-Disposition')) {
        proxied.headers.set('Content-Disposition', `attachment; filename="${filename}"`)
      }
      return proxied
    } catch (error: unknown) {
      console.error('Export error:', error)
      return NextResponse.json({ error: getErrorMessage(error, 'Export failed') }, { status: 500 })
    }
  },
  {
    csrfProtection: false, // GET requests don't need CSRF
    routePath: '/api/reports/export',
  }
)
