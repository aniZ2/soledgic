import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        user={{ email: user.email || '' }} 
        profile={profile} 
      />

      {/* Main content */}
      <main className="md:pl-64">
        {/* Mobile header spacer */}
        <div className="h-16 md:h-0" />
        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
