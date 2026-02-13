import Link from 'next/link'

export default function ConnectStripePage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-foreground">Payment Setup Updated</h1>
      <p className="mt-3 text-muted-foreground">
        Stripe Connect onboarding is currently disabled. Soledgic now uses its primary card processor for payment and payout setup.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground">What this means</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-muted-foreground">
          <li>Existing Stripe data remains available for historical records.</li>
          <li>New payment rail onboarding is handled through your primary processor.</li>
          <li>Manual payouts remain available as a fallback.</li>
        </ul>
      </div>

      <div className="mt-6 flex gap-3">
        <Link
          href="/settings/payment-rails"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open Payment Rails
        </Link>
        <Link
          href="/creator"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Back to Creator Dashboard
        </Link>
      </div>
    </div>
  )
}
