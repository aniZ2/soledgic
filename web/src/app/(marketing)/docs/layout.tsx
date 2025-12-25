import Link from 'next/link'
import { Landmark } from 'lucide-react'

// ============================================================================
// DOCUMENTATION LAYOUT
// Shared layout for all documentation pages with consistent navigation
// ============================================================================

interface DocsLayoutProps {
  children: React.ReactNode
}

export default function DocsLayout({ children }: DocsLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Soledgic Home">
              <div className="w-7 h-7 bg-[#1C1917] rounded-md flex items-center justify-center">
                <Landmark className="w-4 h-4 text-white" strokeWidth={2.5} aria-hidden="true" />
              </div>
              <span className="font-semibold text-[15px] tracking-tight">Soledgic</span>
            </Link>
            <nav className="flex items-center gap-6" aria-label="Header navigation">
              <Link href="/docs" className="text-foreground font-medium">Docs</Link>
              <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">Login</Link>
              <Link 
                href="/signup" 
                className="bg-foreground text-background px-4 py-2 rounded-md text-sm font-medium hover:bg-foreground/90 transition-colors"
              >
                Get started
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {children}

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-16" role="contentinfo">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          © 2025 Soledgic. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
