'use client'

import { useState } from 'react'
import { Play, Check, Copy, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface ApiTesterProps {
  stepId: string
  stepTitle: string
  codeExample?: string
  apiKey: string
  onSuccess: () => void
}

export function ApiTester({ stepId, stepTitle, codeExample, apiKey, onSuccess }: ApiTesterProps) {
  const [running, setRunning] = useState(false)
  const [response, setResponse] = useState<{ success: boolean; data: any } | null>(null)
  const [copied, setCopied] = useState(false)
  const [showResponse, setShowResponse] = useState(true)

  // Replace placeholder with actual API key
  const displayCode = codeExample?.replace('YOUR_API_KEY', apiKey) || ''

  const copyCode = async () => {
    await navigator.clipboard.writeText(displayCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const runExample = async () => {
    if (!codeExample) return

    setRunning(true)
    setResponse(null)

    try {
      // Parse the curl command to extract the endpoint and payload
      const urlMatch = codeExample.match(/https:\/\/[^\s\\]+/)
      const dataMatch = codeExample.match(/-d\s+'(\{[\s\S]*?\})'/)

      if (!urlMatch) {
        setResponse({ success: false, data: { error: 'Could not parse endpoint URL' } })
        setRunning(false)
        return
      }

      const endpoint = urlMatch[0]
      let payload = {}

      if (dataMatch) {
        try {
          payload = JSON.parse(dataMatch[1].replace(/\n/g, ''))
        } catch {
          // Use empty payload if parsing fails
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (res.ok) {
        setResponse({ success: true, data })
        // Wait a moment then trigger the success callback
        setTimeout(() => onSuccess(), 1500)
      } else {
        setResponse({ success: false, data })
      }
    } catch (err: any) {
      setResponse({
        success: false,
        data: { error: err.message || 'Request failed' },
      })
    }

    setRunning(false)
  }

  if (!codeExample) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
            <Check className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{stepTitle}</h3>
            <p className="text-sm text-muted-foreground">Automatically completed during onboarding</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          This step was completed when you set up your account. Move on to the next step to continue your integration.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground">{stepTitle}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Try this API call to complete the step
        </p>
      </div>

      {/* Code block */}
      <div className="relative">
        <div className="bg-slate-900 p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap">
            {displayCode}
          </pre>
        </div>
        <button
          onClick={copyCode}
          className="absolute top-3 right-3 p-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-border flex items-center gap-3">
        <button
          onClick={runExample}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Example
            </>
          )}
        </button>
        <span className="text-sm text-muted-foreground">
          Uses your test API key
        </span>
      </div>

      {/* Response */}
      {response && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowResponse(!showResponse)}
            className="w-full px-6 py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {response.success ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${
                response.success ? 'text-green-600' : 'text-red-500'
              }`}>
                {response.success ? 'Success!' : 'Error'}
              </span>
            </div>
            {showResponse ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {showResponse && (
            <div className="px-6 pb-4">
              <div className={`rounded-lg p-4 overflow-x-auto ${
                response.success ? 'bg-green-500/10' : 'bg-red-500/10'
              }`}>
                <pre className="text-sm font-mono text-foreground whitespace-pre-wrap">
                  {JSON.stringify(response.data, null, 2)}
                </pre>
              </div>
              {response.success && (
                <p className="text-sm text-green-600 mt-3 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Step completed! Check the next step.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
