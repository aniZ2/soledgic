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
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
}

export const dashboardNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Connect', href: '/connect', icon: Plug },
  { name: 'Ledgers', href: '/ledgers', icon: BookOpen },
  { name: 'Transactions', href: '/dashboard/transactions', icon: ArrowLeftRight },
  { name: 'Creators', href: '/dashboard/creators', icon: Users },
  { name: 'Reports', href: '/dashboard/reports', icon: FileText },
  { name: 'Reconciliation', href: '/dashboard/reconciliation', icon: Scale },
  { name: 'Payouts', href: '/dashboard/payouts', icon: Wallet },
  { name: 'Wallets', href: '/dashboard/wallets', icon: WalletCards },
  { name: 'Billing', href: '/billing', icon: CreditCard },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export const creatorPortalNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/creator', icon: LayoutDashboard },
  { name: 'Earnings', href: '/creator/earnings', icon: Wallet },
  { name: 'Statements', href: '/creator/statements', icon: FileText },
  { name: 'Payouts', href: '/creator/payouts', icon: Receipt },
  { name: 'Settings', href: '/creator/settings', icon: Settings },
]
