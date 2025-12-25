import { NextRequest, NextResponse } from 'next/server'

const SOLEDGIC_URL = 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'
const API_KEY = 'sk_test_booklyverse_f85dbf0624664cba987abf0d'

// Generic proxy to Soledgic endpoints
async function soledgicCall(endpoint: string, body: any) {
  const response = await fetch(`${SOLEDGIC_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return response.json()
}

export async function POST(request: NextRequest) {
  try {
    const { action, ...params } = await request.json()

    switch (action) {
      case 'record_sale':
        return NextResponse.json(await soledgicCall('record-sale', params))

      case 'record_income':
        return NextResponse.json(await soledgicCall('record-income', params))

      case 'record_expense':
        return NextResponse.json(await soledgicCall('record-expense', params))

      case 'process_payout':
        return NextResponse.json(await soledgicCall('process-payout', params))

      case 'get_transactions':
        return NextResponse.json(await soledgicCall('generate-report', {
          report_type: 'transaction_history',
          ...params
        }))

      case 'get_creator_balance':
        return NextResponse.json(await soledgicCall('get-balances', {
          action: 'single_creator',
          creator_id: params.creator_id
        }))

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Transaction API error:', error)
    return NextResponse.json({ error: 'Failed to process transaction' }, { status: 500 })
  }
}
