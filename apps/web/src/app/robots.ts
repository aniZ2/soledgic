import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/docs/', '/pricing', '/terms', '/privacy', '/refund-policy', '/acceptable-use'],
        disallow: [
          '/ledgers/',
          '/settings/',
          '/onboarding',
          '/creator/',
          '/api/',
          '/pay/',
        ],
      },
    ],
    sitemap: 'https://soledgic.com/sitemap.xml',
  }
}
