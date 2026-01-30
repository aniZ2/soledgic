'use client'

import { createContext, useContext } from 'react'

interface LivemodeContextValue {
  livemode: boolean
  activeLedgerGroupId: string | null
  readonly: boolean
}

const LivemodeContext = createContext<LivemodeContextValue>({
  livemode: false,
  activeLedgerGroupId: null,
  readonly: false,
})

export function LivemodeProvider({
  livemode,
  activeLedgerGroupId,
  readonly,
  children,
}: {
  livemode: boolean
  activeLedgerGroupId: string | null
  readonly: boolean
  children: React.ReactNode
}) {
  return (
    <LivemodeContext.Provider value={{ livemode, activeLedgerGroupId, readonly }}>
      {children}
    </LivemodeContext.Provider>
  )
}

/**
 * Read the current livemode value in client components.
 * The value is set by the server layout and passed via React context.
 * This replaces direct cookie reading — the cookie is httpOnly.
 */
export function useLivemode(): boolean {
  return useContext(LivemodeContext).livemode
}

/**
 * Read the active ledger group ID in client components.
 * Returns null if no group is selected.
 */
export function useActiveLedgerGroupId(): string | null {
  return useContext(LivemodeContext).activeLedgerGroupId
}

/**
 * Read the read-only flag in client components.
 * When true, write operations are blocked (demos/previews).
 */
export function useReadonly(): boolean {
  return useContext(LivemodeContext).readonly
}
