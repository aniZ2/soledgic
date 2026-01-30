import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Refund Policy - Soledgic',
  description: 'Soledgic Refund Policy',
}

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/" className="text-xl font-bold text-primary">
            Soledgic
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-foreground">Refund Policy</h1>
        <p className="mt-2 text-muted-foreground">Last updated: January 30, 2026</p>

        <div className="mt-8 prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Overview</h2>
            <p>
              This Refund Policy applies to all subscription fees paid for the Soledgic platform operated by Osifo Holdings LLC. We want you to be satisfied with the Service. If you are not, this policy outlines the circumstances under which refunds may be issued.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Free Trial</h2>
            <p>
              All new accounts include a 14-day free trial at no charge. We encourage you to fully evaluate the Service during this period before subscribing. No payment is required during the trial, so no refund situation arises from trial usage.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Subscription Cancellation</h2>
            <p>
              You may cancel your subscription at any time from your account billing settings. When you cancel:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Your subscription remains active until the end of the current billing period.</li>
              <li>You retain full access to the Service until your current period expires.</li>
              <li>No partial refunds are issued for unused time within a billing period.</li>
              <li>You will not be charged for subsequent billing periods.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Refund Eligibility</h2>
            <p>Refunds may be issued at our discretion in the following circumstances:</p>

            <h3 className="text-lg font-medium mt-4 mb-2">4.1 Duplicate Charges</h3>
            <p>
              If you were charged more than once for the same billing period due to a processing error, we will refund the duplicate charge in full.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">4.2 Service Unavailability</h3>
            <p>
              If the Service experiences a significant, sustained outage (more than 72 consecutive hours) that prevents you from using core functionality, you may request a prorated refund for the affected period.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">4.3 First-Month Guarantee</h3>
            <p>
              If you are dissatisfied with the Service within the first 30 days after your first paid subscription charge, you may request a full refund of that first month&apos;s payment. This applies once per account and only to the first subscription payment.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Non-Refundable Charges</h2>
            <p>The following are not eligible for refunds:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Subscription fees beyond the first 30 days (except as described in Section 4.2)</li>
              <li>Overage charges for additional ledgers that were provisioned and used</li>
              <li>Charges for prior billing periods where the Service was available</li>
              <li>Accounts terminated for violation of our <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link> or <Link href="/acceptable-use" className="text-primary hover:underline">Acceptable Use Policy</Link></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. How to Request a Refund</h2>
            <p>
              To request a refund, email <a href="mailto:support@soledgic.com" className="text-primary hover:underline">support@soledgic.com</a> with:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Your account email address</li>
              <li>The charge date and amount</li>
              <li>The reason for your refund request</li>
            </ul>
            <p className="mt-3">
              We will review your request and respond within 5 business days. Approved refunds are processed back to your original payment method and typically appear within 5-10 business days depending on your card issuer.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Chargebacks</h2>
            <p>
              If you believe a charge is unauthorized, please contact us first at <a href="mailto:support@soledgic.com" className="text-primary hover:underline">support@soledgic.com</a> before initiating a chargeback with your bank. We are committed to resolving billing disputes quickly and directly. Filing a chargeback without contacting us first may result in temporary suspension of your account while the dispute is reviewed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Plan Downgrades</h2>
            <p>
              If you downgrade your plan (e.g., from Business to Pro), the new pricing takes effect at the start of your next billing period. No refund or credit is issued for the difference in the current period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Refund Policy from time to time. Changes will be posted on this page with an updated &quot;Last updated&quot; date. Material changes will be communicated via email.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Contact</h2>
            <p>
              For billing questions or refund requests, contact us at:
            </p>
            <p className="mt-2">
              Osifo Holdings LLC (d/b/a Soledgic)<br />
              Email: <a href="mailto:support@soledgic.com" className="text-primary hover:underline">support@soledgic.com</a>
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Soledgic. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/acceptable-use" className="hover:text-foreground">Acceptable Use</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
