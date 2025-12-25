import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Soledge - Sovereign Financial Truth',
  description: 'The accounting API for platforms that move money. Double-entry ledger, expense tracking, reconciliation, and audit-ready exports.',
  keywords: ['accounting', 'ledger', 'API', 'double-entry', 'bookkeeping', 'fintech'],
  authors: [{ name: 'Soledge' }],
  openGraph: {
    title: 'Soledge - Sovereign Financial Truth',
    description: 'The accounting API for platforms that move money.',
    url: 'https://soledge.com',
    siteName: 'Soledge',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Soledge - Sovereign Financial Truth',
    description: 'The accounting API for platforms that move money.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
