import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { callLedgerFunctionServer, jsonFromResponse } from '@/lib/ledger-functions-server'

type ExpenseBody = {
  amount: number
  category_code?: string
  merchant_name?: string
  business_purpose?: string
  expense_date?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ledgerId } = await params

  const handler = createApiHandler(
    async (request, { user, requestId }) => {
      const supabase = await createClient()

      const { data: body, error: parseError } = await parseJsonBody<ExpenseBody>(request)
      if (parseError || !body) {
        return NextResponse.json(
          { error: parseError || 'Invalid request body', request_id: requestId },
          { status: 400 }
        )
      }

      const { amount, category_code, merchant_name, business_purpose, expense_date } = body
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { error: 'amount must be a positive number (cents)', request_id: requestId },
          { status: 400 }
        )
      }

      // Get ledger and verify access
      const { data: ledger, error: ledgerError } = await supabase
        .from('ledgers')
        .select('id, organization_id')
        .eq('id', ledgerId)
        .single()

      if (ledgerError || !ledger) {
        return NextResponse.json(
          { error: 'Ledger not found', request_id: requestId },
          { status: 404 }
        )
      }

      // Verify user has access to this ledger's organization
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', ledger.organization_id)
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .single()

      if (!membership) {
        return NextResponse.json(
          { error: 'Access denied', request_id: requestId },
          { status: 403 }
        )
      }

      let response: Response
      try {
        response = await callLedgerFunctionServer('record-expense', {
          ledgerId: ledger.id,
          method: 'POST',
          body: {
            amount,
            category_code,
            merchant_name,
            business_purpose,
            expense_date,
            reference_id: `exp_${Date.now()}`,
          },
        })
      } catch (error: any) {
        return NextResponse.json(
          { error: error?.message || 'Failed to reach ledger function', request_id: requestId },
          { status: 500 }
        )
      }

      const result = await jsonFromResponse(response)

      if (!response.ok) {
        return NextResponse.json(
          { error: (result as any)?.error || 'Failed to record expense', request_id: requestId },
          { status: response.status }
        )
      }

      return NextResponse.json(result)
    },
    {
      requireAuth: true,
      rateLimit: true,
      csrfProtection: true,
      routePath: '/api/ledgers/[id]/expenses',
    }
  )

  return handler(request)
}
