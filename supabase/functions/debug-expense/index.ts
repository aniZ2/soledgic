// Debug version of record-expense to capture actual errors
import { getCorsHeaders, getSupabaseClient, validateApiKey } from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const apiKey = req.headers.get('x-api-key')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      })
    }

    const supabase = getSupabaseClient()

    // Test 1: Validate API key
    let ledger
    try {
      ledger = await validateApiKey(supabase, apiKey)
      if (!ledger) {
        return new Response(JSON.stringify({
          step: 'validateApiKey',
          error: 'Invalid API key - no ledger returned'
        }), {
          status: 401,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
        })
      }
    } catch (e: any) {
      return new Response(JSON.stringify({
        step: 'validateApiKey',
        error: e.message,
        stack: e.stack
      }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      })
    }

    // Test 2: Parse body
    let body
    try {
      body = await req.json()
    } catch (e: any) {
      return new Response(JSON.stringify({
        step: 'parseBody',
        error: e.message
      }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      })
    }

    // Test 3: Query accounts
    try {
      const { data: accounts, error: accError } = await supabase
        .from('accounts')
        .select('id, account_type')
        .eq('ledger_id', ledger.id)
        .limit(5)

      if (accError) {
        return new Response(JSON.stringify({
          step: 'queryAccounts',
          error: accError.message,
          code: accError.code
        }), {
          status: 500,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({
        success: true,
        ledger_id: ledger.id,
        ledger_mode: ledger.ledger_mode,
        accounts_found: accounts?.length || 0,
        body_received: body
      }), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      })

    } catch (e: any) {
      return new Response(JSON.stringify({
        step: 'queryAccounts',
        error: e.message,
        stack: e.stack
      }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      })
    }

  } catch (e: any) {
    return new Response(JSON.stringify({
      step: 'outer',
      error: e.message,
      stack: e.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
