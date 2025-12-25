import { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://soledgic.com'

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

export default function sitemap(): MetadataRoute.Sitemap {
  const currentDate = new Date().toISOString()
  
  // Static marketing pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/signup`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]
  
  // Documentation index
  const docPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/docs`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
  ]
  
  // Getting Started pages
  const gettingStartedPages: MetadataRoute.Sitemap = [
    'quickstart',
    'authentication',
    'concepts',
  ].map(slug => ({
    url: `${SITE_URL}/docs/${slug}`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as ChangeFrequency,
    priority: 0.8,
  }))
  
  // API Reference pages
  const apiPages: MetadataRoute.Sitemap = [
    'record-sale',
    'record-expense',
    'record-income',
    'record-refund',
    'reverse-transaction',
    'process-payout',
    'get-balance',
    'get-transactions',
    'trial-balance',
    'profit-loss',
    'close-period',
    'reconcile',
    'webhooks',
  ].map(endpoint => ({
    url: `${SITE_URL}/docs/api/${endpoint}`,
    lastModified: currentDate,
    changeFrequency: 'monthly' as ChangeFrequency,
    priority: 0.7,
  }))
  
  // Add API index page
  apiPages.unshift({
    url: `${SITE_URL}/docs/api`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as ChangeFrequency,
    priority: 0.8,
  })
  
  // Guide pages
  const guidePages: MetadataRoute.Sitemap = [
    'marketplace',
    'tax-exports',
    'reconciliation',
    'period-closing',
    'contractor-payments',
    'revenue-splits',
  ].map(guide => ({
    url: `${SITE_URL}/docs/guides/${guide}`,
    lastModified: currentDate,
    changeFrequency: 'monthly' as ChangeFrequency,
    priority: 0.7,
  }))
  
  return [
    ...staticPages,
    ...docPages,
    ...gettingStartedPages,
    ...apiPages,
    ...guidePages,
  ]
}
