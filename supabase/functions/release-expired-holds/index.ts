// SERVICE_ID: SVC_HOLD_RELEASE_CRON
//
// Auto-releases payout holds whose delay period has elapsed.
// Called by cron (e.g. every hour). Auth: x-cron-secret header.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CRON_SECRET = Deno.env.get('CRON_SECRET')

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

Deno.serve(async (req) => {
  // Auth: x-cron-secret header
  const secret = req.headers.get('x-cron-secret') || ''
  if (!CRON_SECRET || !timingSafeEqual(secret, CRON_SECRET)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: result, error } = await supabase.rpc('release_expired_holds')

  if (error) {
    console.error('[release-expired-holds] RPC error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const releasedCount = result?.released_count ?? 0
  if (releasedCount > 0) {
    console.log(`[release-expired-holds] Released ${releasedCount} expired holds`)
  }

  return new Response(JSON.stringify({ success: true, released_count: releasedCount }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
