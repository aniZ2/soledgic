import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Soledgic — The Financial Backend for Creator Platforms',
  description: 'Accept payments, split revenue to creators, handle tax withholding, and pay out sellers — all tracked in an audit-ready double-entry ledger. One API replaces fragmented payment + accounting tooling and custom glue code.',
  keywords: ['payments', 'ledger', 'splits', 'payouts', 'API', 'double-entry', 'fintech', 'platform', 'creator economy', 'revenue share', 'marketplace payments'],
  authors: [{ name: 'Osifo Holdings L.L.C.' }],
  openGraph: {
    title: 'Soledgic — The Financial Backend for Creator Platforms',
    description: 'Accept payments, split revenue to creators, handle tax withholding, and pay out sellers — all tracked in an audit-ready double-entry ledger.',
    url: 'https://soledgic.com',
    siteName: 'Soledgic',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Soledgic — The Financial Backend for Creator Platforms',
    description: 'Accept payments, split revenue to creators, handle tax withholding, and pay out sellers — all tracked in an audit-ready double-entry ledger.',
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
