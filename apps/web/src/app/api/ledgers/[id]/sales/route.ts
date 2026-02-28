import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { callLedgerFunctionServer, jsonFromResponse } from '@/lib/ledger-functions-server'

type SaleBody = {
  amount: number
  creator_id: string
  description?: string
  reference_id: string
}

type JsonRecord = Record<string, unknown>

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return fallback
}

function getPayloadError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const maybeError = (payload as JsonRecord).error
  return typeof maybeError === 'string' && maybeError.trim().length > 0 ? maybeError : fallback
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ledgerId } = await params

  const handler = createApiHandler(
    async (request, { user, requestId }) => {
      const supabase = await createClient()

      const { data: body, error: parseError } = await parseJsonBody<SaleBody>(request)
      if (parseError || !body) {
        return NextResponse.json(
          { error: parseError || 'Invalid request body', request_id: requestId },
          { status: 400 }
        )
      }

      const { amount, creator_id, description, reference_id } = body
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { error: 'amount must be a positive number (cents)', request_id: requestId },
          { status: 400 }
        )
      }
      if (!creator_id || typeof creator_id !== 'string') {
        return NextResponse.json(
          { error: 'creator_id is required', request_id: requestId },
          { status: 400 }
        )
      }
      if (!reference_id || typeof reference_id !== 'string') {
        return NextResponse.json(
          { error: 'reference_id is required', request_id: requestId },
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

      if (membership.role === 'viewer') {
        return NextResponse.json(
          { error: 'Insufficient permissions', request_id: requestId },
          { status: 403 }
        )
      }

      let response: Response
      try {
        response = await callLedgerFunctionServer('record-sale', {
          ledgerId: ledger.id,
          method: 'POST',
          body: {
            amount,
            creator_id,
            description,
            reference_id,
          },
        })
      } catch (error: unknown) {
        return NextResponse.json(
          { error: getErrorMessage(error, 'Failed to reach ledger function'), request_id: requestId },
          { status: 500 }
        )
      }

      const result = await jsonFromResponse(response)

      if (!response.ok) {
        return NextResponse.json(
          { error: getPayloadError(result, 'Failed to record sale'), request_id: requestId },
          { status: response.status }
        )
      }

      return NextResponse.json(result)
    },
    {
      requireAuth: true,
      rateLimit: true,
      csrfProtection: true,
      routePath: '/api/ledgers/[id]/sales',
    }
  )

  return handler(request)
}
