import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Soledgic - Payments, Splits, and Ledger for Platforms',
  description: 'Accept payments, split revenue, pay out sellers, and track every dollar with a built-in double-entry ledger. The financial backend for platforms.',
  keywords: ['payments', 'ledger', 'splits', 'payouts', 'API', 'double-entry', 'fintech', 'platform'],
  authors: [{ name: 'Soledgic' }],
  openGraph: {
    title: 'Soledgic - Payments, Splits, and Ledger for Platforms',
    description: 'Accept payments, split revenue, pay out sellers, and track every dollar with a built-in double-entry ledger.',
    url: 'https://soledgic.com',
    siteName: 'Soledgic',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Soledgic - Payments, Splits, and Ledger for Platforms',
    description: 'Accept payments, split revenue, pay out sellers, and track every dollar with a built-in double-entry ledger.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  )
}
