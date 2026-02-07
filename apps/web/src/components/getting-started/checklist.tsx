'use client'

import { Check, Circle, ChevronRight } from 'lucide-react'

export interface ChecklistStep {
  id: string
  title: string
  description: string
  completed: boolean
  action?: string
}

interface ChecklistProps {
  steps: ChecklistStep[]
  currentStep: string | null
  onStepClick: (stepId: string) => void
}

export function Checklist({ steps, currentStep, onStepClick }: ChecklistProps) {
  const completedCount = steps.filter(s => s.completed).length
  const progress = (completedCount / steps.length) * 100

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Progress Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-foreground">Setup Progress</h2>
          <span className="text-sm text-muted-foreground">
            {completedCount} of {steps.length} complete
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="divide-y divide-border">
        {steps.map((step, index) => {
          const isActive = currentStep === step.id
          const isPending = !step.completed && currentStep !== step.id

          return (
            <button
              key={step.id}
              onClick={() => onStepClick(step.id)}
              className={`w-full px-6 py-4 flex items-center gap-4 text-left transition-colors ${
                isActive
                  ? 'bg-primary/5'
                  : isPending
                  ? 'hover:bg-accent/50'
                  : 'hover:bg-accent/50'
              }`}
            >
              {/* Step Number / Check */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                step.completed
                  ? 'bg-green-500 text-white'
                  : isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {step.completed ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <h3 className={`font-medium ${
                  step.completed
                    ? 'text-muted-foreground line-through'
                    : 'text-foreground'
                }`}>
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground truncate">
                  {step.description}
                </p>
              </div>

              {/* Arrow */}
              <ChevronRight className={`w-5 h-5 shrink-0 ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`} />
            </button>
          )
        })}
      </div>

      {/* Completion Message */}
      {completedCount === steps.length && (
        <div className="px-6 py-4 border-t border-border bg-green-500/10">
          <p className="text-sm text-green-600 font-medium">
            You&apos;re all set! Your integration is ready to go.
          </p>
        </div>
      )}
    </div>
  )
}
