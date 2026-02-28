import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceRoleClient } from '@/lib/supabase/service'

interface CheckoutSession {
  id: string
  amount: number
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
    .select('id, amount, currency, product_name, customer_email, status, expires_at, cancel_url, ledger_id')
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Payment Complete</h1>
            <p className="mt-2 text-sm text-gray-500">This checkout session has already been completed.</p>
          </div>
        </div>
      </div>
    )
  }

  if (isExpired || session.status === 'expired' || session.status === 'cancelled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Session Expired</h1>
            <p className="mt-2 text-sm text-gray-500">This checkout session has expired. Please request a new checkout link.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
            {session.product_name && (
              <p className="mt-2 text-gray-600">{session.product_name}</p>
            )}
          </div>

          <div className="border-t border-b border-gray-100 py-6 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total</span>
              <span className="text-3xl font-bold text-gray-900">
                {formatAmount(session.amount, session.currency)}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400 text-right uppercase">{session.currency}</p>
          </div>

          <form action={`/api/checkout/${session.id}/setup`} method="POST">
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Pay with Card
            </button>
          </form>

          {session.cancel_url && (
            <div className="mt-4 text-center">
              <Link
                href={session.cancel_url}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Cancel
              </Link>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-gray-400">
            Powered by Soledgic
          </p>
        </div>
      </div>
    </div>
  )
}
