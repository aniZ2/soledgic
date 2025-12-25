import { NextRequest, NextResponse } from 'next/server'

const SOLEDGIC_URL = 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'
const API_KEY = 'sk_test_booklyverse_f85dbf0624664cba987abf0d'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, year, month, quarter, notes } = body

    if (action === 'close') {
      const res = await fetch(`${SOLEDGIC_URL}/close-period`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ year, month, quarter, notes }),
      })

      const data = await res.json()
      
      // If successful, also generate frozen statements
      if (data.success && data.period_id) {
        try {
          await fetch(`${SOLEDGIC_URL}/frozen-statements`, {
            method: 'POST',
            headers: {
              'x-api-key': API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'generate', period_id: data.period_id }),
          })
        } catch (e) {
          console.error('Failed to generate frozen statements:', e)
        }
      }

      return NextResponse.json(data, { status: res.status })
    }

    if (action === 'list') {
      // List all periods
      const res = await fetch(`${SOLEDGIC_URL}/close-period`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list' }),
      })

      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }

    if (action === 'get_statements') {
      const { period_id, statement_type } = body
      
      const res = await fetch(`${SOLEDGIC_URL}/frozen-statements`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'get', period_id, statement_type }),
      })

      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Periods API error:', error)
    return NextResponse.json({ success: false, error: 'Failed to process request' }, { status: 500 })
  }
}
