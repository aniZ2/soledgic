// Server-side soledgic API client
// Use this directly in Server Components - no need for API route proxies

import { createClient } from '@/lib/supabase/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface CallOptions {
  apiKey: string
  idempotencyKey?: string
}

async function callEdgeFunction<T>(
  functionName: string,
  options: CallOptions,
  body?: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST'
): Promise<T> {
  const url = new URL(`${SUPABASE_URL}/functions/v1/${functionName}`)
  
  if (method === 'GET' && body) {
    Object.entries(body).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    })
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'x-api-key': options.apiKey,
    'Content-Type': 'application/json',
  }

  if (options.idempotencyKey) {
    headers['x-idempotency-key'] = options.idempotencyKey
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: method === 'POST' && body ? JSON.stringify(body) : undefined,
    cache: 'no-store', // Always fresh data for financial info
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`)
  }

  return data
}

// ============================================================================
// Server-side helpers that verify access and call Edge Functions
// ============================================================================

export async function getLedgerWithAccess(ledgerId: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: ledger, error } = await supabase
    .from('ledgers')
    .select('*, organization:organizations(name)')
    .eq('id', ledgerId)
    .single()

  if (error || !ledger) throw new Error('Ledger not found')

  // Verify membership
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', ledger.organization_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership) throw new Error('Access denied')

  return { ledger, user, role: membership.role }
}

export async function getTrialBalance(ledgerId: string) {
  const { ledger } = await getLedgerWithAccess(ledgerId)
  return callEdgeFunction('trial-balance', { apiKey: ledger.api_key }, undefined, 'GET')
}

export async function getProfitLoss(ledgerId: string, year: number) {
  const { ledger } = await getLedgerWithAccess(ledgerId)
  return callEdgeFunction('profit-loss', { apiKey: ledger.api_key }, { year, breakdown: 'monthly' }, 'GET')
}

export async function getRunway(ledgerId: string) {
  const { ledger } = await getLedgerWithAccess(ledgerId)
  return callEdgeFunction('get-runway', { apiKey: ledger.api_key }, undefined, 'GET')
}

export async function getTransactions(ledgerId: string, params?: {
  type?: string
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
}) {
  const { ledger } = await getLedgerWithAccess(ledgerId)
  return callEdgeFunction('get-transactions', { apiKey: ledger.api_key }, params, 'GET')
}

export async function getBalance(ledgerId: string, params?: {
  account_id?: string
  entity_id?: string
}) {
  const { ledger } = await getLedgerWithAccess(ledgerId)
  return callEdgeFunction('get-balance', { apiKey: ledger.api_key }, params, 'GET')
}

// ============================================================================
// Write operations (still need API routes for client components)
// ============================================================================

export async function recordSale(ledgerId: string, data: {
  amount: number
  creator_id?: string
  reference_id: string
  description?: string
}) {
  const { ledger } = await getLedgerWithAccess(ledgerId)
  const idempotencyKey = `sale_${ledgerId}_${data.reference_id}`
  return callEdgeFunction('record-sale', { apiKey: ledger.api_key, idempotencyKey }, data)
}

export async function recordExpense(ledgerId: string, data: {
  amount: number
  category_code: string
  merchant_name: string
  business_purpose: string
  expense_date?: string
  reference_id: string
}) {
  const { ledger } = await getLedgerWithAccess(ledgerId)
  const idempotencyKey = `expense_${ledgerId}_${data.reference_id}`
  return callEdgeFunction('record-expense', { apiKey: ledger.api_key, idempotencyKey }, data)
}

export async function processPayout(ledgerId: string, data: {
  creator_id: string
  amount?: number
  method: string
  reference_id: string
}) {
  const { ledger } = await getLedgerWithAccess(ledgerId)
  const idempotencyKey = `payout_${ledgerId}_${data.creator_id}_${Date.now()}`
  return callEdgeFunction('process-payout', { apiKey: ledger.api_key, idempotencyKey }, data)
}

export async function exportReport(ledgerId: string, data: {
  report_type: string
  format: string
  year?: number
}) {
  const { ledger } = await getLedgerWithAccess(ledgerId)
  return callEdgeFunction('export-report', { apiKey: ledger.api_key }, data)
}
