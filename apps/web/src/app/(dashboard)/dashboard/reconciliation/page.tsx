'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Upload, ExternalLink } from 'lucide-react'
import { useToast } from '@/components/notifications/toast-provider'
import { ConfirmDialog } from '@/components/settings/confirm-dialog'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { ConnectBank, ConnectionList } from '@/components/connect-bank'

interface Connection {
  id: string
  institution_name: string | null
  status: string
  last_sync_at: string | null
  account_count: number
  error_message: string | null
}

export default function ReconciliationPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [syncing, setSyncing] = useState<string | null>(null)
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null)
  const toast = useToast()

  const loadConnections = useCallback(async (lid?: string) => {
    const id = lid || ledgerId
    if (!id) return

    try {
      const res = await callLedgerFunction('bank-aggregator', {
        ledgerId: id,
        method: 'POST',
        body: { action: 'list_connections' },
      })
      const result = await res.json()
      if (result.success) {
        setConnections(result.data.connections || [])
      }
    } catch {
      // Silent fail — connections just won't show
    }
  }, [ledgerId])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
      if (!membership) return

      const { data: ledgers } = await supabase
        .from('ledgers')
        .select('id, ledger_group_id')
        .eq('organization_id', membership.organization_id)
        .eq('status', 'active')
        .eq('livemode', livemode)

      const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
      if (!ledger) return

      setLedgerId(ledger.id)
      loadConnections(ledger.id)
    }

    void init()
  }, [livemode, activeLedgerGroupId, loadConnections])

  const handleSync = async (connectionId: string) => {
    if (!ledgerId) return
    setSyncing(connectionId)

    try {
      const res = await callLedgerFunction('bank-aggregator', {
        ledgerId,
        method: 'POST',
        body: { action: 'sync', connection_id: connectionId },
      })
      const result = await res.json()
      if (result.success) {
        toast.success('Sync complete', `${result.data.added} added, ${result.data.auto_matched} auto-matched`)
      } else {
        toast.error('Sync error', result.error)
      }
      loadConnections()
    } catch {
      toast.error('Sync failed')
    } finally {
      setSyncing(null)
    }
  }

  const handleDisconnect = (connectionId: string) => {
    setDisconnectTarget(connectionId)
  }

  const confirmDisconnect = async () => {
    if (!ledgerId || !disconnectTarget) return

    try {
      await callLedgerFunction('bank-aggregator', {
        ledgerId,
        method: 'POST',
        body: { action: 'disconnect', connection_id: disconnectTarget },
      })
      toast.success('Bank account disconnected')
      loadConnections()
    } catch {
      toast.error('Failed to disconnect')
    }
    setDisconnectTarget(null)
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Reconciliation</h1>
        <p className="text-muted-foreground mt-1">
          Import transactions and match them to your ledger to keep books clean.
        </p>
      </div>

      {/* Connect Bank Account */}
      {ledgerId && (
        <div className="bg-card border border-border rounded-lg p-6 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Bank Feeds</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your bank account for automatic transaction syncing and matching.
              </p>
            </div>
            <ConnectBank ledgerId={ledgerId} onConnectionChange={() => loadConnections()} />
          </div>

          {connections.length > 0 && (
            <div className="mt-4">
              <ConnectionList
                connections={connections}
                syncingConnectionId={syncing}
                onSync={handleSync}
                onDisconnect={handleDisconnect}
              />
            </div>
          )}
        </div>
      )}

      {/* Import Transactions */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Import Transactions</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a CSV export from your bank or accounting system, then review matches.
            </p>
          </div>
          <Link
            href="/dashboard/reconciliation/import"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </Link>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          <Link href="/docs/api#import-transactions" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="w-4 h-4" />
            View import API docs
          </Link>
        </div>
      </div>

      <ConfirmDialog
        isOpen={disconnectTarget !== null}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={confirmDisconnect}
        title="Disconnect Bank Account"
        message="Disconnect this bank account? Existing imported transactions will be preserved."
        confirmLabel="Disconnect"
        variant="danger"
      />
    </div>
  )
}
