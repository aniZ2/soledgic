'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import {
  Building, Save, Loader2, Check, AlertTriangle,
  Trash2, X, Globe,
} from 'lucide-react'

interface Organization {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  created_at: string
  settings?: {
    timezone?: string
  }
}

const timezones = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
  { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
  { value: 'Europe/Paris', label: 'Central European Time (CET)' },
  { value: 'Europe/Berlin', label: 'Central European Time (CET)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
  { value: 'Asia/Shanghai', label: 'China Standard Time (CST)' },
  { value: 'Asia/Singapore', label: 'Singapore Time (SGT)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' },
]

export default function OrganizationSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [org, setOrg] = useState<Organization | null>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadOrganization()
  }, [])

  const loadOrganization = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    // Get membership with org details
    const { data: membership } = await supabase
      .from('organization_members')
      .select(`
        role,
        organization:organizations(
          id,
          name,
          slug,
          plan,
          status,
          created_at,
          settings
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership?.organization) {
      router.push('/onboarding')
      return
    }

    const orgData = membership.organization as unknown as Organization
    setOrg(orgData)
    setUserRole(membership.role)
    setName(orgData.name)
    setTimezone(orgData.settings?.timezone || 'America/New_York')
    setLoading(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await fetchWithCsrf('/api/organizations', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          settings: { timezone },
        }),
      })

      const json = await res.json()

      if (res.ok) {
        setSuccessMessage('Organization settings saved')
        setOrg(prev => prev ? { ...prev, name: name.trim() } : null)
        router.refresh()
      } else {
        setErrorMessage(json.error || 'Failed to save settings')
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
    }

    setSaving(false)
  }

  const handleDelete = async () => {
    if (deleteConfirmText !== org?.name) return

    setDeleting(true)
    setErrorMessage(null)

    try {
      const res = await fetchWithCsrf('/api/organizations', {
        method: 'DELETE',
      })

      const json = await res.json()

      if (res.ok) {
        // Redirect to login after deletion
        router.push('/login?message=organization_deleted')
      } else {
        setErrorMessage(json.error || 'Failed to delete organization')
        setShowDeleteConfirm(false)
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
      setShowDeleteConfirm(false)
    }

    setDeleting(false)
  }

  const isOwner = userRole === 'owner'
  const canEdit = isOwner || userRole === 'admin'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!org) {
    return (
      <div className="text-muted-foreground">
        Failed to load organization. Please refresh the page.
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Organization Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your organization details and preferences
        </p>
      </div>

      {/* Success banner */}
      {successMessage && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-green-600 flex-1">{successMessage}</p>
          <button onClick={() => setSuccessMessage(null)} className="text-green-600 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Error banner */}
      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <X className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-600 flex-1">{errorMessage}</p>
          <button onClick={() => setErrorMessage(null)} className="text-red-600 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* General settings */}
      <form onSubmit={handleSave} className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
          <Building className="w-5 h-5" />
          General
        </h2>

        <div className="space-y-4">
          {/* Organization name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Organization name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="My Organization"
            />
          </div>

          {/* Organization slug (read-only) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Organization slug
            </label>
            <input
              type="text"
              value={org.slug}
              disabled
              className="w-full px-3 py-2 border border-border rounded-md bg-muted text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The slug cannot be changed after organization creation
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Default timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground disabled:opacity-50"
            >
              {timezones.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Used for reports and scheduled operations
            </p>
          </div>

          {/* Plan info (read-only) */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Current plan</p>
                <p className="text-sm text-muted-foreground capitalize">{org.plan}</p>
              </div>
              <a
                href="/billing"
                className="text-sm text-primary hover:underline"
              >
                Manage billing →
              </a>
            </div>
          </div>
        </div>

        {/* Save button */}
        {canEdit && (
          <div className="mt-6 pt-4 border-t border-border">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </div>
        )}
      </form>

      {/* Organization info */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Organization Info</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Organization ID</dt>
            <dd className="font-mono text-foreground">{org.id}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="capitalize text-foreground">{org.status}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-foreground">
              {new Date(org.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </dd>
          </div>
        </dl>
      </div>

      {/* Danger zone - only for owner */}
      {isOwner && (
        <div className="bg-card border border-red-500/30 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-600 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Once you delete your organization, all data will be permanently removed. This action cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-red-500 text-red-600 rounded-md hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Organization
            </button>
          ) : (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm text-foreground mb-3">
                To confirm deletion, type <strong>{org.name}</strong> below:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={org.name}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground mb-3"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== org.name || deleting}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete Forever
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeleteConfirmText('')
                  }}
                  className="px-4 py-2 border border-border rounded-md hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Non-admin notice */}
      {!canEdit && (
        <p className="text-sm text-muted-foreground mt-6">
          Only organization owners and admins can modify these settings.
        </p>
      )}
    </div>
  )
}
