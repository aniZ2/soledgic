import { cookies } from 'next/headers'
import { LIVEMODE_COOKIE, ACTIVE_LEDGER_GROUP_COOKIE, READONLY_COOKIE } from './livemode'

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
