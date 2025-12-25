import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ledgerId } = await params
    const { searchParams } = new URL(request.url)
    const accountType = searchParams.get('type')

    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let query = supabase
      .from('accounts')
      .select('id, account_type, entity_id, balance, is_active')
      .eq('ledger_id', ledgerId)

    if (accountType) {
      query = query.eq('account_type', accountType)
    }

    const { data: balances, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ balances })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
