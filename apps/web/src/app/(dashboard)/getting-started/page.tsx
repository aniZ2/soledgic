'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Checklist, ChecklistStep } from '@/components/getting-started/checklist'
import { ApiTester } from '@/components/getting-started/api-tester'
import { Rocket, ExternalLink, BookOpen, Key, Users, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface ChecklistState {
  organization: boolean
  api_keys: boolean
  creator: boolean
  transaction: boolean
  webhook: boolean
}

export default function GettingStartedPage() {
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState<string>('')
  const [checklist, setChecklist] = useState<ChecklistState>({
    organization: false,
    api_keys: false,
    creator: false,
    transaction: false,
    webhook: false,
  })
  const [currentStep, setCurrentStep] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      setLoading(false)
      return
    }

    // Organization exists - step 1 complete
    const newChecklist = { ...checklist, organization: true }

    // Get test ledger for API key
    const { data: ledgers } = await supabase
      .from('ledgers')
      .select('id, api_key, livemode')
      .eq('organization_id', membership.organization_id)
      .eq('livemode', false)
      .eq('status', 'active')
      .limit(1)

    if (ledgers && ledgers.length > 0) {
      setApiKey(ledgers[0].api_key)
      newChecklist.api_keys = true

      // Check if creator exists
      const { count: creatorCount } = await supabase
        .from('accounts')
        .select('id', { count: 'exact', head: true })
        .eq('ledger_id', ledgers[0].id)
        .eq('account_type', 'creator_balance')

      if (creatorCount && creatorCount > 0) {
        newChecklist.creator = true
      }

      // Check if transaction exists
      const { count: txCount } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('ledger_id', ledgers[0].id)

      if (txCount && txCount > 0) {
        newChecklist.transaction = true
      }

      // Check webhooks (user metadata)
      const onboardingData = user.user_metadata?.onboarding_checklist || {}
      if (onboardingData.webhook) {
        newChecklist.webhook = true
      }
    }

    // Load saved progress from user metadata
    const savedProgress = user.user_metadata?.onboarding_checklist
    if (savedProgress) {
      if (savedProgress.creator) newChecklist.creator = true
      if (savedProgress.transaction) newChecklist.transaction = true
      if (savedProgress.webhook) newChecklist.webhook = true
    }

    setChecklist(newChecklist)

    // Find first incomplete step
    const stepOrder = ['organization', 'api_keys', 'creator', 'transaction', 'webhook']
    const firstIncomplete = stepOrder.find(s => !newChecklist[s as keyof ChecklistState])
    setCurrentStep(firstIncomplete || null)

    setLoading(false)
  }

  const saveProgress = async (step: keyof ChecklistState) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const currentProgress = user.user_metadata?.onboarding_checklist || {}
    await supabase.auth.updateUser({
      data: {
        onboarding_checklist: {
          ...currentProgress,
          [step]: true,
        },
      },
    })
  }

  const handleStepComplete = async (step: 'creator' | 'transaction' | 'webhook') => {
    setChecklist(prev => ({ ...prev, [step]: true }))
    await saveProgress(step)

    // Move to next step
    const stepOrder = ['creator', 'transaction', 'webhook']
    const currentIndex = stepOrder.indexOf(step)
    const nextStep = stepOrder[currentIndex + 1]
    if (nextStep) {
      setCurrentStep(nextStep)
    } else {
      setCurrentStep(null)
    }
  }

  const steps: ChecklistStep[] = [
    {
      id: 'organization',
      title: 'Create your organization',
      description: 'Set up your organization to manage your platform.',
      completed: checklist.organization,
    },
    {
      id: 'api_keys',
      title: 'Get your API keys',
      description: 'Access your API keys to authenticate requests.',
      completed: checklist.api_keys,
      action: '/settings/api-keys',
    },
    {
      id: 'creator',
      title: 'Create your first creator',
      description: 'Register a creator who will receive payouts.',
      completed: checklist.creator,
    },
    {
      id: 'transaction',
      title: 'Record your first transaction',
      description: 'Record a sale to see revenue splitting in action.',
      completed: checklist.transaction,
    },
    {
      id: 'webhook',
      title: 'Set up webhooks',
      description: 'Receive real-time notifications for events.',
      completed: checklist.webhook,
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Rocket className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Getting Started</h1>
        </div>
        <p className="text-muted-foreground">
          Complete these steps to set up your first integration.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Checklist */}
        <div>
          <Checklist
            steps={steps}
            currentStep={currentStep}
            onStepClick={(stepId) => {
              if (stepId === 'organization' || stepId === 'api_keys') {
                // These are auto-completed, don't allow interaction
                return
              }
              setCurrentStep(stepId)
            }}
          />

          {/* Quick Links */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <Link
              href="/settings/api-keys"
              className="flex items-center gap-3 p-4 bg-card border border-border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <Key className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">API Keys</p>
                <p className="text-xs text-muted-foreground">View your keys</p>
              </div>
            </Link>
            <a
              href="https://docs.soledgic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-card border border-border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <BookOpen className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">Documentation</p>
                <p className="text-xs text-muted-foreground">Full API reference</p>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground ml-auto" />
            </a>
          </div>
        </div>

        {/* Right: API Tester */}
        <div>
          {currentStep === 'creator' && (
            <ApiTester
              apiKey={apiKey}
              step="creator"
              onSuccess={() => handleStepComplete('creator')}
            />
          )}
          {currentStep === 'transaction' && (
            <ApiTester
              apiKey={apiKey}
              step="transaction"
              onSuccess={() => handleStepComplete('transaction')}
            />
          )}
          {currentStep === 'webhook' && (
            <ApiTester
              apiKey={apiKey}
              step="webhook"
              onSuccess={() => handleStepComplete('webhook')}
            />
          )}
          {!currentStep && (
            <div className="bg-card border border-green-500/30 rounded-lg p-8 text-center">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Rocket className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                You&apos;re ready to go!
              </h3>
              <p className="text-muted-foreground mb-6">
                You&apos;ve completed the setup. Start building your integration or explore the dashboard.
              </p>
              <div className="flex items-center justify-center gap-4">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/dashboard/creators"
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Manage Creators
                </Link>
              </div>
            </div>
          )}
          {(currentStep === 'organization' || currentStep === 'api_keys') && (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                {currentStep === 'organization' ? (
                  <Users className="w-8 h-8 text-primary" />
                ) : (
                  <Key className="w-8 h-8 text-primary" />
                )}
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {currentStep === 'organization' ? 'Organization Created' : 'API Keys Ready'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {currentStep === 'organization'
                  ? 'Your organization is set up. This step is complete!'
                  : 'Your API keys are ready to use. View them in settings.'}
              </p>
              {currentStep === 'api_keys' && (
                <Link
                  href="/settings/api-keys"
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
                >
                  View API Keys
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
