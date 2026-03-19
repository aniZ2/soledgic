import {
  LayoutDashboard,
  BookOpen,
  ArrowLeftRight,
  FileText,
  Settings,
  CreditCard,
  Users,
  Wallet,
  WalletCards,
  Plug,
  Receipt,
  Bell,
  Shield,
  ShieldCheck,
  ShieldAlert,
  BellRing,
  PiggyBank,
  Repeat,
  Percent,
  HandCoins,
  TrendingUp,
  Banknote,
  Calculator,
  ClipboardCheck,
  UserCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
}

export interface NavSection {
  label: string | null  // null = no label (top-level items)
  items: NavItem[]
}

export const dashboardNavigation: NavSection[] = [
  {
    label: null,
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Connect', href: '/connect', icon: Plug },
    ],
  },
  {
    label: 'Money In / Out',
    items: [
      { name: 'Transactions', href: '/dashboard/transactions', icon: ArrowLeftRight },
      { name: 'Creators', href: '/dashboard/creators', icon: Users },
      { name: 'Earnings', href: '/dashboard/earnings', icon: TrendingUp },
      { name: 'Payouts', href: '/dashboard/payouts', icon: Wallet },
    ],
  },
  {
    label: 'Books',
    items: [
      { name: 'Ledgers', href: '/ledgers', icon: BookOpen },
      { name: 'Expenses', href: '/dashboard/expenses', icon: Receipt },
      { name: 'Invoices', href: '/dashboard/invoices', icon: FileText },
{ name: 'Wallets', href: '/dashboard/wallets', icon: WalletCards },
      { name: 'Holds', href: '/dashboard/holds', icon: HandCoins },
      { name: 'Reports', href: '/dashboard/reports', icon: FileText },
      { name: 'Compliance', href: '/dashboard/compliance', icon: ShieldCheck },
    ],
  },
  {
    label: 'Tax',
    items: [
      { name: 'Tax Summary', href: '/dashboard/tax/summary', icon: Calculator },
      { name: 'Documents', href: '/dashboard/tax/documents', icon: FileText },
    ],
  },
  {
    label: 'Admin',
    items: [
      { name: 'KYC/KYB Review', href: '/dashboard/admin/compliance', icon: ShieldCheck },
      { name: 'Risk Monitor', href: '/dashboard/admin/risk', icon: ShieldAlert },
      { name: 'Security Events', href: '/dashboard/admin/security-events', icon: Shield },
      { name: 'Platform Payouts', href: '/dashboard/admin/platform-payouts', icon: Banknote },
      { name: 'Creator Verification', href: '/dashboard/admin/verify', icon: UserCheck },
      { name: '1099 Overview', href: '/dashboard/tax/1099', icon: FileText },
      { name: 'W-9 Status', href: '/dashboard/tax/w9', icon: ClipboardCheck },
      { name: 'Tax Calculations', href: '/dashboard/tax/calculations', icon: Calculator },
    ],
  },
  {
    label: null,
    items: [
      { name: 'Billing', href: '/billing', icon: CreditCard },
      { name: 'Audit Log', href: '/settings/audit-log', icon: Shield },
      { name: 'Alerts', href: '/settings/alerts', icon: BellRing },
      { name: 'Fraud Policies', href: '/settings/fraud-policies', icon: ShieldAlert },
      { name: 'Budgets', href: '/settings/budgets', icon: PiggyBank },
      { name: 'Recurring', href: '/settings/recurring', icon: Repeat },
      { name: 'Splits', href: '/settings/splits', icon: Percent },
      { name: 'Notifications', href: '/settings/notifications', icon: Bell },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
]

/** Flat list for backward compatibility (e.g. mobile nav, route matching). */
export const dashboardNavigationFlat: NavItem[] = dashboardNavigation.flatMap((s) => s.items)

export const creatorPortalNavigation: NavSection[] = [
  {
    label: null,
    items: [
      { name: 'Dashboard', href: '/creator', icon: LayoutDashboard },
      { name: 'Earnings', href: '/creator/earnings', icon: Wallet },
      { name: 'Statements', href: '/creator/statements', icon: FileText },
      { name: 'Payouts', href: '/creator/payouts', icon: Receipt },
      { name: 'Verification', href: '/creator/verification', icon: ShieldCheck },
      { name: 'Settings', href: '/creator/settings', icon: Settings },
    ],
  },
]

/** Flat list for creator portal. */
export const creatorPortalNavigationFlat: NavItem[] = creatorPortalNavigation.flatMap((s) => s.items)
