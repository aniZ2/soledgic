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
  Scale,
  Plug,
  Receipt,
  Bell,
  Shield,
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
      { name: 'Payouts', href: '/dashboard/payouts', icon: Wallet },
      { name: 'Expenses', href: '/dashboard/expenses', icon: Receipt },
    ],
  },
  {
    label: 'Books',
    items: [
      { name: 'Ledgers', href: '/ledgers', icon: BookOpen },
      { name: 'Wallets', href: '/dashboard/wallets', icon: WalletCards },
      { name: 'Reconciliation', href: '/dashboard/reconciliation', icon: Scale },
      { name: 'Reports', href: '/dashboard/reports', icon: FileText },
    ],
  },
  {
    label: null,
    items: [
      { name: 'Billing', href: '/billing', icon: CreditCard },
      { name: 'Audit Log', href: '/settings/audit-log', icon: Shield },
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
      { name: 'Settings', href: '/creator/settings', icon: Settings },
    ],
  },
]

/** Flat list for creator portal. */
export const creatorPortalNavigationFlat: NavItem[] = creatorPortalNavigation.flatMap((s) => s.items)
