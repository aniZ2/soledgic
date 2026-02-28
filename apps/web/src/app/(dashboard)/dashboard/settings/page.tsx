'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building, Save, Loader2 } from 'lucide-react'

interface OrganizationRecord {
  id: string
  name: string
  slug: string
  plan: string
  billing_email: string | null
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [organization, setOrganization] = useState<OrganizationRecord | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    billing_email: '',
  })

  async function loadOrganization() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) return

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', membership.organization_id)
      .single()

    if (org) {
      setOrganization(org as OrganizationRecord)
      setFormData({
        name: org.name || '',
        slug: org.slug || '',
        billing_email: org.billing_email || '',
      })
    }

    setLoading(false)
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadOrganization()
    }, 0)
    return () => clearTimeout(timeoutId)
  }, [])

  const handleSave = async () => {
    if (!organization) return
    setSaving(true)

    const supabase = createClient()
    await supabase
      .from('organizations')
      .update({
        name: formData.name,
        billing_email: formData.billing_email,
      })
      .eq('id', organization.id)

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">General Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your organization settings
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
            <Building className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{organization?.name}</h2>
            <p className="text-sm text-muted-foreground">
              Plan: <span className="capitalize">{organization?.plan}</span>
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              URL Slug
            </label>
            <div className="flex items-center">
              <span className="px-3 py-2 bg-muted border border-r-0 border-border rounded-l-md text-muted-foreground text-sm">
                soledgic.com/
              </span>
              <input
                type="text"
                value={formData.slug}
                disabled
                className="flex-1 px-3 py-2 border border-border rounded-r-md bg-muted text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Slug cannot be changed after creation
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Billing Email
            </label>
            <input
              type="email"
              value={formData.billing_email}
              onChange={(e) => setFormData({ ...formData, billing_email: e.target.value })}
              placeholder="billing@company.com"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Invoices and billing notifications will be sent here
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
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
      </div>

      {/* Danger Zone */}
      <div className="mt-8 bg-red-500/5 border border-red-500/20 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-600">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Deleting your organization will permanently remove all ledgers, transactions, and data.
          This action cannot be undone.
        </p>
        <button
          className="mt-4 px-4 py-2 border border-red-500 text-red-600 rounded-md hover:bg-red-50"
          onClick={() => alert('Contact support to delete your organization')}
        >
          Delete Organization
        </button>
      </div>
    </div>
  )
}
