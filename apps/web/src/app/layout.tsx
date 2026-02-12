import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Space_Grotesk, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
})
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-ibm-mono',
})

export const metadata: Metadata = {
  title: 'Soledgic — The Financial Backend for Creator Platforms',
  description: 'Accept payments, split revenue to creators, handle tax withholding, and pay out sellers — all tracked in an audit-ready double-entry ledger. One API replaces Stripe + QuickBooks + custom code.',
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
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.className} ${jetbrainsMono.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
        {children}
      </body>
    </html>
  )
}
