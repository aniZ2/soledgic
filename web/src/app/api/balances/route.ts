import { NextRequest, NextResponse } from 'next/server'

const SOLEDGIC_URL = process.env.SOLEDGIC_API_URL || 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'
const API_KEY = process.env.SOLEDGIC_API_KEY

if (!API_KEY) {
  console.error('SECURITY: SOLEDGIC_API_KEY environment variable is required')
}

export async function POST(request: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

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
