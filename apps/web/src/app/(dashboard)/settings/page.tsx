import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Key, CreditCard, Building, Users, Bell, Shield, Wrench } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createClient()
  
  const { data: { session } } = await supabase.auth.getSession(); const user = session?.user
  // Auth handled by layout

  const settingsGroups = [
    {
      title: 'API',
      items: [
        {
          name: 'API Keys',
          description: 'Manage your API keys for programmatic access',
          href: '/settings/api-keys',
          icon: Key,
        },
        {
          name: 'Webhooks',
          description: 'Configure webhook endpoints for real-time events',
          href: '/settings/webhooks',
          icon: Bell,
        },
      ],
    },
    {
      title: 'Payment',
      items: [
        {
          name: 'Payment Rails',
          description: 'Configure Stripe, Plaid, PayPal, or manual payouts',
          href: '/settings/payment-rails',
          icon: CreditCard,
        },
      ],
    },
    {
      title: 'Organization',
      items: [
        {
          name: 'General',
          description: 'Organization name, logo, and settings',
          href: '/settings/organization',
          icon: Building,
        },
        {
          name: 'Team Members',
          description: 'Invite and manage team members',
          href: '/settings/team',
          icon: Users,
        },
        {
          name: 'Security',
          description: 'Two-factor authentication and security settings',
          href: '/settings/security',
          icon: Shield,
        },
      ],
    },
    {
      title: 'Developer Tools',
      items: [
        {
          name: 'Data Repair',
          description: 'Repair orphaned ledger groups and reset test environments',
          href: '/settings/developer-tools',
          icon: Wrench,
        },
      ],
    },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and organization settings
        </p>
      </div>

      <div className="space-y-8">
        {settingsGroups.map((group) => (
          <div key={group.title}>
            <h2 className="text-lg font-semibold text-foreground mb-4">{group.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.items.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {item.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
