import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { recordExpense } from '@/lib/soledge-api'

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
    const { amount, category_code, merchant_name, business_purpose, expense_date, reference_id } = body

    // Generate idempotency key
    const idempotencyKey = `expense_${ledgerId}_${reference_id || Date.now()}`

    const result = await recordExpense(ledger.api_key, {
      amount,
      category_code,
      merchant_name,
      business_purpose,
      expense_date,
      reference_id: reference_id || `exp_${Date.now()}`,
    }, idempotencyKey)

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Record expense error:', error)
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

    // Get expenses directly from database for listing
    const { data: expenses, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('ledger_id', ledgerId)
      .eq('transaction_type', 'expense')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ expenses })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
