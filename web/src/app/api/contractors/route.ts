import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { manageContractors } from '@/lib/soledgic-api'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { ledger_id, name, email, business_name, tax_id_last_four, w9_received, payment_method, address, notes } = body

    // Get ledger and verify access
    const { data: ledger, error: ledgerError } = await supabase
      .from('ledgers')
      .select('id, api_key, organization_id')
      .eq('id', ledger_id)
      .single()

    if (ledgerError || !ledger) {
      return NextResponse.json({ error: 'Ledger not found' }, { status: 404 })
    }

    // Verify user has access
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

    // Create contractor via Edge Function
    const result = await manageContractors(ledger.api_key, {
      action: 'create',
      name,
      email,
      business_name,
      tax_id_last_four,
      w9_received,
      payment_method,
      address,
      notes,
    })

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Create contractor error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organizations
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')

    const orgIds = memberships?.map(m => m.organization_id) || []

    // Get ledgers
    const { data: ledgers } = await supabase
      .from('ledgers')
      .select('id')
      .in('organization_id', orgIds)

    const ledgerIds = ledgers?.map(l => l.id) || []

    // Get contractors
    const { data: contractors, error } = await supabase
      .from('contractors')
      .select(`
        *,
        ledger:ledgers(platform_name)
      `)
      .in('ledger_id', ledgerIds)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ contractors })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
