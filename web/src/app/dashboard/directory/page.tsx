'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { DirectoryPage } from '@/components/directory-page'
import { LedgerProvider } from '@/components/ledger-context'

export default function DirectoryRoute() {
  return (
    <LedgerProvider mode="marketplace" ledgerId="0a885204-e07a-48c1-97e9-495ac96a2581" businessName="Booklyverse">
      <DashboardLayout>
        <DirectoryPage />
      </DashboardLayout>
    </LedgerProvider>
  )
}
