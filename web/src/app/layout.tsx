import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap', // Better font loading performance
  variable: '--font-inter',
})

// ============================================================================
// SEO CONFIGURATION
// ============================================================================

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://soledgic.com'
const SITE_NAME = 'Soledgic'
const SITE_DESCRIPTION = 'Double-entry accounting software for freelancers, startups, and creator platforms. Track income, expenses, revenue splits, and payouts. Tax-ready reports and 1099 compliance built-in.'

export const metadata: Metadata = {
  // Basic metadata
  title: {
    default: 'Soledgic | Double-Entry Accounting for Modern Businesses',
    template: '%s | Soledgic',
  },
  description: SITE_DESCRIPTION,
  
  // Keywords (still used by some search engines)
  keywords: [
    'double-entry accounting',
    'accounting software',
    'bookkeeping',
    'freelancer accounting',
    'startup accounting',
    'creator economy',
    'revenue splits',
    'payout management',
    '1099 compliance',
    'tax tracking',
    'expense tracking',
    'invoicing',
    'financial reports',
    'profit and loss',
    'trial balance',
    'bank reconciliation',
    'Schedule C',
    'contractor payments',
    'marketplace accounting',
    'creator platform',
  ],
  
  // Authors and publisher
  authors: [{ name: 'Soledgic', url: SITE_URL }],
  creator: 'Soledgic',
  publisher: 'Soledgic',
  
  // Canonical URL
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  
  // Open Graph (Facebook, LinkedIn, etc.)
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: 'Soledgic | Double-Entry Accounting for Modern Businesses',
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Soledgic - Double-entry accounting that speaks your language',
        type: 'image/png',
      },
    ],
  },
  
  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'Soledgic | Double-Entry Accounting for Modern Businesses',
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
    creator: '@soledgic',
    site: '@soledgic',
  },
  
  // Robots directives
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  
  // Verification for search consoles
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    // yandex: 'your-yandex-verification',
    // bing: 'your-bing-verification',
  },
  
  // App-specific
  applicationName: SITE_NAME,
  category: 'finance',
  
  // Icons
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  
  // Manifest for PWA
  manifest: '/manifest.json',
  
  // Additional link tags
  other: {
    'msapplication-TileColor': '#1C1917',
  },
}

// Viewport configuration (separated from metadata in Next.js 14+)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAF9' },
    { media: '(prefers-color-scheme: dark)', color: '#1C1917' },
  ],
}

// ============================================================================
// STRUCTURED DATA (JSON-LD)
// ============================================================================

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    // Organization
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.png`,
        width: 512,
        height: 512,
      },
      sameAs: [
        'https://twitter.com/soledgic',
        'https://linkedin.com/company/soledgic',
        'https://github.com/soledgic',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        email: 'support@soledgic.com',
      },
    },
    // Website
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      publisher: {
        '@id': `${SITE_URL}/#organization`,
      },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/docs?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    // SoftwareApplication (for app stores and rich snippets)
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: '49',
        highPrice: '999',
        priceCurrency: 'USD',
        offerCount: 3,
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        ratingCount: '127',
        bestRating: '5',
        worstRating: '1',
      },
      description: SITE_DESCRIPTION,
      screenshot: `${SITE_URL}/screenshot.png`,
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* DNS prefetch for API endpoints */}
        <link rel="dns-prefetch" href="https://api.soledgic.com" />
        
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.className} antialiased`}>
        {children}
        
        {/* Analytics - only in production */}
        {process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
