import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getPublicAppUrl } from '@/lib/public-url'
import { createOnboardingLink } from '@/lib/processor'

function normalizeOnboardingFormId(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^obf_[A-Za-z0-9]+$/.test(trimmed)) return null
  return trimmed
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params

  const supabase = createServiceRoleClient()
  const { data: session, error: sessionError } = await supabase
    .from('checkout_sessions')
    .select('id, status, expires_at')
    .eq('id', sessionId)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Checkout session not found' }, { status: 404 })
  }

  const now = new Date()
  const expiresAt = new Date(session.expires_at)
  if (expiresAt.getTime() <= now.getTime()) {
    await supabase
      .from('checkout_sessions')
      .update({ status: 'expired', updated_at: now.toISOString() })
      .eq('id', sessionId)
    return NextResponse.json({ error: 'Checkout session has expired' }, { status: 410 })
  }

  if (session.status !== 'pending' && session.status !== 'collecting') {
    return NextResponse.json({ error: `Checkout session is ${session.status}` }, { status: 409 })
  }

  const onboardingFormId = normalizeOnboardingFormId(
    process.env.PROCESSOR_CHECKOUT_ONBOARDING_FORM_ID ||
      process.env.PROCESSOR_ONBOARDING_FORM_ID ||
      null
  )
  if (!onboardingFormId) {
    return NextResponse.json(
      { error: 'Checkout form is not configured' },
      { status: 503 }
    )
  }

  const setupState = crypto.randomUUID()
  const expirationInMinutes = 60
  const stateExpiresAt = new Date(Date.now() + expirationInMinutes * 60 * 1000).toISOString()

  const appUrl = getPublicAppUrl()
  const returnUrl = new URL(`/pay/${sessionId}/complete`, appUrl)
  // Note: state is appended by createOnboardingLink via the `state` parameter

  const expiredUrl = new URL(`/pay/${sessionId}`, appUrl)
  expiredUrl.searchParams.set('expired', '1')

  const link = await createOnboardingLink({
    onboardingFormId,
    appUrl,
    identityId: null,
    applicationId: process.env.PROCESSOR_APPLICATION_ID || null,
    expirationInMinutes,
    state: setupState,
    returnUrl: returnUrl.toString(),
    expiredSessionUrl: expiredUrl.toString(),
  })

  const linkUrl =
    link?.link_url ||
    link?.onboarding_link_url ||
    link?._embedded?.links?.[0]?.link_url

  if (!linkUrl) {
    return NextResponse.json({ error: 'Failed to create checkout form link' }, { status: 500 })
  }

  await supabase
    .from('checkout_sessions')
    .update({
      status: 'collecting',
      setup_state: setupState,
      setup_state_expires_at: stateExpiresAt,
      updated_at: now.toISOString(),
    })
    .eq('id', sessionId)

  // Redirect the browser to the processor's hosted form
  return NextResponse.redirect(linkUrl, 303)
}
