import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { manageConnectedAccounts } from '@/lib/soledgic-api'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { ledger_id, action, ...params } = body

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

    // Call edge function
    const result = await manageConnectedAccounts(ledger.api_key, {
      action,
      ...params,
    })

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Connected accounts error:', error)
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

    // Get connected accounts
    const { data: accounts, error } = await supabase
      .from('connected_accounts')
      .select(`
        *,
        ledger:ledgers(platform_name)
      `)
      .in('ledger_id', ledgerIds)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ accounts })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
