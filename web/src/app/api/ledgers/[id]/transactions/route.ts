import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTransactions } from '@/lib/soledgic-api'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ledgerId } = await params
    const { searchParams } = new URL(request.url)
    
    const type = searchParams.get('type') || undefined
    const start_date = searchParams.get('start_date') || undefined
    const end_date = searchParams.get('end_date') || undefined
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

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

    const result = await getTransactions(ledger.api_key, {
      type,
      start_date,
      end_date,
      limit,
      offset,
    })

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Get transactions error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
