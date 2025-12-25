import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { reconcile } from '@/lib/soledgic-api'

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

    const { data: ledger } = await supabase
      .from('ledgers')
      .select('api_key')
      .eq('id', ledgerId)
      .single()

    if (!ledger) {
      return NextResponse.json({ error: 'Ledger not found' }, { status: 404 })
    }

    const body = await request.json()

    const result = await reconcile(ledger.api_key, body)

    return NextResponse.json(result)

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
