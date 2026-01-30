import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export default function OnboardingRefreshPage() {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <AlertCircle className="h-16 w-16 text-amber-500 mx-auto" />
      <h1 className="mt-6 text-3xl font-bold text-foreground">Onboarding link expired</h1>
      <p className="mt-3 text-muted-foreground">
        The onboarding session has expired. Please start again from Connected Accounts.
      </p>
      <Link
        href="/connected-accounts"
        className="mt-8 inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md hover:bg-primary/90"
      >
        Back to Connected Accounts
      </Link>
    </div>
  )
}
