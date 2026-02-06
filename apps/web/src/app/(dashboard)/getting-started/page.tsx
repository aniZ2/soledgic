'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Checklist, ChecklistStep, defaultSteps } from '@/components/getting-started/checklist'
import { ApiTester } from '@/components/getting-started/api-tester'
import { Rocket, ArrowRight, Loader2, ExternalLink, BookOpen } from 'lucide-react'

interface UserMetadata {
  onboarding_checklist?: Record<string, boolean>
}

export default function GettingStartedPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [steps, setSteps] = useState<ChecklistStep[]>([])
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState<string>('')
  const [allComplete, setAllComplete] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    // Get user's checklist progress from metadata
    const metadata = user.user_metadata as UserMetadata
    const checklistProgress = metadata?.onboarding_checklist || {}

    // Get organization and test API key
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      router.push('/onboarding')
      return
    }

    // Get test ledger for API key
    const { data: testLedger } = await supabase
      .from('ledgers')
      .select('api_key')
      .eq('organization_id', membership.organization_id)
      .eq('livemode', false)
      .eq('status', 'active')
      .limit(1)
      .single()

    if (testLedger) {
      setApiKey(testLedger.api_key)
    }

    // Build steps with completion status
    const stepsWithStatus: ChecklistStep[] = defaultSteps.map(step => ({
      ...step,
      completed: step.autoCompleted || checklistProgress[step.id] === true,
    }))

    setSteps(stepsWithStatus)

    // Find first incomplete step or default to first step
    const firstIncomplete = stepsWithStatus.find(s => !s.completed)
    setCurrentStep(firstIncomplete?.id || stepsWithStatus[0]?.id || null)

    // Check if all complete
    setAllComplete(stepsWithStatus.every(s => s.completed))

    setLoading(false)
  }

  const handleSelectStep = (stepId: string) => {
    setCurrentStep(stepId)
  }

  const handleMarkComplete = async (stepId: string) => {
    const supabase = createClient()

    // Update local state
    setSteps(prev => {
      const updated = prev.map(s =>
        s.id === stepId ? { ...s, completed: true } : s
      )
      // Check if all complete
      setAllComplete(updated.every(s => s.completed))
      return updated
    })

    // Move to next incomplete step
    const nextIncomplete = steps.find(s => s.id !== stepId && !s.completed)
    if (nextIncomplete) {
      setCurrentStep(nextIncomplete.id)
    }

    // Persist to user metadata
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const currentChecklist = (user.user_metadata?.onboarding_checklist as Record<string, boolean>) || {}
      await supabase.auth.updateUser({
        data: {
          onboarding_checklist: {
            ...currentChecklist,
            [stepId]: true,
          },
        },
      })
    }
  }

  const currentStepData = steps.find(s => s.id === currentStep)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
          Complete these steps to start integrating with Soledgic
        </p>
      </div>

      {/* All complete banner */}
      {allComplete && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Rocket className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground mb-1">
                You&apos;re all set!
              </h2>
              <p className="text-muted-foreground mb-4">
                You&apos;ve completed all the setup steps. Your integration is ready to go.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/docs/api"
                  className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  API Documentation
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Checklist */}
        <div>
          <Checklist
            steps={steps}
            currentStep={currentStep}
            onSelectStep={handleSelectStep}
            onMarkComplete={handleMarkComplete}
          />

          {/* Quick links */}
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h3 className="text-sm font-medium text-foreground mb-3">Quick Links</h3>
            <div className="space-y-2">
              <Link
                href="/settings/api-keys"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View API Keys
              </Link>
              <Link
                href="/docs/api"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                API Reference
              </Link>
              <Link
                href="/dashboard/transactions"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View Transactions
              </Link>
            </div>
          </div>
        </div>

        {/* Right: API Tester */}
        <div>
          {currentStepData && (
            <ApiTester
              stepId={currentStepData.id}
              stepTitle={currentStepData.title}
              codeExample={currentStepData.codeExample}
              apiKey={apiKey}
              onSuccess={() => handleMarkComplete(currentStepData.id)}
            />
          )}

          {/* Tips */}
          <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">Tips</h3>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li>• Test API keys create sandbox data with no billing impact</li>
              <li>• All test data is isolated from your live environment</li>
              <li>• You can skip steps and come back to them later</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
