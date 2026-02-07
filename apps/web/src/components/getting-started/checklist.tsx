'use client'

import { useState } from 'react'
import { Check, Circle, ChevronRight, Building, Key, Users, ArrowLeftRight, Bell } from 'lucide-react'

export interface ChecklistStep {
  id: string
  title: string
  description: string
  icon: typeof Building
  completed: boolean
  autoCompleted?: boolean
  codeExample?: string
}

interface ChecklistProps {
  steps: ChecklistStep[]
  currentStep: string | null
  onSelectStep: (stepId: string) => void
  onMarkComplete: (stepId: string) => void
}

export function Checklist({ steps, currentStep, onSelectStep, onMarkComplete }: ChecklistProps) {
  const completedCount = steps.filter(s => s.completed).length
  const progress = (completedCount / steps.length) * 100

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Progress header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-foreground">Setup Checklist</h2>
          <span className="text-sm text-muted-foreground">
            {completedCount} of {steps.length} complete
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div className="divide-y divide-border">
        {steps.map((step, index) => {
          const Icon = step.icon
          const isActive = currentStep === step.id
          const isPending = !step.completed && currentStep !== step.id

          return (
            <button
              key={step.id}
              onClick={() => onSelectStep(step.id)}
              className={`w-full px-6 py-4 flex items-center gap-4 text-left transition-colors ${
                isActive ? 'bg-primary/5' : 'hover:bg-muted/50'
              }`}
            >
              {/* Status indicator */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                step.completed
                  ? 'bg-green-500/10 text-green-600'
                  : isActive
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}>
                {step.completed ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className={`font-medium ${
                    step.completed ? 'text-muted-foreground' : 'text-foreground'
                  }`}>
                    {step.title}
                  </span>
                  {step.autoCompleted && step.completed && (
                    <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">
                      Auto-completed
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {step.description}
                </p>
              </div>

              {/* Arrow */}
              <ChevronRight className={`w-5 h-5 flex-shrink-0 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const defaultSteps: Omit<ChecklistStep, 'completed'>[] = [
  {
    id: 'organization',
    title: 'Create organization',
    description: 'Set up your organization to manage ledgers and team members',
    icon: Building,
    autoCompleted: true,
  },
  {
    id: 'api-keys',
    title: 'Get API keys',
    description: 'Generate test and live API keys for authentication',
    icon: Key,
    autoCompleted: true,
  },
  {
    id: 'creator',
    title: 'Create your first creator',
    description: 'Add a creator/payee to track earnings and payouts',
    icon: Users,
    codeExample: `curl -X POST https://soledgic.supabase.co/functions/v1/create-creator \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "creator_id": "creator_1",
    "name": "Jane Smith",
    "email": "jane@example.com"
  }'`,
  },
  {
    id: 'transaction',
    title: 'Record your first transaction',
    description: 'Record a sale to see the double-entry accounting in action',
    icon: ArrowLeftRight,
    codeExample: `curl -X POST https://soledgic.supabase.co/functions/v1/record-sale \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "reference_id": "sale_123",
    "creator_id": "creator_1",
    "amount": 2999,
    "description": "Digital product sale"
  }'`,
  },
  {
    id: 'webhooks',
    title: 'Set up webhooks',
    description: 'Get real-time notifications when events occur in your ledger',
    icon: Bell,
    codeExample: `curl -X POST https://soledgic.supabase.co/functions/v1/configure-webhook \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "url": "https://your-server.com/webhooks/soledgic",
    "events": ["sale.created", "payout.completed"]
  }'`,
  },
]
