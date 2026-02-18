import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function CreatorDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/creator/login')

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold text-foreground">Creator Portal</h1>
      <p className="text-muted-foreground mt-2">
        Creator dashboards and payout setup will live here once enabled for your platform.
      </p>
    </div>
  )
}

