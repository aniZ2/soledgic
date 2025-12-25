import { NextRequest, NextResponse } from 'next/server'

const SOLEDGIC_URL = 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'
const API_KEY = 'sk_test_booklyverse_f85dbf0624664cba987abf0d'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const response = await fetch(`${SOLEDGIC_URL}/get-balances`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Balances API error:', error)
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 })
  }
}
