'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  X,
  LayoutDashboard,
  BookOpen,
  ArrowLeftRight,
  FileText,
  Settings,
  LogOut,
  CreditCard,
  Users,
  Wallet,
  Scale,
  Rocket,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Getting Started', href: '/getting-started', icon: Rocket },
  { name: 'Ledgers', href: '/ledgers', icon: BookOpen },
  { name: 'Transactions', href: '/dashboard/transactions', icon: ArrowLeftRight },
  { name: 'Creators', href: '/dashboard/creators', icon: Users },
  { name: 'Reports', href: '/dashboard/reports', icon: FileText },
  { name: 'Reconciliation', href: '/dashboard/reconciliation', icon: Scale },
  { name: 'Payouts', href: '/dashboard/payouts', icon: Wallet },
  { name: 'Billing', href: '/billing', icon: CreditCard },
  { name: 'Settings', href: '/settings', icon: Settings },
]

interface MobileNavProps {
  orgName: string
  userName: string
  userEmail: string
  livemode: boolean
}

export function MobileNav({ orgName, userName, userEmail, livemode }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-card border-b border-border h-16 px-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-xl font-bold text-primary">
          Soledgic
          {!livemode && (
            <span className="ml-1 text-xs font-medium text-amber-500">(Test)</span>
          )}
        </Link>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Menu Drawer */}
      <nav
        className={`lg:hidden fixed top-0 right-0 z-40 w-72 h-full bg-card border-l border-border transform transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          <span className="font-semibold text-foreground">{orgName}</span>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-12rem)]">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            )
          })}
        </div>

        {/* User Info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {userName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            </div>
          </div>
          <Link
            href="/auth/signout"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Link>
        </div>
      </nav>
    </>
  )
}
