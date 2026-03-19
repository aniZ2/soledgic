import { redirect } from 'next/navigation'

export default function LegacyReconciliationPage() {
  redirect('/dashboard/expenses')
}
