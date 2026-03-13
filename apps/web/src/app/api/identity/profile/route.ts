import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createServiceRoleClient } from '@/lib/supabase/service'

type ProfilePayload = {
  full_name?: string
  avatar_url?: string
  timezone?: string
  date_format?: string
  currency?: string
  onboarding_completed?: boolean
  onboarding_step?: number
}

function normalizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) return null
  return normalized
}

export const GET = createApiHandler(
  async (_request, { user }) => {
    const supabase = createServiceRoleClient()
    const email = user?.email?.trim() || ''

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        id: user!.id,
        email,
      }, {
        onConflict: 'id',
        ignoreDuplicates: false,
      })
      .select('id, email, full_name, avatar_url, timezone, date_format, currency, onboarding_completed, onboarding_step')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to load identity profile' }, { status: 500 })
    }

    return NextResponse.json({
      profile: {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        avatar_url: data.avatar_url,
        timezone: data.timezone,
        date_format: data.date_format,
        currency: data.currency,
        onboarding_completed: Boolean(data.onboarding_completed),
        onboarding_step: Number(data.onboarding_step || 0),
      },
    })
  },
  {
    routePath: '/api/identity/profile',
    csrfProtection: false,
  },
)

export const PATCH = createApiHandler(
  async (request, { user }) => {
    const { data: body, error: parseError } = await parseJsonBody<ProfilePayload>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid JSON body' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}

    if (body.full_name !== undefined) {
      const value = normalizeString(body.full_name, 255)
      if (body.full_name && !value) {
        return NextResponse.json({ error: 'Invalid full_name' }, { status: 400 })
      }
      patch.full_name = value
    }

    if (body.avatar_url !== undefined) {
      patch.avatar_url = body.avatar_url ? normalizeString(body.avatar_url, 500) : null
    }

    if (body.timezone !== undefined) {
      const value = normalizeString(body.timezone, 100)
      if (body.timezone && !value) {
        return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
      }
      patch.timezone = value
    }

    if (body.date_format !== undefined) {
      const value = normalizeString(body.date_format, 50)
      if (body.date_format && !value) {
        return NextResponse.json({ error: 'Invalid date_format' }, { status: 400 })
      }
      patch.date_format = value
    }

    if (body.currency !== undefined) {
      const value = normalizeString(body.currency, 3)
      if (body.currency && !value) {
        return NextResponse.json({ error: 'Invalid currency' }, { status: 400 })
      }
      patch.currency = value?.toUpperCase() || null
    }

    if (body.onboarding_completed !== undefined) {
      patch.onboarding_completed = Boolean(body.onboarding_completed)
    }

    if (body.onboarding_step !== undefined) {
      if (!Number.isInteger(body.onboarding_step) || body.onboarding_step < 0 || body.onboarding_step > 100) {
        return NextResponse.json({ error: 'Invalid onboarding_step' }, { status: 400 })
      }
      patch.onboarding_step = body.onboarding_step
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        id: user!.id,
        email: user?.email?.trim() || '',
        ...patch,
      }, {
        onConflict: 'id',
      })
      .select('id, email, full_name, avatar_url, timezone, date_format, currency, onboarding_completed, onboarding_step')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to update identity profile' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        avatar_url: data.avatar_url,
        timezone: data.timezone,
        date_format: data.date_format,
        currency: data.currency,
        onboarding_completed: Boolean(data.onboarding_completed),
        onboarding_step: Number(data.onboarding_step || 0),
      },
    })
  },
  {
    routePath: '/api/identity/profile',
    csrfProtection: true,
  },
)
