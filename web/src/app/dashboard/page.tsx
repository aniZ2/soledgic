import { LedgerProvider } from '@/components/ledger-context'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DashboardHome } from '@/components/dashboard-home'

export default function DashboardPage() {
  // For now, hardcode Booklyverse - in production, get from auth
  return (
    <LedgerProvider 
      mode="marketplace" 
      ledgerId="0a885204-e07a-48c1-97e9-495ac96a2581"
      businessName="Booklyverse"
    >
      <DashboardLayout>
        <DashboardHome />
      </DashboardLayout>
    </LedgerProvider>
  )
}
