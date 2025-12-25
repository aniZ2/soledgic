'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Building2, BookOpen } from 'lucide-react'

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [orgName, setOrgName] = useState('')
  const [ledgerName, setLedgerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('You must be logged in')
      setLoading(false)
      return
    }

    // Create slug from name
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: orgName,
        slug: slug,
        owner_id: user.id,
        plan: 'trial',
      })
      .select()
      .single()

    if (orgError) {
      setError(orgError.message)
      setLoading(false)
      return
    }

    // Add user as owner member
    await supabase
      .from('organization_members')
      .insert({
        organization_id: org.id,
        user_id: user.id,
        role: 'owner',
        status: 'active',
        accepted_at: new Date().toISOString(),
      })

    setLoading(false)
    setStep(2)
  }

  const handleCreateLedger = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user?.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      setError('Organization not found')
      setLoading(false)
      return
    }

    // Create ledger via API
    const response = await fetch('/api/ledgers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform_name: ledgerName,
        organization_id: membership.organization_id,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Failed to create ledger')
      setLoading(false)
      return
    }

    // Update user's onboarding status
    await supabase
      .from('user_profiles')
      .update({
        onboarding_completed: true,
        onboarding_step: 2,
      })
      .eq('id', user?.id)

    router.push('/dashboard')
  }

  const handleSkipLedger = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    await supabase
      .from('user_profiles')
      .update({
        onboarding_completed: true,
        onboarding_step: 2,
      })
      .eq('id', user?.id)

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 -ml-64">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`w-16 h-1 ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
        </div>

        {step === 1 && (
          <div className="bg-card border border-border rounded-lg p-8">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            
            <h1 className="text-2xl font-semibold text-foreground">
              Create your organization
            </h1>
            <p className="mt-2 text-muted-foreground">
              This is your billing entity. You can have multiple businesses (ledgers) under one organization.
            </p>

            {error && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateOrg} className="mt-6">
              <label htmlFor="orgName" className="block text-sm font-medium text-foreground mb-2">
                Organization name
              </label>
              <input
                id="orgName"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Acme Inc."
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Usually your company name or your name if you're a solo founder.
              </p>

              <button
                type="submit"
                disabled={loading || !orgName}
                className="mt-6 w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Continue'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}

        {step === 2 && (
          <div className="bg-card border border-border rounded-lg p-8">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            
            <h1 className="text-2xl font-semibold text-foreground">
              Create your first ledger
            </h1>
            <p className="mt-2 text-muted-foreground">
              A ledger is a separate set of books for one business. You can add more later.
            </p>

            {error && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateLedger} className="mt-6">
              <label htmlFor="ledgerName" className="block text-sm font-medium text-foreground mb-2">
                Business name
              </label>
              <input
                id="ledgerName"
                type="text"
                value={ledgerName}
                onChange={(e) => setLedgerName(e.target.value)}
                required
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="My SaaS"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                The name of the business or project you want to track finances for.
              </p>

              <button
                type="submit"
                disabled={loading || !ledgerName}
                className="mt-6 w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create ledger'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <button
              onClick={handleSkipLedger}
              className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
