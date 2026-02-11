import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  const { orgName, ledgerName, ledgerMode } = body

  if (!orgName || !ledgerName || !ledgerMode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const effectivePlan = 'pro'
  const planData = { ledgers: 1, team_members: 1 }
  const trialEndsAt = new Date()

  const { data, error: rpcError } = await supabase.rpc('create_organization_with_ledger', {
    p_user_id: user.id,
    p_org_name: orgName,
    p_org_slug: slug,
    p_plan: effectivePlan,
    p_trial_ends_at: trialEndsAt.toISOString(),
    p_max_ledgers: planData.ledgers,
    p_max_team_members: planData.team_members,
    p_ledger_name: ledgerName,
    p_ledger_mode: ledgerMode,
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
