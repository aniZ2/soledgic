import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { getPublicAppUrl } from '@/lib/public-url'
import {
  createOnboardingLink,
  fetchProcessorIdentity,
  fetchProcessorPaymentInstrumentsForIdentity,
} from '@/lib/processor'

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNestedValue(value: unknown, ...path: string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    if (!isJsonRecord(current)) return null
    current = current[key]
  }
  return current
}

function normalizeOnboardingFormId(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^obf_[A-Za-z0-9]+$/.test(trimmed)) return null
  return trimmed
}

function isExpired(iso: string | null | undefined) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t <= Date.now() : false
}

function normalizePaymentInstrumentType(pi: unknown): string {
  const type = String(
    getNestedValue(pi, 'type') || getNestedValue(pi, 'instrument_type') || ''
  ).toUpperCase()
  if (type.includes('CARD')) return 'card'
  if (type.includes('BANK')) return 'bank_account'
  return type ? type.toLowerCase() : 'unknown'
}

function extractLast4(pi: unknown): string | null {
  const candidates = [
    getNestedValue(pi, 'bank_account', 'last4'),
    getNestedValue(pi, 'account_last4'),
    getNestedValue(pi, 'last4'),
    getNestedValue(pi, 'last_four'),
    getNestedValue(pi, 'card', 'last4'),
  ]
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim().length === 4) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) {
      const s = String(v)
      if (s.length === 4) return s
    }
  }
  return null
}

function extractBankName(pi: unknown): string | null {
  const candidates = [
    getNestedValue(pi, 'bank_account', 'bank_name'),
    getNestedValue(pi, 'bank_name'),
    getNestedValue(pi, 'institution_name'),
    getNestedValue(pi, 'name'),
  ]
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

// For creator payouts, ONLY accept bank accounts (cards are not a valid payout rail)
function pickPayoutInstrument(instruments: unknown[]): {
  id: string
  type: string
  last4: string | null
  bank_name: string | null
} | null {
  if (!Array.isArray(instruments) || instruments.length === 0) return null
  const enabled = instruments.filter((pi) => getNestedValue(pi, 'enabled') !== false)
  const list = enabled.length > 0 ? enabled : instruments

  // Only bank accounts are valid for payouts - never fall back to cards
  const bankAccounts = list.filter((pi) => normalizePaymentInstrumentType(pi) === 'bank_account')
  if (bankAccounts.length === 0) return null

  const first = bankAccounts[0]
  const idRaw = getNestedValue(first, 'id')
  if (typeof idRaw !== 'string' || idRaw.trim().length === 0) return null
  return {
    id: idRaw,
    type: 'bank_account',
    last4: extractLast4(first),
    bank_name: extractBankName(first),
  }
}

interface PayoutSetupRequest {
  action: 'status' | 'create_setup_link' | 'save_payout_method'
  identity_id?: string
  state?: string
}

async function findCreatorAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string }
) {
  // SECURITY: Look up the connected_accounts row by the authenticated user's email.
  // The `email` column on connected_accounts is set by platform admins when they
  // register creators; it is the trust anchor. We do NOT use user_metadata.creator_id
  // because user_metadata is user-writable in Supabase and is not a safe auth boundary.
  if (!user.email) {
    return { data: null, error: 'No email on authenticated user', creatorId: null }
  }

  const { data, error } = await supabase
    .from('connected_accounts')
    .select('id, entity_id, processor_account_id, processor_identity_id, default_bank_last4, default_bank_name, payouts_enabled, setup_state, setup_state_expires_at')
    .eq('entity_type', 'creator')
    .eq('email', user.email)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  return { data, error, creatorId: data?.entity_id || null }
}

