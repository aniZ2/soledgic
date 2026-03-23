import { redirect } from 'next/navigation'
import { getPrimaryOwnerHomePath } from '@/lib/internal-platforms'
import { createClient } from '@/lib/supabase/server'
import { maybeProvisionPrimaryOwnerWorkspace } from '@/lib/platform-owner-bootstrap'
import OnboardingForm from './onboarding-form'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const provisioned = await maybeProvisionPrimaryOwnerWorkspace({
      id: user.id,
      email: user.email,
    })

    if (provisioned) {
      redirect(getPrimaryOwnerHomePath())
    }
  }

  return <OnboardingForm />
}
