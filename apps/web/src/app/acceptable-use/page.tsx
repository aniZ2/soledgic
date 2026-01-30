import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Acceptable Use Policy - Soledgic',
  description: 'Soledgic Acceptable Use Policy',
}

export default function AcceptableUsePage() {
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
        <h1 className="text-3xl font-bold text-foreground">Acceptable Use Policy</h1>
        <p className="mt-2 text-muted-foreground">Last updated: January 30, 2026</p>

        <div className="mt-8 prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Purpose</h2>
            <p>
              This Acceptable Use Policy (&quot;AUP&quot;) defines the permitted and prohibited uses of the Soledgic platform operated by Osifo Holdings LLC. This AUP is incorporated into and forms part of our <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>. Violation of this policy may result in suspension or termination of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Permitted Use</h2>
            <p>
              Soledgic is designed for legitimate businesses that need financial operations infrastructure, including payment processing, revenue splitting, seller payouts, and accounting. You may use the Service for any lawful business purpose that is consistent with the Service&apos;s intended functionality.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Restricted Business Categories</h2>
            <p>
              The following business categories are prohibited from using the Service. This list aligns with payment processor restrictions and applicable regulations:
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">3.1 Prohibited Industries</h3>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Illegal drugs, controlled substances, or drug paraphernalia</li>
              <li>Weapons, ammunition, or explosives sales</li>
              <li>Gambling, lotteries, or betting (unless properly licensed)</li>
              <li>Adult content or services</li>
              <li>Multi-level marketing or pyramid schemes</li>
              <li>Counterfeit or stolen goods</li>
              <li>Money laundering or terrorist financing</li>
              <li>Unlicensed financial services or money transmission</li>
              <li>Cryptocurrency exchanges or initial coin offerings (unless properly licensed)</li>
              <li>Debt collection using deceptive or abusive practices</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">3.2 Restricted Products</h3>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Tobacco products or e-cigarettes (may require additional review)</li>
              <li>Pharmaceuticals (requires proper licensing documentation)</li>
              <li>Alcohol (requires proper licensing documentation)</li>
              <li>Age-restricted products without proper age verification</li>
            </ul>

            <p className="mt-3">
              If your business falls into a restricted category and you hold proper licenses, contact <a href="mailto:ani@osifoholdings.com" className="text-primary hover:underline">ani@osifoholdings.com</a> for review before signing up.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Prohibited Conduct</h2>
            <p>You may not use the Service to:</p>

            <h3 className="text-lg font-medium mt-4 mb-2">4.1 Fraud and Deception</h3>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Process fraudulent transactions or charges</li>
              <li>Misrepresent products, services, or business identity</li>
              <li>Engage in unauthorized or deceptive billing practices</li>
              <li>Create fake accounts or manipulate platform data</li>
              <li>Launder money or facilitate financial fraud</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">4.2 Technical Abuse</h3>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Attempt to gain unauthorized access to the Service or other users&apos; accounts</li>
              <li>Reverse-engineer, decompile, or attempt to extract the source code of the Service</li>
              <li>Interfere with or disrupt the Service&apos;s infrastructure</li>
              <li>Circumvent rate limits, usage limits, or security controls</li>
              <li>Use the Service to send spam or unsolicited communications</li>
              <li>Introduce malicious code, viruses, or other harmful software</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">4.3 Legal Violations</h3>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Violate any applicable local, state, national, or international law or regulation</li>
              <li>Infringe on the intellectual property rights of others</li>
              <li>Violate export control or sanctions laws</li>
              <li>Process transactions for sanctioned individuals, entities, or countries</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. API Usage</h2>
            <p>If you access the Service through our API, you must:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Authenticate all requests with valid credentials</li>
              <li>Respect rate limits and usage quotas for your plan</li>
              <li>Not share API keys or allow unauthorized third-party access</li>
              <li>Not use automated systems to scrape or extract data beyond your own account data</li>
              <li>Handle errors gracefully and implement appropriate retry logic with backoff</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Data Responsibilities</h2>
            <p>When using the Service, you are responsible for:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Ensuring that any personal data you input complies with applicable privacy laws</li>
              <li>Obtaining necessary consents from individuals whose data you process through the Service</li>
              <li>Maintaining the accuracy of financial records you submit</li>
              <li>Securing access credentials for your team members</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Enforcement</h2>
            <p>We enforce this policy through the following measures:</p>

            <h3 className="text-lg font-medium mt-4 mb-2">7.1 Monitoring</h3>
            <p>
              We monitor usage patterns and may review account activity to detect violations of this policy. We do not access your business data for monitoring purposes except as necessary to investigate reported violations.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">7.2 Consequences</h3>
            <p>Violations of this policy may result in:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Warning:</strong> Notification of the violation with a request to remedy it.</li>
              <li><strong>Suspension:</strong> Temporary restriction of access to the Service while the issue is investigated.</li>
              <li><strong>Termination:</strong> Permanent closure of your account for serious or repeated violations.</li>
            </ul>
            <p className="mt-3">
              We aim to provide notice before taking enforcement action, except where immediate action is necessary to prevent harm or comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Reporting Violations</h2>
            <p>
              If you become aware of a violation of this AUP, please report it to <a href="mailto:support@soledgic.com" className="text-primary hover:underline">support@soledgic.com</a>. We investigate all reported violations and will take appropriate action.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this AUP from time to time. Changes will be posted on this page with an updated &quot;Last updated&quot; date. Material changes will be communicated via email. Your continued use of the Service after changes become effective constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Contact</h2>
            <p>
              If you have questions about this policy or need to discuss whether your business is permitted, contact us at:
            </p>
            <p className="mt-2">
              Osifo Holdings LLC (d/b/a Soledgic)<br />
              Email: <a href="mailto:support@soledgic.com" className="text-primary hover:underline">support@soledgic.com</a><br />
              Business inquiries: <a href="mailto:ani@osifoholdings.com" className="text-primary hover:underline">ani@osifoholdings.com</a>
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
            <Link href="/refund-policy" className="hover:text-foreground">Refunds</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