export const POST = createApiHandler(
  async (request, { user }) => {
    const { data: body, error: parseError } = await parseJsonBody<PayoutSetupRequest>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    const supabase = await createClient()

    // Look up the creator's connected account by their verified email
    const { data: connectedAccount, error: caError } = await findCreatorAccount(supabase, user!)

    if (caError || !connectedAccount) {
      return NextResponse.json({ error: 'Creator account not found' }, { status: 404 })
    }

    if (body.action === 'status') {
      return NextResponse.json({
        success: true,
        data: {
          configured: connectedAccount.payouts_enabled === true,
          bank_last4: connectedAccount.default_bank_last4 || null,
          bank_name: connectedAccount.default_bank_name || null,
          payouts_enabled: connectedAccount.payouts_enabled === true,
        },
      })
    }

    if (body.action === 'create_setup_link') {
      const onboardingFormId = normalizeOnboardingFormId(
        process.env.PROCESSOR_PAYOUT_ONBOARDING_FORM_ID ||
          process.env.PROCESSOR_ONBOARDING_FORM_ID ||
          null
      )
      if (!onboardingFormId) {
        return NextResponse.json(
          { error: 'Payout setup form is not configured' },
          { status: 503 }
        )
      }

      const setupState = crypto.randomUUID()
      const expirationInMinutes = 60
      const expiresAt = new Date(Date.now() + expirationInMinutes * 60 * 1000).toISOString()

      const appUrl = getPublicAppUrl()
      const returnUrl = new URL('/creator/settings', appUrl)
      returnUrl.searchParams.set('payout_setup', 'success')

      const expiredUrl = new URL('/creator/settings', appUrl)
      expiredUrl.searchParams.set('payout_setup', 'expired')

      const link = await createOnboardingLink({
        onboardingFormId,
        appUrl,
        identityId: connectedAccount.processor_identity_id || null,
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
        return NextResponse.json({ error: 'Failed to create payout setup link' }, { status: 500 })
      }

      const { error: stateError } = await supabase
        .from('connected_accounts')
        .update({
          setup_state: setupState,
          setup_state_expires_at: expiresAt,
        })
        .eq('id', connectedAccount.id)

      if (stateError) {
        return NextResponse.json({ error: 'Failed to initialize payout setup' }, { status: 500 })
      }

      return NextResponse.json({ success: true, data: { url: linkUrl } })
    }

    if (body.action === 'save_payout_method') {
      // Validate state (anti-replay)
      if (
        !connectedAccount.setup_state ||
        !body.state ||
        connectedAccount.setup_state !== body.state
      ) {
        return NextResponse.json({ error: 'Invalid payout setup state' }, { status: 403 })
      }

      if (isExpired(connectedAccount.setup_state_expires_at)) {
        return NextResponse.json(
          { error: 'Payout setup session expired. Please start again.' },
          { status: 403 }
        )
      }

      const identityId = body.identity_id || connectedAccount.processor_identity_id
      if (!identityId) {
        return NextResponse.json({ error: 'identity_id is required' }, { status: 400 })
      }

      let identity: { id?: string }
      try {
        identity = await fetchProcessorIdentity(identityId)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid identity'
        return NextResponse.json({ error: msg }, { status: 400 })
      }

      const instruments = await fetchProcessorPaymentInstrumentsForIdentity(identityId).catch(
        () => []
      )
      const chosen = pickPayoutInstrument(instruments)
      if (!chosen) {
        return NextResponse.json(
          { error: 'No bank account found. Please add a bank account and try again.' },
          { status: 400 }
        )
      }

      // Update connected_account with payout details
      const { error: saveError } = await supabase
        .from('connected_accounts')
        .update({
          processor_identity_id: identity.id || identityId,
          default_bank_account_id: chosen.id,
          default_bank_last4: chosen.last4,
          default_bank_name: chosen.bank_name,
          payouts_enabled: true,
          setup_state: null,
          setup_state_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectedAccount.id)

      if (saveError) {
        return NextResponse.json({ error: 'Failed to save payout method' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        data: {
          configured: true,
          bank_last4: chosen.last4,
          bank_name: chosen.bank_name,
          payouts_enabled: true,
        },
      })
    }

    return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/creator/payout-setup',
  }
)
