// Soledgic Edge Function: Reconcile Checkout Ledger
// POST /reconcile-checkout-ledger
// Retries record_sale_atomic for sessions stuck in 'charged_pending_ledger'.
// Designed to run on a schedule (e.g. every 5 minutes via cron).
//
// Security:
// - Requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// - Does NOT use createHandler (no ledger-key auth — this is a global job)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, timingSafeEqual } from '../_shared/utils.ts'

interface ReconcileRequest {
  limit?: number   // Max sessions to process per invocation (default 20)
  dry_run?: boolean
}

function isAuthorized(authHeader: string | null, serviceRoleKey: string): boolean {
  if (!authHeader) return false
  const trimmed = authHeader.trim()
  if (!trimmed.toLowerCase().startsWith('bearer ')) return false
  const token = trimmed.slice('bearer '.length).trim()
  return timingSafeEqual(token, serviceRoleKey)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) })
  }

  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'content-type': 'application/json' },
    })
  }

  if (!isAuthorized(req.headers.get('authorization'), serviceRoleKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'content-type': 'application/json' },
    })
  }

  let body: ReconcileRequest = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine — defaults apply
  }

  const limit = Math.min(body.limit ?? 20, 100)
  const dryRun = body.dry_run === true
  const requestId = crypto.randomUUID()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { persistSession: false } }
  )

  // Find sessions stuck in charged_pending_ledger (charge succeeded, ledger write failed).
  // Only retry sessions less than 24 hours old; older ones need manual review.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: sessions, error: fetchError } = await supabase
    .from('checkout_sessions')
    .select('id, ledger_id, creator_id, amount, creator_amount, platform_amount, product_id, product_name, metadata, payment_id, reference_id')
    .eq('status', 'charged_pending_ledger')
    .gte('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(limit)

  if (fetchError) {
    console.error(`[${requestId}] Failed to fetch pending sessions:`, fetchError)
    return new Response(JSON.stringify({ error: 'Failed to fetch pending sessions' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'content-type': 'application/json' },
    })
  }

  if (!sessions || sessions.length === 0) {
    return new Response(JSON.stringify({ success: true, processed: 0, reconciled: 0, failed: 0 }), {
      status: 200,
      headers: { ...getCorsHeaders(req), 'content-type': 'application/json' },
    })
  }

  if (dryRun) {
    return new Response(JSON.stringify({
      success: true,
      dry_run: true,
      pending_count: sessions.length,
      session_ids: sessions.map(s => s.id),
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req), 'content-type': 'application/json' },
    })
  }

  let reconciled = 0
  let failed = 0
  const errors: Array<{ session_id: string; error: string }> = []

  for (const session of sessions) {
    const referenceId = session.reference_id || `checkout_${session.id}`

    try {
      const { error: rpcError } = await supabase.rpc('record_sale_atomic', {
        p_ledger_id: session.ledger_id,
        p_reference_id: referenceId,
        p_creator_id: session.creator_id,
        p_gross_amount: session.amount,
        p_creator_amount: session.creator_amount,
        p_platform_amount: session.platform_amount,
        p_processing_fee: 0,
        p_product_id: session.product_id || null,
        p_product_name: session.product_name || null,
        p_metadata: session.metadata || {},
      })

      if (rpcError) {
        // Duplicate reference_id means sale was actually already recorded
        if (rpcError.message?.includes('duplicate') || rpcError.code === '23505') {
          console.log(`[${requestId}] Session ${session.id}: sale already recorded (duplicate reference), marking completed`)
        } else {
          throw rpcError
        }
      }

      // Atomically claim: only transition if still charged_pending_ledger.
      // If a concurrent run already moved it, this returns 0 rows and we skip the webhook.
      const now = new Date().toISOString()
      const { data: claimed } = await supabase
        .from('checkout_sessions')
        .update({
          status: 'completed',
          completed_at: now,
          updated_at: now,
        })
        .eq('id', session.id)
        .eq('status', 'charged_pending_ledger')
        .select('id')
        .maybeSingle()

      if (!claimed) {
        // Another run already reconciled this session — skip webhook
        console.log(`[${requestId}] Session ${session.id}: already reconciled by another run, skipping webhook`)
        reconciled++
        continue
      }

      // Queue the webhook only after successful atomic claim
      const { error: webhookError } = await supabase
        .rpc('queue_webhook', {
          p_ledger_id: session.ledger_id,
          p_event_type: 'checkout.completed',
          p_payload: {
            event: 'checkout.completed',
            data: {
              session_id: session.id,
              payment_id: session.payment_id,
              reference_id: referenceId,
              amount: session.amount / 100,
              creator_id: session.creator_id,
              product_id: session.product_id,
              reconciled: true,
              reconciled_at: now,
            },
          },
        })

      if (webhookError) {
        console.error(`[${requestId}] Failed to queue webhook for ${session.id}:`, webhookError)
      }

      reconciled++
    } catch (err: unknown) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[${requestId}] Failed to reconcile session ${session.id}:`, msg)
      errors.push({ session_id: session.id, error: msg })
    }
  }

  return new Response(JSON.stringify({
    success: true,
    processed: sessions.length,
    reconciled,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  }), {
    status: 200,
    headers: { ...getCorsHeaders(req), 'content-type': 'application/json' },
  })
})
