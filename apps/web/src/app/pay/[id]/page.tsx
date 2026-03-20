import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceRoleClient } from '@/lib/supabase/service'

interface CheckoutSession {
  id: string
  amount: number
  subtotal_amount: number
  sales_tax_amount: number
  sales_tax_state: string | null
  currency: string
  product_name: string | null
  customer_email: string | null
  status: string
  expires_at: string
  cancel_url: string | null
  ledger_id: string
}

async function getSession(id: string): Promise<CheckoutSession | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('checkout_sessions')
    .select('id, amount, subtotal_amount, sales_tax_amount, sales_tax_state, currency, product_name, customer_email, status, expires_at, cancel_url, ledger_id')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data as CheckoutSession
}

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(cents / 100)
}

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession(id)

  if (!session) {
    notFound()
  }

  const now = new Date()
  const expiresAt = new Date(session.expires_at)
  const isExpired = expiresAt.getTime() <= now.getTime()

  if (session.status === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-4">
          <div className="bg-card rounded-xl shadow-sm border border-border p-8 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-foreground">Payment Complete</h1>
            <p className="mt-2 text-sm text-muted-foreground">This checkout session has already been completed.</p>
          </div>
        </div>
      </div>
    )
  }

  if (isExpired || session.status === 'expired' || session.status === 'cancelled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-4">
          <div className="bg-card rounded-xl shadow-sm border border-border p-8 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-foreground">Session Expired</h1>
            <p className="mt-2 text-sm text-muted-foreground">This checkout session has expired. Please request a new checkout link.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4">
        <div className="bg-card rounded-xl shadow-sm border border-border p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">Checkout</h1>
            {session.product_name && (
              <p className="mt-2 text-muted-foreground">{session.product_name}</p>
            )}
          </div>

          <div className="border-t border-b border-border py-6 mb-6">
            {session.sales_tax_amount > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">{formatAmount(session.subtotal_amount, session.currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {session.sales_tax_state || 'Sales'} tax
                  </span>
                  <span className="font-medium text-foreground">{formatAmount(session.sales_tax_amount, session.currency)}</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-3xl font-bold text-foreground">
                    {formatAmount(session.amount, session.currency)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="text-3xl font-bold text-foreground">
                  {formatAmount(session.amount, session.currency)}
                </span>
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground text-right uppercase">{session.currency}</p>
          </div>

          <form action={`/api/checkout/${session.id}/setup`} method="POST">
            <button
              type="submit"
              className="w-full rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
            >
              Pay with Card
            </button>
          </form>

          {session.cancel_url && (
            <div className="mt-4 text-center">
              <Link
                href={session.cancel_url}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Cancel
              </Link>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Powered by Soledgic
          </p>
        </div>
      </div>
    </div>
  )
}
