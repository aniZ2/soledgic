import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createApiHandler } from '@/lib/api-handler'

export const GET = createApiHandler(
  async (request: Request) => {
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user has access to this ledger
    const { data: ledger } = await supabase
      .from('ledgers')
      .select('id, business_name, api_key, organization_id')
      .eq('id', ledgerId)
      .single()

    if (!ledger) {
      return NextResponse.json({ error: 'Ledger not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', ledger.organization_id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Call edge function for export
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const endpoint = format === 'pdf' ? 'generate-pdf' : 'export-report'

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ledger.api_key
        },
        body: JSON.stringify({
          report_type: reportType,
          year: parseInt(year),
          month: month ? parseInt(month) : undefined,
          format
        })
      })

      if (!response.ok) {
        const error = await response.json()
        return NextResponse.json({ error: error.error || 'Export failed' }, { status: response.status })
      }

      // Get content type based on format
      const contentType = format === 'pdf'
        ? 'application/pdf'
        : 'text/csv'

      const filename = `${reportType}-${year}${month ? '-' + month : ''}.${format}`

      // Return the file
      const data = await response.blob()
      return new NextResponse(data, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      })
    } catch (error: any) {
      console.error('Export error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  },
  { csrfProtection: false } // GET requests don't need CSRF
)
