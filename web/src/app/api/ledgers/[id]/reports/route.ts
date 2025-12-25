import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTrialBalance, getProfitLoss, getRunway, exportReport } from '@/lib/soledgic-api'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ledgerId } = await params
    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get('type') || 'trial-balance'
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get ledger
    const { data: ledger, error: ledgerError } = await supabase
      .from('ledgers')
      .select('id, api_key, organization_id')
      .eq('id', ledgerId)
      .single()

    if (ledgerError || !ledger) {
      return NextResponse.json({ error: 'Ledger not found' }, { status: 404 })
    }

    // Verify access
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', ledger.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    let result
    switch (reportType) {
      case 'trial-balance':
        result = await getTrialBalance(ledger.api_key)
        break
      case 'profit-loss':
        result = await getProfitLoss(ledger.api_key, { year, breakdown: 'monthly' })
        break
      case 'runway':
        result = await getRunway(ledger.api_key)
        break
      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Get report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ledgerId } = await params
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get ledger
    const { data: ledger, error: ledgerError } = await supabase
      .from('ledgers')
      .select('id, api_key, organization_id')
      .eq('id', ledgerId)
      .single()

    if (ledgerError || !ledger) {
      return NextResponse.json({ error: 'Ledger not found' }, { status: 404 })
    }

    // Verify access
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', ledger.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const result = await exportReport(ledger.api_key, body)

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Export report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
