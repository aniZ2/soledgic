import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ledgerId } = await params
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')
    const status = searchParams.get('status')

    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let query = supabase
      .from('bank_statement_lines')
      .select('*')
      .eq('ledger_id', ledgerId)
      .order('date', { ascending: false })

    if (accountId) {
      query = query.eq('bank_account_id', accountId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: lines, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ lines })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
