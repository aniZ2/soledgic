import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Soledgic — Financial Infrastructure for Digital Platforms',
  description: 'Soledgic gives digital platforms one system for checkout, revenue splits, payouts, ledgers, reconciliation, reporting, and webhooks. Built for marketplaces, creator platforms, and embedded-payment products.',
  keywords: ['payments', 'ledger', 'splits', 'payouts', 'API', 'double-entry', 'fintech', 'platform', 'creator economy', 'revenue share', 'marketplace payments', 'embedded finance', 'digital platforms', 'reconciliation'],
  authors: [{ name: 'Osifo Holdings L.L.C.' }],
  openGraph: {
    title: 'Soledgic — Financial Infrastructure for Digital Platforms',
    description: 'Checkout, revenue splits, payouts, ledgers, reconciliation, reporting, and webhooks in one system for digital platforms.',
    url: 'https://soledgic.com',
    siteName: 'Soledgic',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Soledgic — Financial Infrastructure for Digital Platforms',
    description: 'Checkout, revenue splits, payouts, ledgers, reconciliation, reporting, and webhooks in one system for digital platforms.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
