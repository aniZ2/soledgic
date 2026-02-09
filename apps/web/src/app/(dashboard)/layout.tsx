import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import {
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
  Rocket
} from 'lucide-react'
import { getLivemode, getActiveLedgerGroupId, getReadonly } from '@/lib/livemode-server'
import { LiveModeToggle } from '@/components/livemode-toggle'
import { LivemodeProvider } from '@/components/livemode-provider'
import { isOverLedgerLimit } from '@/lib/entitlements'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { MobileNav } from '@/components/mobile-nav'

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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // getUser() validates with Supabase Auth server (reads httpOnly cookies server-side)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user's organization membership (only active memberships)
  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(
        id,
        name,
        slug,
        plan,
        status,
        trial_ends_at,
        max_ledgers,
        current_ledger_count
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  // If no organization, redirect to onboarding (unless already there)
  if (!membership?.organization) {
    const headersList = await headers()
    const pathname = headersList.get('x-pathname') || headersList.get('x-invoke-path') || ''
    // Don't redirect if already on onboarding to avoid loop
    if (!pathname.includes('/onboarding')) {
      redirect('/onboarding')
    }
    // Return minimal layout for onboarding
    return (
      <div className="min-h-screen bg-background">
        <main className="p-8">{children}</main>
      </div>
    )
  }

  const org = membership.organization as any
  const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()
  const readonly = await getReadonly()

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Navigation */}
      <MobileNav
        orgName={org.name}
        userName={userName}
        userEmail={user.email || ''}
        livemode={livemode}
      />

      {/* Desktop Sidebar - Hidden on mobile */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 border-r border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6 border-b border-border">
          <Link href="/dashboard" className="text-2xl font-bold text-primary">
            Soledgic
            {!livemode && (
              <span className="ml-1.5 text-sm font-medium text-amber-500">(Test)</span>
            )}
          </Link>
          <NotificationBell />
        </div>

        {/* Organization Selector */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                {org.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{org.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{org.plan} plan</p>
            </div>
          </div>
        </div>

        {/* Test / Live Toggle */}
        <div className="px-4 py-2 border-b border-border">
          <LiveModeToggle initialLivemode={livemode} activeLedgerGroupId={activeLedgerGroupId} />
        </div>

        <nav className="p-4 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {userName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {userName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>
          <Link
            href="/auth/signout"
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="pt-16 lg:pt-0 lg:pl-64">
        {readonly && (
          <div className="sticky top-0 z-20 bg-slate-700 text-white text-center text-sm font-medium py-2 px-4">
            READ-ONLY MODE — You are viewing a preview. All write operations are disabled.
          </div>
        )}
        {!livemode && (
          <div className={`sticky ${readonly ? 'top-9' : 'top-0'} z-10 bg-amber-500 text-white text-center text-sm font-medium py-2 px-4`}>
            TEST MODE — Data shown here is for testing only and won&apos;t affect your live environment.
          </div>
        )}
        {org.status === 'past_due' && (
          <div className="sticky top-0 z-[9] bg-amber-600 text-white text-center text-sm font-medium py-2 px-4">
            Your last payment didn&apos;t go through — we&apos;ll retry automatically.{' '}
            <Link href="/billing" className="underline hover:no-underline">
              Update your payment method
            </Link>{' '}
            to avoid any interruption.
          </div>
        )}
        {org.status === 'canceled' && (
          <div className="sticky top-0 z-[9] bg-slate-700 text-white text-center text-sm font-medium py-2 px-4">
            Your subscription has ended. Your data is safe — {' '}
            <Link href="/billing" className="underline hover:no-underline">
              choose a plan
            </Link>{' '}
            to pick up where you left off.
          </div>
        )}
        {isOverLedgerLimit(org) && (
          <div className="sticky top-0 z-[9] bg-amber-600 text-white text-center text-sm font-medium py-2 px-4">
            You have {org.current_ledger_count} of {org.max_ledgers} ledgers — new ledger creation is paused.{' '}
            <Link href="/billing" className="underline hover:no-underline">
              Upgrade your plan
            </Link>{' '}
            or archive a ledger to continue.
          </div>
        )}
        <div className="p-4 lg:p-8">
          <LivemodeProvider livemode={livemode} activeLedgerGroupId={activeLedgerGroupId} readonly={readonly}>
            {children}
          </LivemodeProvider>
        </div>
      </main>
    </div>
  )
}
