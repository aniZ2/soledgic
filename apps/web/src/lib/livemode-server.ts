'use server'

import { cookies } from 'next/headers'
import { LIVEMODE_COOKIE, ACTIVE_LEDGER_GROUP_COOKIE, READONLY_COOKIE } from './livemode'
import { createClient } from './supabase/server'

/**
 * Read livemode from cookie in server components / route handlers.
 * Returns true for live mode, false for test mode (default).
 */
export async function getLivemode(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get(LIVEMODE_COOKIE)?.value === 'true'
}

/**
 * Read the active ledger group ID from cookie.
 * Returns null if no group is selected (fallback to first ledger).
 */
export async function getActiveLedgerGroupId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(ACTIVE_LEDGER_GROUP_COOKIE)?.value ?? null
}

/**
 * Read the read-only flag from cookie.
 * When true, the environment blocks all write operations (for demos/previews).
 */
export async function getReadonly(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get(READONLY_COOKIE)?.value === 'true'
}

const COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 365, // 1 year
  httpOnly: true,
}

const UUID_V4_OR_V5_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_V4_OR_V5_RE.test(value)
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || null
}

async function isOwnerOrAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('role', ['owner', 'admin'])
    .limit(1)
    .maybeSingle()

  return !error && Boolean(data?.id)
}

/**
 * Server action to toggle livemode.
 * Using a server action (instead of an API route) ensures that
 * cookie updates from Supabase token refresh are properly propagated
 * back to the browser, preventing accidental logouts.
 */
export async function setLivemodeAction(
  livemode: boolean,
  activeLedgerGroupId: string | null
): Promise<{ success: boolean }> {
  const userId = await getAuthenticatedUserId()
  if (!userId) {
    return { success: false }
  }

  if (activeLedgerGroupId && !isUuid(activeLedgerGroupId)) {
    return { success: false }
  }

  const cookieStore = await cookies()

  cookieStore.set(LIVEMODE_COOKIE, String(livemode), COOKIE_OPTIONS)

  if (activeLedgerGroupId) {
    cookieStore.set(ACTIVE_LEDGER_GROUP_COOKIE, activeLedgerGroupId, COOKIE_OPTIONS)
  } else if (activeLedgerGroupId === null) {
    cookieStore.delete(ACTIVE_LEDGER_GROUP_COOKIE)
  }

  return { success: true }
}

/**
 * Server action to set the active ledger group.
 */
export async function setActiveLedgerGroupAction(
  ledgerGroupId: string | null
): Promise<{ success: boolean }> {
  const userId = await getAuthenticatedUserId()
  if (!userId) {
    return { success: false }
  }

  if (ledgerGroupId && !isUuid(ledgerGroupId)) {
    return { success: false }
  }

  const cookieStore = await cookies()

  if (ledgerGroupId) {
    cookieStore.set(ACTIVE_LEDGER_GROUP_COOKIE, ledgerGroupId, COOKIE_OPTIONS)
  } else {
    cookieStore.delete(ACTIVE_LEDGER_GROUP_COOKIE)
  }

  return { success: true }
}

/**
 * Server action to toggle read-only mode.
 */
export async function setReadonlyAction(
  readonly: boolean
): Promise<{ success: boolean }> {
  const userId = await getAuthenticatedUserId()
  if (!userId) {
    return { success: false }
  }

  const canToggleReadonly = await isOwnerOrAdmin(userId)
  if (!canToggleReadonly) {
    return { success: false }
  }

  const cookieStore = await cookies()

  if (readonly) {
    cookieStore.set(READONLY_COOKIE, 'true', {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24, // 24 hours — auto-expires
    })
  } else {
    cookieStore.delete(READONLY_COOKIE)
  }

  return { success: true }
}
