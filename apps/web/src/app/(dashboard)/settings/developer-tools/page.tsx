'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wrench, Trash2, AlertTriangle, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { useReadonly } from '@/components/livemode-provider'
import { setReadonlyAction } from '@/lib/livemode-server'

export default function DeveloperToolsPage() {
  const router = useRouter()
  const currentReadonly = useReadonly()

  // Orphan repair state
  const [repairing, setRepairing] = useState(false)
  const [repairResult, setRepairResult] = useState<{
    success: boolean
    repaired: number
    created?: Array<{ id: string; platform_name: string; livemode: boolean }>
  } | null>(null)
  const [repairError, setRepairError] = useState<string | null>(null)

  // Test data reset state
  const [resetting, setResetting] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetResult, setResetResult] = useState<{
    success: boolean
    testLedgerCount: number
    totalRecordsDeleted: number
    deleted: Record<string, number>
  } | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)

  // Read-only toggle state
  const [togglingReadonly, setTogglingReadonly] = useState(false)

  const handleRepairOrphans = async () => {
    setRepairing(true)
    setRepairResult(null)
    setRepairError(null)

    try {
      const res = await fetch('/api/admin/repair-orphans', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setRepairError(data.error || 'Repair failed')
      } else {
        setRepairResult(data)
      }
    } catch {
      setRepairError('Network error')
    } finally {
      setRepairing(false)
    }
  }

  const handleResetTestData = async () => {
    setResetting(true)
    setResetResult(null)
    setResetError(null)

    try {
      const res = await fetch('/api/admin/reset-test-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'RESET TEST DATA' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResetError(data.error || 'Reset failed')
      } else {
        setResetResult(data)
      }
    } catch {
      setResetError('Network error')
    } finally {
      setResetting(false)
      setResetConfirm(false)
    }
  }

  const handleToggleReadonly = async () => {
    setTogglingReadonly(true)
    try {
      await setReadonlyAction(!currentReadonly)
      router.refresh()
    } finally {
      setTogglingReadonly(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Settings
        </Link>
        <h1 className="text-3xl font-bold text-foreground">Developer Tools</h1>
        <p className="text-muted-foreground mt-1">
          Repair data issues and manage test environments
        </p>
      </div>

      <div className="space-y-6">
        {/* Read-Only Mode */}
        <div className={`bg-card border rounded-lg p-6 ${currentReadonly ? 'border-slate-500/30' : 'border-border'}`}>
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              currentReadonly ? 'bg-slate-500/10' : 'bg-purple-500/10'
            }`}>
              {currentReadonly ? (
                <EyeOff className="h-5 w-5 text-slate-500" />
              ) : (
                <Eye className="h-5 w-5 text-purple-500" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">Read-Only Mode</h2>
                {currentReadonly && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600">
                    Active
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Enable read-only mode to block all write operations across the dashboard.
                Useful for demos, sales previews, and viewing data without risk of modification.
                The mode auto-expires after 24 hours.
              </p>

              <button
                onClick={handleToggleReadonly}
                disabled={togglingReadonly}
                className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm disabled:opacity-60 ${
                  currentReadonly
                    ? 'bg-slate-600 text-white hover:bg-slate-700'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {togglingReadonly ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : currentReadonly ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {togglingReadonly
                  ? 'Switching...'
                  : currentReadonly
                    ? 'Disable Read-Only Mode'
                    : 'Enable Read-Only Mode'}
              </button>
            </div>
          </div>
        </div>

        {/* Repair Orphaned Ledger Groups */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Wrench className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">Repair Orphaned Ledger Groups</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Find ledger groups that are missing their test or live sibling and create the missing counterpart.
                This can happen if a ledger was created before the test/live mode feature was added.
              </p>

              <button
                onClick={handleRepairOrphans}
                disabled={repairing}
                className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 text-sm"
              >
                {repairing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4" />
                )}
                {repairing ? 'Scanning...' : 'Scan & Repair'}
              </button>

              {repairResult && (
                <div className="mt-4 p-4 rounded-md bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium text-sm">
                      {repairResult.repaired === 0
                        ? 'No orphans found. All ledger groups are complete.'
                        : `Repaired ${repairResult.repaired} orphaned ledger group${repairResult.repaired !== 1 ? 's' : ''}.`}
                    </span>
                  </div>
                  {repairResult.created && repairResult.created.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {repairResult.created.map((l) => (
                        <li key={l.id}>
                          Created {l.livemode ? 'live' : 'test'} sibling for <strong>{l.platform_name}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {repairError && (
                <div className="mt-4 p-4 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-600">
                  {repairError}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reset Test Data */}
        <div className="bg-card border border-amber-500/30 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <Trash2 className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">Reset Test Environment</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Delete all data from test ledgers — transactions, accounts, entries, payouts, and other records.
                Test ledgers and their API keys are preserved. Live data is never affected.
              </p>

              <div className="mt-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>This action is irreversible. All test transactions, accounts, entries, payouts, and reports will be permanently deleted.</span>
              </div>

              {!resetConfirm ? (
                <button
                  onClick={() => setResetConfirm(true)}
                  className="mt-4 inline-flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-md hover:bg-amber-700 text-sm"
                >
                  <Trash2 className="h-4 w-4" />
                  Reset Test Data
                </button>
              ) : (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={handleResetTestData}
                    disabled={resetting}
                    className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-60 text-sm"
                  >
                    {resetting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {resetting ? 'Deleting...' : 'Confirm: Delete All Test Data'}
                  </button>
                  <button
                    onClick={() => setResetConfirm(false)}
                    disabled={resetting}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {resetResult && (
                <div className="mt-4 p-4 rounded-md bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium text-sm">
                      Test environment reset complete.
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Wiped {resetResult.totalRecordsDeleted.toLocaleString()} records across {resetResult.testLedgerCount} test ledger{resetResult.testLedgerCount !== 1 ? 's' : ''}.
                  </p>
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {Object.entries(resetResult.deleted)
                      .filter(([, count]) => count > 0)
                      .map(([table, count]) => (
                        <li key={table}>
                          {table.replace(/_/g, ' ')}: {count.toLocaleString()}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {resetError && (
                <div className="mt-4 p-4 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-600">
                  {resetError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
