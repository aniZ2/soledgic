import { NextRequest, NextResponse } from 'next/server'

const SOLEDGIC_URL = process.env.SOLEDGIC_API_URL || 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'
const API_KEY = process.env.SOLEDGIC_API_KEY

if (!API_KEY) {
  console.error('SECURITY: SOLEDGIC_API_KEY environment variable is required')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const res = await fetch(`${SOLEDGIC_URL}/reconcile`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Reconcile API error:', error)
    return NextResponse.json({ success: false, error: 'Failed to process request' }, { status: 500 })
  }
}
