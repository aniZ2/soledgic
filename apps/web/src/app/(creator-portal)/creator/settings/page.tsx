import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function CreatorSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/creator/login')

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold text-foreground">Creator Settings</h1>
      <p className="text-muted-foreground mt-2">
        Payout settings are configured by the platform today.
      </p>
    </div>
  )
}

