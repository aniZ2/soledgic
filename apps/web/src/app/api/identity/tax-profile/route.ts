import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { requireSensitiveActionAuth } from '@/lib/sensitive-action-server'
import { createServiceRoleClient } from '@/lib/supabase/service'

type TaxProfilePayload = {
  legal_name?: string
  tax_id_type?: 'ssn' | 'ein' | 'itin'
  tax_id_last4?: string
  business_type?: 'individual' | 'sole_proprietor' | 'llc' | 'corporation' | 'partnership'
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
  }
  certify?: boolean
}

const VALID_TAX_ID_TYPES = new Set(['ssn', 'ein', 'itin'])
const VALID_BUSINESS_TYPES = new Set(['individual', 'sole_proprietor', 'llc', 'corporation', 'partnership'])

function normalizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) return null
  return normalized
}

function mapTaxProfile(row: Record<string, unknown> | null) {
  if (!row) return null

  return {
    user_id: row.user_id,
    status: row.status,
    legal_name: row.legal_name,
    tax_id_type: row.tax_id_type,
    tax_id_last4: row.tax_id_last4,
    business_type: row.business_type,
    address: {
      line1: row.address_line1,
      line2: row.address_line2,
      city: row.address_city,
      state: row.address_state,
      postal_code: row.address_postal_code,
      country: row.address_country,
    },
    certified_at: row.certified_at,
  }
}

export const GET = createApiHandler(
  async (_request, { user }) => {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('shared_tax_profiles')
      .select('user_id, status, legal_name, tax_id_type, tax_id_last4, business_type, address_line1, address_line2, address_city, address_state, address_postal_code, address_country, certified_at')
      .eq('user_id', user!.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to load shared tax profile' }, { status: 500 })
    }

    return NextResponse.json({ tax_profile: mapTaxProfile(data as Record<string, unknown> | null) })
  },
  {
    routePath: '/api/identity/tax-profile',
    csrfProtection: false,
  },
)

export const PUT = createApiHandler(
  async (request, context) => {
    const { user } = context
    const { data: body, error: parseError } = await parseJsonBody<TaxProfilePayload>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid JSON body' }, { status: 400 })
    }

    const legalName = body.legal_name ? normalizeString(body.legal_name, 255) : null
    if (body.legal_name && !legalName) {
      return NextResponse.json({ error: 'Invalid legal_name' }, { status: 400 })
    }

    const taxIdType = body.tax_id_type || null
    if (taxIdType && !VALID_TAX_ID_TYPES.has(taxIdType)) {
      return NextResponse.json({ error: 'Invalid tax_id_type' }, { status: 400 })
    }

    const taxIdLast4 = body.tax_id_last4 ? normalizeString(body.tax_id_last4, 4) : null
    if (body.tax_id_last4 && !/^\d{4}$/.test(taxIdLast4 || '')) {
      return NextResponse.json({ error: 'Invalid tax_id_last4' }, { status: 400 })
    }

    const businessType = body.business_type || null
    if (businessType && !VALID_BUSINESS_TYPES.has(businessType)) {
      return NextResponse.json({ error: 'Invalid business_type' }, { status: 400 })
    }

    const address = body.address || {}
    const now = body.certify === true ? new Date().toISOString() : null

    const sensitiveAuthFailure = requireSensitiveActionAuth(context, 'update shared tax information')
    if (sensitiveAuthFailure) {
      return sensitiveAuthFailure
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('shared_tax_profiles')
      .upsert({
        user_id: user!.id,
        status: 'active',
        legal_name: legalName,
        tax_id_type: taxIdType,
        tax_id_last4: taxIdLast4,
        business_type: businessType,
        address_line1: address.line1 ? normalizeString(address.line1, 255) : null,
        address_line2: address.line2 ? normalizeString(address.line2, 255) : null,
        address_city: address.city ? normalizeString(address.city, 100) : null,
        address_state: address.state ? normalizeString(address.state, 50) : null,
        address_postal_code: address.postal_code ? normalizeString(address.postal_code, 20) : null,
        address_country: address.country ? normalizeString(address.country, 2)?.toUpperCase() : 'US',
        certified_at: now,
        certified_by: body.certify ? user!.id : null,
      }, {
        onConflict: 'user_id',
      })
      .select('user_id, status, legal_name, tax_id_type, tax_id_last4, business_type, address_line1, address_line2, address_city, address_state, address_postal_code, address_country, certified_at')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to save shared tax profile' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      tax_profile: mapTaxProfile(data as Record<string, unknown>),
    })
  },
  {
    routePath: '/api/identity/tax-profile',
    csrfProtection: true,
  },
)
