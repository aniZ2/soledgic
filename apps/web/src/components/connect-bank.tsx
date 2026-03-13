'use client'

import { useState, useCallback } from 'react'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { SensitiveActionModal } from '@/components/settings/sensitive-action-modal'
import { useSensitiveActionGate } from '@/hooks/use-sensitive-action-gate'
import { Building2, Loader2, CheckCircle, AlertCircle, Unplug } from 'lucide-react'

interface Connection {
  id: string
  institution_name: string | null
  status: string
  last_sync_at: string | null
  account_count: number
  error_message: string | null
}

interface ConnectBankProps {
  ledgerId: string
  onConnectionChange?: () => void
}

export function ConnectBank({ ledgerId, onConnectionChange }: ConnectBankProps) {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { challenge, dismissChallenge, handleProtectedResponse, retryVerifiedAction } =
    useSensitiveActionGate()

  const openTellerConnect = useCallback(async () => {
    setConnecting(true)
    setError(null)

    try {
      // 1. Get Teller Connect config from server
      const res = await callLedgerFunction('bank-aggregator', {
        ledgerId,
        method: 'POST',
        body: { action: 'get_connect_config' },
      })

      const result = await res.json()
      if (!res.ok) {
        if (handleProtectedResponse(res, result, openTellerConnect)) {
          setConnecting(false)
          return
        }
      }
      if (!result.success || !result.data?.application_id) {
        setError(result.error || 'Failed to initialize bank connection')
        setConnecting(false)
        return
      }

      const { application_id, environment } = result.data

      // 2. Load Teller Connect script dynamically
      await loadTellerScript()

      // 3. Open Teller Connect
      const TellerConnect = (window as unknown as { TellerConnect: TellerConnectFactory }).TellerConnect
      const handler = TellerConnect.setup({
        applicationId: application_id,
        products: ['transactions', 'balance'],
        environment: environment || 'sandbox',
        onSuccess: async (enrollment: TellerEnrollment) => {
          try {
            const storeRes = await callLedgerFunction('bank-aggregator', {
              ledgerId,
              method: 'POST',
              body: {
                action: 'store_enrollment',
                access_token: enrollment.accessToken,
                enrollment_id: enrollment.enrollment.id,
                institution_name: enrollment.enrollment.institution?.name || null,
              },
            })

            const storeResult = await storeRes.json()
            if (!storeRes.ok) {
              if (handleProtectedResponse(storeRes, storeResult, openTellerConnect)) {
                setConnecting(false)
                return
              }
            }
            if (storeResult.success) {
              onConnectionChange?.()
            } else {
              setError(storeResult.error || 'Failed to connect bank')
            }
          } catch {
            setError('Failed to complete bank connection')
          } finally {
            setConnecting(false)
          }
        },
        onExit: () => {
          setConnecting(false)
        },
      })

      handler.open()
    } catch {
      setError('Failed to open bank connection')
      setConnecting(false)
    }
  }, [ledgerId, onConnectionChange])

  return (
    <div>
      <button
        onClick={openTellerConnect}
        disabled={connecting}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm disabled:opacity-50"
      >
        {connecting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Building2 className="w-4 h-4" />
        )}
        {connecting ? 'Connecting...' : 'Connect Bank Account'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}

      <SensitiveActionModal
        challenge={challenge}
        onClose={dismissChallenge}
        onVerified={retryVerifiedAction}
      />
    </div>
  )
}

export function ConnectionList({
  connections,
  syncingConnectionId,
  onSync,
  onDisconnect,
}: {
  connections: Connection[]
  syncingConnectionId?: string | null
  onSync: (connectionId: string) => void
  onDisconnect: (connectionId: string) => void
}) {
  if (connections.length === 0) return null

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'pending':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />
      default:
        return <Unplug className="w-4 h-4 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-3">
      {connections.map((conn) => (
        <div key={conn.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            {getStatusIcon(conn.status)}
            <div>
              <p className="text-sm font-medium text-foreground">
                {conn.institution_name || 'Bank Account'}
              </p>
              <p className="text-xs text-muted-foreground">
                {conn.account_count} account{conn.account_count !== 1 ? 's' : ''}
                {conn.last_sync_at && ` · Last synced ${new Date(conn.last_sync_at).toLocaleDateString()}`}
              </p>
              {conn.status === 'error' && conn.error_message && (
                <p className="text-xs text-red-500 mt-0.5">{conn.error_message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {conn.status === 'active' && (
              <button
                onClick={() => onSync(conn.id)}
                disabled={syncingConnectionId === conn.id}
                className="text-xs px-3 py-1 bg-card border border-border rounded-md hover:bg-muted disabled:opacity-50"
              >
                {syncingConnectionId === conn.id ? 'Syncing...' : 'Sync Now'}
              </button>
            )}
            <button
              onClick={() => onDisconnect(conn.id)}
              className="text-xs px-3 py-1 text-red-600 hover:text-red-800"
            >
              Disconnect
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// Teller Connect script loader
function loadTellerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as { TellerConnect?: unknown }).TellerConnect) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://cdn.teller.io/connect/connect.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Teller Connect'))
    document.head.appendChild(script)
  })
}

// Teller types (minimal, for Connect usage)
interface TellerEnrollment {
  accessToken: string
  user: { id: string }
  enrollment: {
    id: string
    institution?: { name: string }
  }
}

interface TellerConnectHandler {
  open: () => void
}

interface TellerConnectFactory {
  setup: (config: {
    applicationId: string
    products: string[]
    environment: string
    onSuccess: (enrollment: TellerEnrollment) => void
    onExit: () => void
  }) => TellerConnectHandler
}
