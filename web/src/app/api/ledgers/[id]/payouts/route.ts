import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { processPayout } from '@/lib/soledgic-api'

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
    const { creator_id, amount, method, reference_id, notes } = body

    const idempotencyKey = `payout_${ledgerId}_${creator_id}_${Date.now()}`

    const result = await processPayout(ledger.api_key, {
      creator_id,
      amount,
      method,
      reference_id,
      notes,
    }, idempotencyKey)

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Process payout error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(
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

    const { data: payouts, error } = await supabase
      .from('payouts')
      .select(`
        *,
        account:accounts(entity_id)
      `)
      .eq('ledger_id', ledgerId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payouts })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
