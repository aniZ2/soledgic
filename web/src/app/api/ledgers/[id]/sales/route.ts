import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { recordSale } from '@/lib/soledgic-api'

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

    // Get ledger and verify access
    const { data: ledger, error: ledgerError } = await supabase
      .from('ledgers')
      .select('id, api_key, organization_id')
      .eq('id', ledgerId)
      .single()

    if (ledgerError || !ledger) {
      return NextResponse.json({ error: 'Ledger not found' }, { status: 404 })
    }

    // Verify user has access to this ledger's organization
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
    const { amount, creator_id, description, reference_id } = body

    // Generate idempotency key
    const idempotencyKey = `sale_${ledgerId}_${reference_id || Date.now()}`

    const result = await recordSale(ledger.api_key, {
      amount,
      creator_id,
      description,
      reference_id: reference_id || `sale_${Date.now()}`,
    }, idempotencyKey)

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Record sale error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
