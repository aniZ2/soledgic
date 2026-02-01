'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  User, CreditCard, Key, Bell, Building, Users, Shield
} from 'lucide-react'

const settingsNav = [
  { href: '/dashboard/settings', label: 'General', icon: Building },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings/api-keys', label: 'API Keys', icon: Key },
  { href: '/dashboard/settings/team', label: 'Team', icon: Users },
  { href: '/dashboard/settings/notifications', label: 'Notifications', icon: Bell },
  { href: '/dashboard/settings/security', label: 'Security', icon: Shield },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex gap-8">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0">
        <nav className="space-y-1">
          {settingsNav.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  )
}
