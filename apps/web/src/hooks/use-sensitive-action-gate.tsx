'use client'

import { useCallback, useState } from 'react'
import {
  isSensitiveActionChallenge,
  type SensitiveActionChallenge,
} from '@/lib/sensitive-action-shared'

type RetryAction = () => Promise<unknown> | unknown

export function useSensitiveActionGate() {
  const [challenge, setChallenge] = useState<SensitiveActionChallenge | null>(null)
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null)

  const dismissChallenge = useCallback(() => {
    setChallenge(null)
    setRetryAction(null)
  }, [])

  const captureChallenge = useCallback((payload: unknown, retry: RetryAction) => {
    if (!isSensitiveActionChallenge(payload)) return false

    setChallenge(payload)
    setRetryAction(() => retry)
    return true
  }, [])

  const handleProtectedResponse = useCallback(
    (response: Response, payload: unknown, retry: RetryAction) => {
      if (response.status !== 403) return false
      return captureChallenge(payload, retry)
    },
    [captureChallenge],
  )

  const retryVerifiedAction = useCallback(async () => {
    const action = retryAction
    dismissChallenge()
    if (action) {
      await action()
    }
  }, [dismissChallenge, retryAction])

  return {
    challenge,
    dismissChallenge,
    handleProtectedResponse,
    retryVerifiedAction,
  }
}
