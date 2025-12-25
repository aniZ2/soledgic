import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const LEDGER_ID = '0a885204-e07a-48c1-97e9-495ac96a2581' // Booklyverse

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, limit = 50, offset = 0, filters } = body

    if (action === 'list') {
      // Get audit log entries
      let query = supabase
        .from('audit_log')
        .select('*')
        .eq('ledger_id', LEDGER_ID)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (filters?.entity_type) {
        query = query.eq('entity_type', filters.entity_type)
      }
      if (filters?.action_type) {
        query = query.eq('action', filters.action_type)
      }

      const { data, error } = await query

      if (error) {
        console.error('Audit query error:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }

      return NextResponse.json({ 
        success: true, 
        data: data || [],
        count: data?.length || 0
      })
    }

    if (action === 'summary') {
      // Get audit summary stats
      const today = new Date().toISOString().split('T')[0]
      
      const [totalRes, todayRes, accountsRes] = await Promise.all([
        supabase.from('audit_log').select('id', { count: 'exact', head: true }).eq('ledger_id', LEDGER_ID),
        supabase.from('audit_log').select('id', { count: 'exact', head: true }).eq('ledger_id', LEDGER_ID).gte('created_at', today),
        supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('ledger_id', LEDGER_ID),
      ])

      return NextResponse.json({
        success: true,
        data: {
          total_entries: totalRes.count || 0,
          today_entries: todayRes.count || 0,
          total_accounts: accountsRes.count || 0,
        }
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Audit API error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
