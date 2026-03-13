import Link from 'next/link'
import s from '../landing.module.css'

export default function PricingPage() {
  return (
    <div className={s.page}>
      <nav className={s.nav}>
        <Link href="/" className={s.navLogo}>Soledgic</Link>
        <ul className={s.navLinks}>
          <li><Link href="/#how">How it Works</Link></li>
          <li><Link href="/#capabilities">Capabilities</Link></li>
          <li><Link href="/#built-for">Built For</Link></li>
          <li><Link href="/pricing">Pricing</Link></li>
          <li><Link href="/login">Login</Link></li>
        </ul>
        <Link href="/signup" className={s.navCta}>Start Free</Link>
      </nav>

      <section className={s.pricingSection} id="pricing">
        <div className={s.pricingInner}>
          <p className={s.sectionEyebrow}>Pricing</p>
          <h1 className={s.sectionTitle}>Start with the infrastructure, not the overhead.</h1>
          <p className={s.sectionDesc} style={{ margin: '0 auto' }}>
            Launch with Soledgic as your financial layer, then expand ledgers
            and team access as the platform grows.
          </p>

          <div className={s.pricingRate}>
            Free <span>to start</span>
          </div>
          <p className={s.pricingDetails}>
            No base subscription fee · 1 ledger included · 1 team member included · 1,000 transactions/month included · $20/month per additional ledger · $20/month per additional team member · $0.02 per additional transaction
          </p>

          <div className={s.pricingSingle}>
            <div className={`${s.pricingCard} ${s.pricingCardFeatured}`}>
              <div className={s.pricingTier}>Core Platform Infrastructure</div>
              <div className={s.pricingPrice}>Free</div>
              <div className={s.pricingSubtext}>Start free, then pay only for usage beyond the included limits</div>
              <ul className={s.pricingFeatures}>
                <li>Checkout and payment orchestration</li>
                <li>Revenue splits, holds, and payouts</li>
                <li>Double-entry ledger and audit trail</li>
                <li>Reconciliation and financial reporting</li>
                <li>Creator portal and operator dashboard</li>
                <li>API keys, docs, and webhooks</li>
                <li>1 ledger included</li>
                <li>1 team member</li>
                <li>1,000 transactions/month included</li>
                <li>$20/month per additional ledger</li>
                <li>$20/month per additional team member</li>
                <li>$0.02 per additional transaction</li>
                <li>Email support</li>
              </ul>
              <Link href="/signup" className={`${s.pricingBtn} ${s.pricingBtnFeatured}`}>
                Start Free
              </Link>
            </div>
          </div>

          <p className={s.pricingFootnote}>
            No credit card required to start. Usage beyond included limits is billed monthly. Payment processing fees apply separately.
            Need custom terms? <a href="mailto:sales@soledgic.com">Talk to us.</a>
          </p>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={s.footerLinks}>
          <Link href="/docs">Documentation</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/acceptable-use">Acceptable Use</Link>
          <a href="mailto:support@soledgic.com">Support</a>
        </div>
        <p className={s.footerCopy}>© {new Date().getFullYear()} Osifo Holdings L.L.C. All rights reserved.</p>
      </footer>
    </div>
  )
}
