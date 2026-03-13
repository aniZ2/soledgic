'use client'

import { useEffect, useState } from 'react'
import { Building2, Loader2, Network, Save, Waypoints } from 'lucide-react'
import { SensitiveActionModal } from '@/components/settings/sensitive-action-modal'
import { useSensitiveActionGate } from '@/hooks/use-sensitive-action-gate'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import type { CurrentEcosystemSummary } from '@/lib/ecosystems'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function EcosystemSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [joining, setJoining] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ecosystem, setEcosystem] = useState<CurrentEcosystemSummary | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [targetSlug, setTargetSlug] = useState('')
  const { challenge, dismissChallenge, handleProtectedResponse, retryVerifiedAction } =
    useSensitiveActionGate()

  async function loadEcosystem() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/ecosystems/current', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load ecosystem')
      }

      const summary = data.ecosystem as CurrentEcosystemSummary
      setEcosystem(summary)
      setName(summary.name)
      setSlug(summary.slug)
      setDescription(summary.description || '')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load ecosystem'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadEcosystem()
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetchWithCsrf('/api/ecosystems/current', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          name,
          slug,
          description,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (handleProtectedResponse(res, data, handleSave)) {
          return
        }
        throw new Error(data.error || 'Failed to save ecosystem settings')
      }

      setEcosystem(data.ecosystem as CurrentEcosystemSummary)
      setMessage('Ecosystem settings saved.')
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Failed to save ecosystem settings'))
    } finally {
      setSaving(false)
    }
  }

  async function handleJoinExisting() {
    setJoining(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetchWithCsrf('/api/ecosystems/current', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'join_existing',
          transfer_to_slug: targetSlug,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (handleProtectedResponse(res, data, handleJoinExisting)) {
          return
        }
        throw new Error(data.error || 'Failed to join ecosystem')
      }

      const summary = data.ecosystem as CurrentEcosystemSummary
      setEcosystem(summary)
      setName(summary.name)
      setSlug(summary.slug)
      setDescription(summary.description || '')
      setTargetSlug('')
      setMessage('Current platform moved into the selected ecosystem.')
    } catch (joinError) {
      setError(getErrorMessage(joinError, 'Failed to join ecosystem'))
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading ecosystem settings...
      </div>
    )
  }

  if (!ecosystem) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error || 'Unable to load ecosystem settings.'}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Ecosystem</h1>
        <p className="mt-1 text-muted-foreground">
          Group multiple platforms under one identity and control-plane layer while keeping ledger balances separate.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Network className="h-4 w-4" />
            Ecosystem
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{ecosystem.name}</div>
          <p className="mt-1 text-xs text-muted-foreground font-mono">{ecosystem.slug}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" />
            Platforms
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{ecosystem.platformCount}</div>
          <p className="mt-1 text-xs text-muted-foreground">Organizations grouped under this ecosystem</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Waypoints className="h-4 w-4" />
            Your Role
          </div>
          <div className="mt-2 text-2xl font-semibold capitalize text-foreground">{ecosystem.role || 'viewer'}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {ecosystem.canManage ? 'You can manage ecosystem settings.' : 'Read-only access for this ecosystem.'}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">General Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use ecosystems to group related platforms for shared identity and portfolio visibility. Funds remain scoped to each ledger.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Ecosystem Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!ecosystem.canManage || saving}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground disabled:opacity-60"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Slug</span>
            <input
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              disabled={!ecosystem.canManage || saving}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground disabled:opacity-60"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-muted-foreground">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={!ecosystem.canManage || saving}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground disabled:opacity-60"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            This changes ecosystem metadata only. It does not merge balances or move money between ledgers.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={!ecosystem.canManage || saving}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Ecosystem
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Platforms in this Ecosystem</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Platform</th>
                <th className="py-2 pr-4 font-medium">Slug</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ecosystem.platforms.map((platform) => (
                <tr key={platform.id}>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-foreground">{platform.name}</div>
                    {platform.id === ecosystem.currentOrganizationId ? (
                      <div className="text-xs text-muted-foreground">Current platform</div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 font-mono text-muted-foreground">{platform.slug}</td>
                  <td className="py-3 pr-4 capitalize text-foreground">{platform.status}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {platform.createdAt ? new Date(platform.createdAt).toLocaleDateString() : 'Unknown'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Join an Existing Ecosystem</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Move the current platform into another ecosystem you already manage. Platform balances, ledgers, and payouts remain isolated.
        </p>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            value={targetSlug}
            onChange={(event) => setTargetSlug(event.target.value)}
            disabled={!ecosystem.canManage || joining}
            placeholder="existing-ecosystem-slug"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleJoinExisting}
            disabled={!ecosystem.canManage || joining || targetSlug.trim().length === 0}
            className="inline-flex items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground disabled:opacity-60"
          >
            {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Join Ecosystem
          </button>
        </div>
      </section>

      <SensitiveActionModal
        challenge={challenge}
        onClose={dismissChallenge}
        onVerified={retryVerifiedAction}
      />
    </div>
  )
}
