import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy - Soledgic',
  description: 'Soledgic Privacy Policy',
}

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-muted-foreground">Last updated: January 30, 2026</p>

        <div className="mt-8 prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Introduction</h2>
            <p>
              Osifo Holdings LLC, doing business as Soledgic (&quot;Soledgic,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), respects your privacy. This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you use our website at soledgic.com, our APIs, dashboards, and all related services (collectively, the &quot;Service&quot;).
            </p>
            <p className="mt-3">
              By using the Service, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Information We Collect</h2>

            <h3 className="text-lg font-medium mt-4 mb-2">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Account Information:</strong> Name, email address, organization name, and password when you create an account.</li>
              <li><strong>Billing Information:</strong> Payment card details, billing address, and tax identification numbers. Payment card information is processed directly by Stripe and is not stored on our servers.</li>
              <li><strong>Business Data:</strong> Financial records, transaction data, seller/creator information, ledger entries, and other data you input into the Service.</li>
              <li><strong>Communications:</strong> Information you provide when contacting our support team or providing feedback.</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Usage Data:</strong> Pages visited, features used, API calls made, timestamps, and interaction patterns.</li>
              <li><strong>Device Information:</strong> Browser type, operating system, device type, and screen resolution.</li>
              <li><strong>Network Information:</strong> IP address, approximate geographic location, and referring URLs.</li>
              <li><strong>Cookies:</strong> Session cookies for authentication and preference cookies for your settings. We do not use third-party advertising cookies.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Provide, operate, and maintain the Service</li>
              <li>Process transactions and manage your subscription</li>
              <li>Send transactional emails (account confirmations, billing receipts, security alerts)</li>
              <li>Provide customer support and respond to inquiries</li>
              <li>Monitor usage to enforce plan limits and detect abuse</li>
              <li>Improve the Service through aggregate analytics</li>
              <li>Comply with legal obligations and enforce our Terms of Service</li>
              <li>Protect against fraud and unauthorized access</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. How We Share Your Information</h2>
            <p>We do not sell your personal information. We share information only in the following circumstances:</p>

            <h3 className="text-lg font-medium mt-4 mb-2">4.1 Service Providers</h3>
            <p>We use third-party services to operate the platform:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Stripe:</strong> Payment processing and subscription management. Stripe processes your payment information under their own <a href="https://stripe.com/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</li>
              <li><strong>Supabase:</strong> Database hosting and authentication infrastructure.</li>
              <li><strong>Vercel:</strong> Application hosting and content delivery.</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">4.2 Legal Requirements</h3>
            <p>
              We may disclose your information if required by law, court order, or governmental authority, or if we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">4.3 Business Transfers</h3>
            <p>
              In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you of any such transfer and any changes to this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Data Security</h2>
            <p>We implement industry-standard security measures to protect your information, including:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Encryption of data in transit (TLS/HTTPS) and at rest</li>
              <li>Secure authentication with session management</li>
              <li>Role-based access controls within organizations</li>
              <li>Regular security monitoring and audit logging</li>
              <li>Rate limiting and abuse prevention on all API endpoints</li>
            </ul>
            <p className="mt-3">
              No method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your data, we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Data Retention</h2>
            <p>
              We retain your account information and business data for as long as your account is active. After account termination, we retain your data for 30 days to allow for reactivation, after which it may be permanently deleted. We may retain certain information longer as required by law (e.g., financial records, tax-related data).
            </p>
            <p className="mt-3">
              Aggregate, anonymized data that cannot identify you may be retained indefinitely for analytics and service improvement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the following rights regarding your personal information:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information.</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information, subject to legal retention requirements.</li>
              <li><strong>Export:</strong> Export your data in a machine-readable format while your account is active.</li>
              <li><strong>Objection:</strong> Object to certain processing of your personal information.</li>
            </ul>
            <p className="mt-3">
              To exercise these rights, contact us at <a href="mailto:support@soledgic.com" className="text-primary hover:underline">support@soledgic.com</a>. We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Cookies</h2>
            <p>
              We use essential cookies required for the Service to function, including authentication session cookies. These cookies are strictly necessary and cannot be disabled. We do not use cookies for advertising or cross-site tracking.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Children&apos;s Privacy</h2>
            <p>
              The Service is not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected personal information from a child, we will take steps to delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. International Data Transfers</h2>
            <p>
              Your information may be processed and stored in the United States, where our service providers operate. By using the Service, you consent to the transfer of your information to the United States. We ensure that appropriate safeguards are in place to protect your data in accordance with this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by email or by posting a notice on the Service. The &quot;Last updated&quot; date at the top of this page indicates when the policy was last revised. Your continued use of the Service after changes become effective constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">12. Contact</h2>
            <p>
              If you have questions or concerns about this Privacy Policy or our data practices, contact us at:
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
            <Link href="/refund-policy" className="hover:text-foreground">Refunds</Link>
            <Link href="/acceptable-use" className="hover:text-foreground">Acceptable Use</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
