'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Building2, ChevronDown, Plus, Check } from 'lucide-react'

interface Organization {
  id: string
  name: string
  slug: string
  plan: string
}

export function OrgSwitcher() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    async function loadOrgs() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: memberships } = await supabase
        .from('organization_members')
        .select(`
          organization:organizations(id, name, slug, plan)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (memberships) {
        const organizations: Organization[] = memberships
          .map(m => {
            const org = m.organization
            // Handle both array and object cases from Supabase
            if (Array.isArray(org)) return org[0] as Organization | undefined
            return org as Organization | undefined
          })
          .filter((org): org is Organization => org !== undefined && org !== null)
        
        setOrgs(organizations)
        
        // Set current org from URL or first org
        const slugFromUrl = pathname.split('/')[1]
        const matchedOrg = organizations.find(o => o.slug === slugFromUrl)
        setCurrentOrg(matchedOrg || organizations[0] || null)
      }
      
      setLoading(false)
    }
    
    loadOrgs()
  }, [pathname, supabase])

  if (loading || orgs.length === 0) {
    return null
  }

  // Single org - just show name, no dropdown
  if (orgs.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-foreground truncate max-w-[150px]">
          {currentOrg?.name}
        </span>
      </div>
    )
  }

  // Multiple orgs - show dropdown
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-md w-full"
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-foreground truncate max-w-[150px]">
          {currentOrg?.name}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setOpen(false)} 
          />
          
          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-50">
            <div className="p-2">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Organizations
              </p>
              
              {orgs.map((org) => (
                <Link
                  key={org.id}
                  href={`/${org.slug}/dashboard`}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 px-2 py-2 rounded-md text-sm ${
                    currentOrg?.id === org.id 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  <span className="truncate flex-1">{org.name}</span>
                  {currentOrg?.id === org.id && (
                    <Check className="h-4 w-4" />
                  )}
                </Link>
              ))}
            </div>
            
            <div className="border-t border-border p-2">
              <Link
                href="/onboarding"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Create organization
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
