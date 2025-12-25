import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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
    const { amount, category_code, merchant_name, business_purpose, expense_date } = body

    // Call the Soledge API
    const response = await fetch(`${SUPABASE_URL}/functions/v1/record-expense`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'x-api-key': ledger.api_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        category_code,
        merchant_name,
        business_purpose,
        expense_date,
        reference_id: `exp_${Date.now()}`,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error || 'Failed to record expense' },
        { status: response.status }
      )
    }

    return NextResponse.json(result)

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
