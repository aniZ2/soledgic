import { NextRequest, NextResponse } from 'next/server'

const SOLEDGIC_URL = process.env.SOLEDGIC_API_URL || 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'
const API_KEY = process.env.SOLEDGIC_API_KEY

if (!API_KEY) {
  console.error('SECURITY: SOLEDGIC_API_KEY environment variable is required')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'list') {
      // Get all creator balances
      const response = await fetch(`${SOLEDGIC_URL}/get-balances`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'creator_balances' }),
      })
      const data = await response.json()
      
      if (data.success) {
        // Transform to directory format
        const creators = (data.data || []).map((c: any) => ({
          id: c.creator_id,
          type: 'creator',
          name: c.name,
          handle: `@${c.creator_id}`,
          balance: c.available_balance,
          ledgerBalance: c.ledger_balance,
          heldAmount: c.held_amount,
          tier: c.tier,
          status: c.ledger_balance > 0 ? 'active' : 'inactive',
          lastActivity: new Date().toISOString().split('T')[0],
        }))
        return NextResponse.json({ success: true, data: creators })
      }
      return NextResponse.json(data)
    }

    if (action === 'get_earnings') {
      // Get creator earnings report
      const response = await fetch(`${SOLEDGIC_URL}/generate-report`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          report_type: 'creator_earnings',
          start_date: body.start_date || '2025-01-01',
          end_date: body.end_date || new Date().toISOString().split('T')[0]
        }),
      })
      return NextResponse.json(await response.json())
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Creators API error:', error)
    return NextResponse.json({ error: 'Failed to fetch creators' }, { status: 500 })
  }
}
