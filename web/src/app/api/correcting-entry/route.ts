import { NextRequest, NextResponse } from 'next/server'

const SOLEDGIC_URL = 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'
const API_KEY = 'sk_test_booklyverse_f85dbf0624664cba987abf0d'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, original_transaction_id, description, effective_date, amount } = body

    if (action === 'create') {
      // First, get the original transaction details
      const reportRes = await fetch(`${SOLEDGIC_URL}/generate-report`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          report_type: 'transaction_history',
          start_date: '2020-01-01',
          end_date: '2030-12-31'
        }),
      })
      
      const reportData = await reportRes.json()
      const originalTx = reportData.report?.transactions?.find((t: any) => t.id === original_transaction_id)
      
      if (!originalTx) {
        return NextResponse.json({ error: 'Original transaction not found' }, { status: 404 })
      }

      // Determine the type of correcting entry based on original transaction type
      let correctionEndpoint = ''
      let correctionBody: any = {}

      switch (originalTx.transaction_type) {
        case 'sale':
        case 'income':
          // Reverse income by recording expense
          correctionEndpoint = 'record-expense'
          correctionBody = {
            reference_id: `correction_${original_transaction_id}_${Date.now()}`,
            amount: amount || originalTx.amount * 100,
            description: description || `Correction for: ${originalTx.description}`,
            category: 'adjustment',
            metadata: {
              corrects_transaction_id: original_transaction_id,
              correction_type: 'income_reversal',
              original_date: originalTx.created_at,
              effective_date
            }
          }
          break

        case 'expense':
          // Reverse expense by recording income
          correctionEndpoint = 'record-income'
          correctionBody = {
            reference_id: `correction_${original_transaction_id}_${Date.now()}`,
            amount: amount || originalTx.amount * 100,
            description: description || `Correction for: ${originalTx.description}`,
            category: 'adjustment',
            metadata: {
              corrects_transaction_id: original_transaction_id,
              correction_type: 'expense_reversal',
              original_date: originalTx.created_at,
              effective_date
            }
          }
          break

        case 'payout':
          // Reverse payout
          correctionEndpoint = 'record-income'
          correctionBody = {
            reference_id: `correction_${original_transaction_id}_${Date.now()}`,
            amount: amount || originalTx.amount * 100,
            description: description || `Payout correction: ${originalTx.description}`,
            category: 'payout_reversal',
            metadata: {
              corrects_transaction_id: original_transaction_id,
              correction_type: 'payout_reversal',
              creator_id: originalTx.metadata?.creator_id,
              original_date: originalTx.created_at,
              effective_date
            }
          }
          break

        default:
          // Generic reversal via expense
          correctionEndpoint = 'record-expense'
          correctionBody = {
            reference_id: `correction_${original_transaction_id}_${Date.now()}`,
            amount: amount || originalTx.amount * 100,
            description: description || `Correction for: ${originalTx.description}`,
            category: 'adjustment',
            metadata: {
              corrects_transaction_id: original_transaction_id,
              original_type: originalTx.transaction_type,
              original_date: originalTx.created_at,
              effective_date
            }
          }
      }

      // Create the correcting entry
      const correctionRes = await fetch(`${SOLEDGIC_URL}/${correctionEndpoint}`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(correctionBody),
      })

      const correctionData = await correctionRes.json()

      if (!correctionRes.ok) {
        return NextResponse.json({ 
          error: correctionData.error || 'Failed to create correcting entry',
          details: correctionData
        }, { status: correctionRes.status })
      }

      return NextResponse.json({
        success: true,
        message: 'Correcting entry created successfully',
        correcting_transaction_id: correctionData.transaction_id,
        original_transaction_id,
        correction_type: correctionBody.metadata.correction_type,
        amount: (amount || originalTx.amount * 100) / 100,
        effective_date
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Correcting entry API error:', error)
    return NextResponse.json({ error: 'Failed to create correcting entry' }, { status: 500 })
  }
}
