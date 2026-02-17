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
          <h1 className={s.sectionTitle}>Start free. Scale when you earn.</h1>
          <p className={s.sectionDesc} style={{ margin: '0 auto' }}>
            No monthly platform fees to start. Pay processing costs on
            transactions, scale up when you&apos;re ready.
          </p>

          <div className={s.pricingRate}>
            3.5% + $0.55 <span>per transaction</span>
          </div>
          <p className={s.pricingDetails}>
            No monthly fees · No hidden costs · 1 ledger included · 1 team member included · $20/month per additional ledger · $20/month per additional team member
          </p>

          <div className={s.pricingSingle}>
            <div className={`${s.pricingCard} ${s.pricingCardFeatured}`}>
              <div className={s.pricingTier}>Everything Included</div>
              <div className={s.pricingPrice}>Free</div>
              <div className={s.pricingSubtext}>Pay only processing fees per transaction</div>
              <ul className={s.pricingFeatures}>
                <li>Payment processing</li>
                <li>Revenue splits &amp; payouts</li>
                <li>Double-entry ledger</li>
                <li>Creator portal</li>
                <li>Tax withholding &amp; 1099-K</li>
                <li>Financial reports</li>
                <li>Scheduled &amp; on-demand payouts</li>
                <li>1 ledger included</li>
                <li>1 team member</li>
                <li>$20/month per additional ledger</li>
                <li>$20/month per additional team member</li>
                <li>Email support</li>
              </ul>
              <Link href="/signup" className={`${s.pricingBtn} ${s.pricingBtnFeatured}`}>
                Start Free
              </Link>
            </div>
          </div>

          <p className={s.pricingFootnote}>
            No credit card required. Additional ledgers: $20/month each. Additional team members: $20/month each.
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
