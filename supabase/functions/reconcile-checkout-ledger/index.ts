// Soledgic Edge Function: Reconcile Checkout Ledger
// POST /reconcile-checkout-ledger
// Retries record_sale_atomic for sessions stuck in 'charged_pending_ledger'.
// Designed to run on a schedule (e.g. every 5 minutes via cron).

import {
  createHandler,
  jsonResponse,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ReconcileRequest {
  limit?: number   // Max sessions to process per invocation (default 20)
  dry_run?: boolean
}

const handler = createHandler(
  { endpoint: 'reconcile-checkout-ledger', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, _ledger: LedgerContext | null, body: ReconcileRequest, { requestId }) => {
    const limit = Math.min(body.limit ?? 20, 100)
    const dryRun = body.dry_run === true

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
      return errorResponse('Failed to fetch pending sessions', 500, req, requestId)
    }

    if (!sessions || sessions.length === 0) {
      return jsonResponse({ success: true, processed: 0, reconciled: 0, failed: 0 }, 200, req, requestId)
    }

    if (dryRun) {
      return jsonResponse({
        success: true,
        dry_run: true,
        pending_count: sessions.length,
        session_ids: sessions.map(s => s.id),
      }, 200, req, requestId)
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

        // Mark as completed
        const now = new Date().toISOString()
        await supabase
          .from('checkout_sessions')
          .update({
            status: 'completed',
            completed_at: now,
            updated_at: now,
          })
          .eq('id', session.id)
          .eq('status', 'charged_pending_ledger') // Guard against concurrent runs

        // Queue the webhook now that the ledger entry exists
        supabase
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
          .then(({ error }) => {
            if (error) console.error(`[${requestId}] Failed to queue webhook for ${session.id}:`, error)
          })
          .catch(() => {})

        reconciled++
      } catch (err: unknown) {
        failed++
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[${requestId}] Failed to reconcile session ${session.id}:`, msg)
        errors.push({ session_id: session.id, error: msg })
      }
    }

    return jsonResponse({
      success: true,
      processed: sessions.length,
      reconciled,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
