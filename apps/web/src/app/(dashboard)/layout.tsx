import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { getLivemode, getActiveLedgerGroupId, getReadonly } from '@/lib/livemode-server'
import { LiveModeToggle } from '@/components/livemode-toggle'
import { LivemodeProvider } from '@/components/livemode-provider'
import { ToastProvider } from '@/components/notifications/toast-provider'
import { isOverLedgerLimit } from '@/lib/entitlements'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { MobileNav } from '@/components/mobile-nav'
import { ThemeToggle } from '@/components/theme-toggle'
import { dashboardNavigation, type NavSection } from '@/lib/navigation'
import { isPlatformOperatorUser } from '@/lib/internal-platforms'

interface OrganizationSummary {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  trial_ends_at: string | null
  max_ledgers: number
  current_ledger_count: number
  kyc_status: string | null
}

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toNullableStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toNumberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeOrganization(value: unknown): OrganizationSummary | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? normalizeOrganization(value[0]) : null
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const id = toStringValue(record.id)
  const name = toStringValue(record.name)
  const slug = toStringValue(record.slug)
  const plan = toStringValue(record.plan)
  const status = toStringValue(record.status)

  if (!id || !name || !slug || !plan || !status) {
    return null
  }

  return {
    id,
    name,
    slug,
    plan,
    status,
    trial_ends_at: toNullableStringValue(record.trial_ends_at),
    max_ledgers: toNumberValue(record.max_ledgers, -1),
    current_ledger_count: toNumberValue(record.current_ledger_count, 0),
    kyc_status: toNullableStringValue(record.kyc_status),
  }
}

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
        current_ledger_count,
        kyc_status
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

  const org = normalizeOrganization(membership.organization)
  if (!org) {
    redirect('/onboarding')
  }
  const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()
  const readonly = await getReadonly()
  const isPlatformAdmin = isPlatformOperatorUser(user)

  // Filter nav: hide Admin section from non-platform operators
  const filteredNavigation: NavSection[] = dashboardNavigation.filter((section) => {
    if (section.label === 'Admin' && !isPlatformAdmin) return false
    return true
  })

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
      <aside className="hidden lg:flex lg:flex-col fixed inset-y-0 left-0 w-64 border-r border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6 border-b border-border flex-shrink-0">
          <Link href="/dashboard" className="text-2xl font-bold text-primary">
            Soledgic
            {!livemode && (
              <span className="ml-1.5 text-sm font-medium text-amber-500">(Sandbox)</span>
            )}
          </Link>
          <NotificationBell />
        </div>

        {/* Organization Selector */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
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

        {/* Sandbox / Live Toggle */}
        <div className="px-4 py-2 border-b border-border flex-shrink-0">
          <LiveModeToggle initialLivemode={livemode} activeLedgerGroupId={activeLedgerGroupId} kycStatus={org.kyc_status} />
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-4">
          {filteredNavigation.map((section, idx) => (
            <div key={section.label ?? `section-${idx}`}>
              {section.label && (
                <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex-shrink-0 p-4 border-t border-border">
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
            <ThemeToggle />
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
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
            SANDBOX — Data shown here is for testing only and won&apos;t affect your live environment.
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
            Your billing account is inactive. Your data is safe — {' '}
            <Link href="/billing" className="underline hover:no-underline">
              update billing
            </Link>{' '}
            to continue paid usage.
          </div>
        )}
        {org.kyc_status && org.kyc_status !== 'approved' && (
          <div className="sticky top-0 z-[9] bg-blue-600 text-white text-center text-sm font-medium py-2 px-4">
            {org.kyc_status === 'suspended'
              ? 'Your account has been suspended. Contact support for assistance.'
              : org.kyc_status === 'under_review'
                ? 'Your business verification is under review. Live will be available once approved.'
                : org.kyc_status === 'rejected'
                  ? <>Your verification was not approved. <Link href="/settings/verification" className="underline hover:no-underline">Update your information</Link> and resubmit.</>
                  : <>Complete business verification to go live. <Link href="/settings/verification" className="underline hover:no-underline">Start verification</Link></>
            }
          </div>
        )}
        {isOverLedgerLimit(org) && (
          <div className="sticky top-0 z-[9] bg-amber-600 text-white text-center text-sm font-medium py-2 px-4">
            You have {org.current_ledger_count} ledgers ({org.max_ledgers} included) — additional ledgers are billed at $20/month each.{' '}
            <Link href="/billing" className="underline hover:no-underline">
              View billing
            </Link>{' '}
            for details.
          </div>
        )}
        <div className="p-4 lg:p-8">
          <LivemodeProvider livemode={livemode} activeLedgerGroupId={activeLedgerGroupId} readonly={readonly}>
            <ToastProvider>
              {children}
            </ToastProvider>
          </LivemodeProvider>
        </div>
      </main>
    </div>
  )
}
