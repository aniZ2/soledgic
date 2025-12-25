'use client'

import { useState, useEffect } from 'react'
import { User, Building2, Users, Key } from 'lucide-react'

interface Profile {
  id: string
  email: string
  full_name: string | null
  timezone: string
}

interface Organization {
  id: string
  name: string
  slug: string
}

interface Membership {
  role: string
  organization: Organization
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form state
  const [fullName, setFullName] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [orgName, setOrgName] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        const [profileRes, orgRes] = await Promise.all([
          fetch('/api/profile'),
          fetch('/api/organizations'),
        ])
        
        const profileData = await profileRes.json()
        const orgData = await orgRes.json()
        
        if (profileData.profile) {
          setProfile(profileData.profile)
          setFullName(profileData.profile.full_name || '')
          setTimezone(profileData.profile.timezone || 'America/New_York')
        }
        
        if (orgData.organizations?.length > 0) {
          const org = orgData.organizations[0]
          setMembership({ role: org.role, organization: org })
          setOrgName(org.name)
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const handleSaveProfile = async () => {
    setSaving(true)
    setMessage(null)
    
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, timezone }),
      })
      
      if (!res.ok) throw new Error('Failed to save')
      
      setMessage({ type: 'success', text: 'Profile updated' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save profile' })
    }
    setSaving(false)
  }

  const handleSaveOrg = async () => {
    if (!membership || membership.role !== 'owner') return
    
    setSaving(true)
    setMessage(null)
    
    try {
      const res = await fetch(`/api/organizations/${membership.organization.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName }),
      })
      
      if (!res.ok) throw new Error('Failed to save')
      
      setMessage({ type: 'success', text: 'Organization updated' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save organization' })
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  const isOwner = membership?.role === 'owner'

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-foreground">Settings</h1>
      <p className="mt-1 text-muted-foreground">
        Manage your account and organization settings
      </p>

      {message && (
        <div className={`mt-4 p-3 rounded-md text-sm ${
          message.type === 'success' 
            ? 'bg-green-500/10 text-green-500 border border-green-500/20'
            : 'bg-destructive/10 text-destructive border border-destructive/20'
        }`}>
          {message.text}
        </div>
      )}

      {/* Profile Settings */}
      <div className="mt-8 bg-card border border-border rounded-lg">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Profile</h2>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Email
            </label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              className="w-full px-4 py-3 border border-border rounded-md bg-muted text-muted-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Email cannot be changed
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">London (GMT)</option>
              <option value="Europe/Paris">Paris (CET)</option>
              <option value="Asia/Tokyo">Tokyo (JST)</option>
            </select>
          </div>
          <button 
            onClick={handleSaveProfile}
            disabled={saving}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Organization Settings */}
      {membership && (
        <div className="mt-6 bg-card border border-border rounded-lg">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">Organization</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Organization name
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!isOwner}
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted disabled:text-muted-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Organization ID
              </label>
              <input
                type="text"
                value={membership.organization.id}
                disabled
                className="w-full px-4 py-3 border border-border rounded-md bg-muted text-muted-foreground font-mono text-sm"
              />
            </div>
            {isOwner && (
              <button 
                onClick={handleSaveOrg}
                disabled={saving}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Team Members */}
      {membership && isOwner && (
        <div className="mt-6 bg-card border border-border rounded-lg">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">Team Members</h2>
              </div>
              <button className="text-sm text-primary hover:underline">
                Invite member
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {fullName?.charAt(0) || profile?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-foreground">{fullName || 'You'}</p>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">Owner</span>
            </div>
          </div>
        </div>
      )}

      {/* API Keys */}
      <div className="mt-6 bg-card border border-border rounded-lg">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">API Access</h2>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            API keys are managed per-ledger. Go to a specific ledger to view or regenerate its API key.
          </p>
        </div>
      </div>

      {/* Danger Zone */}
      {isOwner && (
        <div className="mt-6 bg-card border border-destructive/50 rounded-lg">
          <div className="p-6 border-b border-destructive/50">
            <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Delete organization</p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your organization and all ledgers.
                </p>
              </div>
              <button className="px-4 py-2 border border-destructive text-destructive rounded-md hover:bg-destructive/10">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
