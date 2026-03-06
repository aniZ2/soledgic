// Soledgic: Sentry browser-side error tracking
// Loaded automatically by @sentry/nextjs instrumentation

import * as Sentry from '@sentry/nextjs'

// PII patterns to strip from error events before sending
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,             // SSN
  /\b\d{2}-\d{7}\b/g,                    // EIN
  /eyJ[A-Za-z0-9_-]+/g,                  // JWT tokens
  /sk_[a-zA-Z0-9]+/g,                    // API keys (sk_live_*, sk_test_*)
  /whsec_[a-zA-Z0-9]+/g,                 // Webhook secrets
  /sntrys_[a-zA-Z0-9]+/g,               // Sentry auth tokens
  /\b[A-Za-z0-9+/]{40,}\b/g,            // Long base64 strings (potential secrets)
]

function scrubPII(value: string): string {
  let result = value
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 0.5,
  replaysSessionSampleRate: 0,

  environment: process.env.NODE_ENV || 'production',

  beforeSend(event) {
    // Scrub exception messages
    if (event.exception?.values) {
      for (const exception of event.exception.values) {
        if (exception.value) {
          exception.value = scrubPII(exception.value)
        }
      }
    }

    // Scrub breadcrumb messages
    if (event.breadcrumbs) {
      for (const breadcrumb of event.breadcrumbs) {
        if (breadcrumb.message) {
          breadcrumb.message = scrubPII(breadcrumb.message)
        }
      }
    }

    return event
  },
})
