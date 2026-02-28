import { createServerClient } from '@supabase/ssr'

export function getServerSupabaseUrl(): string {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }
  return url
}

export function getServerServiceKey(): string {
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
    (process.env.SUPABASE_SECRET_KEY || '').trim()

  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is not configured')
  }

  return key
}

export function createServiceRoleClient() {
  return createServerClient(
    getServerSupabaseUrl(),
    getServerServiceKey(),
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
    }
  )
}
