import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service - Soledgic',
  description: 'Soledgic Terms of Service',
}

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-foreground">Terms of Service</h1>
        <p className="mt-2 text-muted-foreground">Last updated: January 30, 2026</p>

        <div className="mt-8 prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Agreement to Terms</h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you (&quot;Customer,&quot; &quot;you,&quot; or &quot;your&quot;) and Osifo Holdings LLC, doing business as Soledgic (&quot;Soledgic,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), governing your access to and use of the Soledgic platform, including our website at soledgic.com, APIs, dashboards, and all related services (collectively, the &quot;Service&quot;).
            </p>
            <p className="mt-3">
              By creating an account, accessing, or using the Service, you agree to be bound by these Terms. If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Description of Service</h2>
            <p>
              Soledgic provides a financial operations platform for digital businesses, including payment processing, revenue splitting, seller payouts, double-entry ledger tracking, reconciliation, and related financial tools. The Service is provided as a cloud-based software-as-a-service (SaaS) product.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Eligibility</h2>
            <p>
              To use the Service, you must: (a) be at least 18 years of age; (b) have the legal capacity to enter into a binding agreement; (c) not be prohibited from using the Service under applicable law; and (d) not operate a business in a restricted category as described in our <Link href="/acceptable-use" className="text-primary hover:underline">Acceptable Use Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Account Registration</h2>
            <p>
              You must create an account to use the Service. You agree to: (a) provide accurate, current, and complete information during registration; (b) maintain and update your information to keep it accurate; (c) maintain the security of your account credentials; and (d) accept responsibility for all activities that occur under your account.
            </p>
            <p className="mt-3">
              You must notify us immediately at <a href="mailto:support@soledgic.com" className="text-primary hover:underline">support@soledgic.com</a> if you suspect unauthorized access to your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Billing and Charges</h2>
            <h3 className="text-lg font-medium mt-4 mb-2">5.1 Plans and Pricing</h3>
            <p>
              The Service is offered under pricing plans as described on our pricing page. The current offering starts free with one included ledger and one included team member. Payment processing fees apply separately, and each additional ledger or additional team member is billed at $20/month. We reserve the right to modify pricing with 30 days&apos; written notice to active customers.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">5.2 Free Start</h3>
            <p>
              New accounts start on the free plan automatically. No subscription is required to begin using the Service.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">5.3 Payment</h3>
            <p>
              Any paid charges (including overage charges and other paid features) are billed via our payment processing providers. By adding a payment method and using paid features, you authorize us to charge your payment method on a recurring basis where applicable. All fees are quoted in US Dollars. You are responsible for all applicable taxes.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">5.4 Overage Charges</h3>
            <p>
              If you exceed the included limits in your plan, additional ledgers and additional team members are billed at $20/month each. Overages are charged on your next billing cycle.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">5.5 Cancellation</h3>
            <p>
              If you have active paid usage, you may stop future paid charges at any time from your account settings by removing paid usage or updating your billing profile. No partial refunds are issued for usage already incurred within a billing period. See our <Link href="/refund-policy" className="text-primary hover:underline">Refund Policy</Link> for details.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Acceptable Use</h2>
            <p>
              Your use of the Service is subject to our <Link href="/acceptable-use" className="text-primary hover:underline">Acceptable Use Policy</Link>, which is incorporated into these Terms by reference. We reserve the right to suspend or terminate accounts that violate the Acceptable Use Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Your Data</h2>
            <h3 className="text-lg font-medium mt-4 mb-2">7.1 Ownership</h3>
            <p>
              You retain all rights to the data you submit to the Service (&quot;Customer Data&quot;). You grant us a limited license to use, process, and store Customer Data solely to provide the Service.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">7.2 Data Processing</h3>
            <p>
              We process Customer Data in accordance with our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>. You represent that you have obtained all necessary consents to share any personal data with us through the Service.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">7.3 Data Export</h3>
            <p>
              You may export your data at any time while your account is active. Upon account termination, we will retain your data for 30 days, after which it may be permanently deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Intellectual Property</h2>
            <p>
              The Service, including all software, designs, text, graphics, and other content provided by Soledgic, is owned by us and protected by intellectual property laws. These Terms do not grant you any right, title, or interest in the Service except the limited right to use it in accordance with these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Third-Party Services</h2>
            <p>
              The Service integrates with third-party services including payment processing providers and Supabase for data infrastructure. Your use of these third-party services is subject to their respective terms and privacy policies. We are not responsible for the actions or omissions of third-party service providers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Service Availability</h2>
            <p>
              We strive to maintain high availability of the Service but do not guarantee uninterrupted access. We may temporarily suspend the Service for maintenance, updates, or reasons beyond our control. We will make reasonable efforts to provide advance notice of planned downtime.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SOLEDGIC AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
            </p>
            <p className="mt-3">
              OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING FROM OR RELATED TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">12. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. SOLEDGIC DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">13. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Soledgic and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses arising out of or related to: (a) your use of the Service; (b) your violation of these Terms; or (c) your violation of any rights of a third party.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">14. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service at any time for violation of these Terms, the Acceptable Use Policy, or for any other reason with 30 days&apos; notice. Upon termination, your right to use the Service ceases immediately. Sections 7, 8, 11, 12, 13, and 15 survive termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">15. Governing Law and Disputes</h2>
            <p>
              These Terms are governed by the laws of the State of Delaware, without regard to conflict of law principles. Any disputes arising under these Terms shall be resolved in the state or federal courts located in Delaware. You agree to submit to the personal jurisdiction of such courts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">16. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes by email or by posting a notice on the Service at least 30 days before the changes take effect. Your continued use of the Service after changes become effective constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">17. General Provisions</h2>
            <p>
              These Terms, together with the Privacy Policy, Acceptable Use Policy, and Refund Policy, constitute the entire agreement between you and Soledgic regarding the Service. If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in effect. Our failure to enforce any provision does not constitute a waiver. You may not assign these Terms without our consent. We may assign these Terms in connection with a merger, acquisition, or sale of assets.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">18. Contact</h2>
            <p>
              If you have questions about these Terms, contact us at:
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
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/refund-policy" className="hover:text-foreground">Refunds</Link>
            <Link href="/acceptable-use" className="hover:text-foreground">Acceptable Use</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
