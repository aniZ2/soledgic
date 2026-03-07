export type ChangeType = 'added' | 'changed' | 'fixed' | 'deprecated' | 'removed' | 'security'

export interface ChangelogSection {
  type: ChangeType
  items: string[]
}

export interface ChangelogEntry {
  version: string
  date: string
  status: 'current' | 'deprecated'
  summary: string
  changes: ChangelogSection[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: '2026-03-01',
    date: 'March 1, 2026',
    status: 'current',
    summary: 'Initial stable release of the Soledgic API.',
    changes: [
      {
        type: 'added',
        items: [
          'Checkout sessions — create and manage payment links for creators',
          'Payouts — automated and manual disbursements to creator bank accounts',
          'Refunds — full and partial reversals with idempotency protection',
          'Webhooks — real-time event delivery for payment lifecycle events',
          'API key authentication with per-key rate limiting',
          'Organization and creator management endpoints',
          'Transaction history and reporting endpoints',
          'Bank account tokenization and verification',
          'Idempotency support on all write operations',
          'OpenAPI 3.1 specification available at /openapi.yaml',
        ],
      },
      {
        type: 'security',
        items: [
          'All endpoints require HTTPS',
          'Rate limiting on all authenticated endpoints',
          'IP-based blocking for abuse prevention',
          'Request signing verification for webhook deliveries',
        ],
      },
    ],
  },
]
