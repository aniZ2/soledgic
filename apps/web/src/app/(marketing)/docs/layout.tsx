'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Key, Code, Lightbulb, Bell, Package, Home, ArrowLeft, Menu, X } from 'lucide-react'
import { useState } from 'react'

const navigation = [
  { name: 'Overview', href: '/docs', icon: Home },
  { name: 'Quickstart', href: '/docs/quickstart', icon: BookOpen },
  { name: 'Authentication', href: '/docs/authentication', icon: Key },
  { name: 'Core Concepts', href: '/docs/concepts', icon: Lightbulb },
  {
    name: 'API Reference',
    href: '/docs/api',
    icon: Code,
    children: [
      { name: 'Record Sale', href: '/docs/api#record-sale' },
      { name: 'Get Balance', href: '/docs/api#get-balance' },
      { name: 'Process Payout', href: '/docs/api#process-payout' },
      { name: 'Record Refund', href: '/docs/api#record-refund' },
      { name: 'Transactions', href: '/docs/api#transactions' },
    ],
  },
  { name: 'Webhooks', href: '/docs/webhooks', icon: Bell },
  { name: 'SDKs & Libraries', href: '/docs/sdks', icon: Package },
]

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-2xl font-bold text-primary">
                Soledgic
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-foreground">Docs</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Dashboard
              </Link>
              <Link
                href="/login"
                className="text-sm font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 text-muted-foreground hover:text-foreground"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8">
          {/* Sidebar - Desktop */}
          <aside className="hidden lg:block w-64 flex-shrink-0 py-8">
            <nav className="sticky top-24 space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const Icon = item.icon

                return (
                  <div key={item.name}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.name}
                    </Link>
                    {item.children && isActive && (
                      <div className="ml-7 mt-1 space-y-1 border-l border-border pl-3">
                        {item.children.map((child) => (
                          <Link
                            key={child.name}
                            href={child.href}
                            className="block py-1.5 text-sm text-muted-foreground hover:text-foreground"
                          >
                            {child.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>
          </aside>

          {/* Mobile sidebar */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
              <aside className="fixed left-0 top-16 bottom-0 w-64 bg-background border-r border-border overflow-y-auto p-4">
                <nav className="space-y-1">
                  {navigation.map((item) => {
                    const isActive = pathname === item.href
                    const Icon = item.icon

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.name}
                      </Link>
                    )
                  })}
                </nav>
              </aside>
            </div>
          )}

          {/* Main content */}
          <main className="flex-1 py-8 min-w-0">
            <article className="prose prose-slate dark:prose-invert max-w-none">
              {children}
            </article>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Soledgic. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">
                Terms
              </Link>
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
                Privacy
              </Link>
              <a href="mailto:support@soledgic.com" className="text-sm text-muted-foreground hover:text-foreground">
                Support
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
