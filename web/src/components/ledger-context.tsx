'use client'

import React, { createContext, useContext, ReactNode } from 'react'

type LedgerMode = 'standard' | 'marketplace'

interface LedgerLabels {
  inflowTab: string
  outflowTab: string
  directoryTab: string
  primaryInflow: string
  primaryOutflow: string
  primaryEntity: string
  secondaryEntity: string
  recordInflowAction: string
  recordOutflowAction: string
}

interface LedgerContextType {
  mode: LedgerMode
  ledgerId: string
  businessName: string
  labels: LedgerLabels
}

const standardLabels: LedgerLabels = {
  inflowTab: 'Revenue',
  outflowTab: 'Expenses',
  directoryTab: 'Contacts',
  primaryInflow: 'Invoices & Payments',
  primaryOutflow: 'Bills & Expenses',
  primaryEntity: 'Clients',
  secondaryEntity: 'Vendors',
  recordInflowAction: 'Record Income',
  recordOutflowAction: 'Record Expense',
}

const marketplaceLabels: LedgerLabels = {
  inflowTab: 'Sales',
  outflowTab: 'Payouts',
  directoryTab: 'People',
  primaryInflow: 'Sales & Splits',
  primaryOutflow: 'Creator Payouts',
  primaryEntity: 'Creators',
  secondaryEntity: 'Partners',
  recordInflowAction: 'Record Sale',
  recordOutflowAction: 'Process Payout',
}

const LedgerContext = createContext<LedgerContextType | null>(null)

export function LedgerProvider({ children, mode, ledgerId, businessName }: {
  children: ReactNode
  mode: LedgerMode
  ledgerId: string
  businessName: string
}) {
  const labels = mode === 'marketplace' ? marketplaceLabels : standardLabels
  return (
    <LedgerContext.Provider value={{ mode, ledgerId, businessName, labels }}>
      {children}
    </LedgerContext.Provider>
  )
}

export function useLedger() {
  const context = useContext(LedgerContext)
  if (!context) throw new Error('useLedger must be used within LedgerProvider')
  return context
}

export function useIsMarketplace() {
  const { mode } = useLedger()
  return mode === 'marketplace'
}
