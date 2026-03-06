// Soledgic: Sentry server-side error tracking
// Loaded automatically by @sentry/nextjs instrumentation

import * as Sentry from '@sentry/nextjs'

// PII patterns to strip before sending — must match client config
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,             // SSN
  /\b\d{2}-\d{7}\b/g,                    // EIN
  /eyJ[A-Za-z0-9_-]+/g,                  // JWT tokens
  /sk_[a-zA-Z0-9]+/g,                    // API keys
  /whsec_[a-zA-Z0-9]+/g,                 // Webhook secrets
  /sntrys_[a-zA-Z0-9]+/g,               // Sentry auth tokens
  /\b[A-Za-z0-9+/]{40,}\b/g,            // Long base64 strings
  /\/[^\s]+/g,                            // File paths
  /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, // IP addresses
]

function scrubPII(value: string): string {
  let result = value
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: 0.2,

  environment: process.env.NODE_ENV || 'production',

  beforeSend(event) {
    if (event.exception?.values) {
      for (const exception of event.exception.values) {
        if (exception.value) {
          exception.value = scrubPII(exception.value)
        }
      }
    }

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
