import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { creatorPortalNavigation } from '@/lib/navigation'
import { MobileNav } from '@/components/mobile-nav'
import { ThemeToggle } from '@/components/theme-toggle'
import { listCreatorConnectedAccountsForUser } from '@/lib/creator-connected-accounts-server'

export default async function CreatorPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/creator/login')
  }

  const creatorAccounts = await listCreatorConnectedAccountsForUser(user.id, user.email)
  if (creatorAccounts.length === 0) {
    redirect('/login')
  }

  const creatorEmail = user.email
  const creatorName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Creator'

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Navigation */}
      <MobileNav
        orgName="Creator Portal"
        userName={creatorName}
        userEmail={creatorEmail || ''}
        livemode={true}
        navigation={creatorPortalNavigation}
        brandLabel="Creator"
        homePath="/creator"
      />

      {/* Desktop Sidebar - Hidden on mobile */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 border-r border-border bg-card">
        <div className="flex h-16 items-center px-6 border-b border-border">
          <Link href="/creator" className="text-2xl font-bold text-primary">
            Soledgic
            <span className="ml-1.5 text-sm font-medium text-muted-foreground">Creator</span>
          </Link>
        </div>

        <nav className="p-4 space-y-4">
          {creatorPortalNavigation.map((section, idx) => (
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

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {creatorName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {creatorName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {creatorEmail}
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
        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
