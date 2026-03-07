// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Proxy api.soledgic.com/v1/* → Supabase Edge Functions
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/v1/:path*',
          has: [{ type: 'host', value: 'api.soledgic.com' }],
          destination: 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1/:path*',
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },

  // Redirect www to non-www to prevent cookie domain issues
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.soledgic.com' }],
        destination: 'https://soledgic.com/:path*',
        permanent: true,
      },
    ]
  },

  // Security headers for all routes
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
          },
	          {
	            key: 'Content-Security-Policy',
	            value: [
	              "default-src 'self'",
	              "script-src 'self' 'unsafe-inline' https://cdn.teller.io https://cdn.jsdelivr.net",
	              "style-src 'self' 'unsafe-inline'",
	              "img-src 'self' data: blob: https:",
	              "font-src 'self' data:",
	              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.teller.io",
	              "frame-src 'self' https://cdn.teller.io",
	              "frame-ancestors 'none'",
	              "base-uri 'self'",
	              "form-action 'self'",
              "object-src 'none'",
	            ].join('; ')
	          }
        ],
      },
      // Stricter headers for API routes
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, private'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
          }
        ]
      }
    ]
  },
}

module.exports = withSentryConfig(nextConfig, {
  // Suppress noisy build logs unless in CI
  silent: !process.env.CI,

  // Upload larger set of source maps for better stack traces
  widenClientFileUpload: true,

  // Hide source maps from browser devtools
  hideSourceMaps: true,

  // Route Sentry requests through /monitoring to avoid ad blockers
  // Goes to 'self' origin so no CSP change needed
  tunnelRoute: '/monitoring',

  // Sentry org/project for source map uploads (CI only)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
})
