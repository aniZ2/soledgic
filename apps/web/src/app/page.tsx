import type { Metadata } from 'next'
import s from './landing.module.css'
import { CodeTabs } from './code-tabs'

export const metadata: Metadata = {
  title: 'Soledgic - Payments, Splits, and Ledger for Platforms',
  description:
    'Accept payments, split revenue, pay out sellers, and track every dollar with a built-in double-entry ledger. The financial backend for platforms.',
  openGraph: {
    title: 'Soledgic - Payments, Splits, and Ledger for Platforms',
    description:
      'Accept payments, split revenue, pay out sellers, and track every dollar with a built-in double-entry ledger.',
    url: 'https://soledgic.com',
    siteName: 'Soledgic',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Soledgic - Payments, Splits, and Ledger for Platforms',
    description:
      'Accept payments, split revenue, pay out sellers, and track every dollar with a built-in double-entry ledger.',
  },
}

export default function LandingPage() {
  return (
    <div className={s.page}>
      <div className={s.bgOrbs} />

      <div className={s.content}>
        {/* ── Nav ──────────────────────────────────────────── */}
        <nav className={s.nav}>
          <a href="/" className={s.navLogo}>Soledgic</a>
          <ul className={s.navLinks}>
            <li><a href="#capabilities">Capabilities</a></li>
            <li><a href="#built-for">Use Cases</a></li>
            <li><a href="#how-it-works">How it works</a></li>
            <li><a href="#pricing">Pricing</a></li>
          </ul>
          <a href="mailto:ani@osifoholdings.com" className={s.navCta}>Get Started</a>
        </nav>

        {/* ── Hero ─────────────────────────────────────────── */}
        <section className={s.hero}>
          <div className={s.heroInner}>
            <div>
              <div className={`${s.heroBadge} ${s.reveal}`}>Platform finance stack</div>
              <h1 className={`${s.heroTitle} ${s.reveal} ${s.delay1}`}>
                Payments, splits, and payouts{' '}
                <span className={s.highlight}>with a ledger that never misses</span>
              </h1>
              <p className={`${s.heroSub} ${s.reveal} ${s.delay2}`}>
                Accept payments, split revenue, pay out sellers, and know exactly where every
                dollar is. The financial backend for platforms that move money.
              </p>
              <div className={`${s.heroCta} ${s.reveal} ${s.delay3}`}>
                <a href="mailto:ani@osifoholdings.com" className={s.btnPrimary}>Get Started</a>
                <a href="#how-it-works" className={s.btnSecondary}>See how it works</a>
              </div>
              <div className={`${s.heroProof} ${s.reveal} ${s.delay4}`}>
                <span>SOC 2 ready</span>
                <span>Double-entry ledger</span>
                <span>99.9% uptime</span>
              </div>
            </div>

            {/* ── Hero panel ───────────────────────────────── */}
            <div className={`${s.heroPanel} ${s.reveal} ${s.delay2}`}>
              <div className={s.panelHeader}>
                <div className={s.panelTitle}>Live ledger view</div>
                <div className={s.panelPill}>Balanced</div>
              </div>
              <div className={s.panelStats}>
                <div className={s.panelStat}>
                  <span className={s.statValue}>$8.4k</span>
                  <span className={s.statLabel}>Payout ready</span>
                </div>
                <div className={s.panelStat}>
                  <span className={s.statValue}>7 days</span>
                  <span className={s.statLabel}>Hold period</span>
                </div>
                <div className={s.panelStat}>
                  <span className={s.statValue}>3 splits</span>
                  <span className={s.statLabel}>Per charge</span>
                </div>
              </div>

              <CodeTabs />
            </div>
          </div>

          {/* ── Stats bar ──────────────────────────────────── */}
          <div className={s.statsBar}>
            <div className={s.stat}>
              <span className={s.statBarValue}>65+</span>
              <span className={s.statBarLabel}>API Endpoints</span>
            </div>
            <div className={s.stat}>
              <span className={s.statBarValue}>Double-entry</span>
              <span className={s.statBarLabel}>Ledger</span>
            </div>
            <div className={s.stat}>
              <span className={s.statBarValue}>SOC 2</span>
              <span className={s.statBarLabel}>Ready</span>
            </div>
            <div className={s.stat}>
              <span className={s.statBarValue}>99.9%</span>
              <span className={s.statBarLabel}>Uptime</span>
            </div>
          </div>
        </section>

        {/* ── Capabilities ─────────────────────────────────── */}
        <section className={s.section} id="capabilities">
          <div className={`${s.sectionHeader} ${s.reveal}`}>
            <div className={s.sectionLabel}>Capabilities</div>
            <h2 className={s.sectionTitle}>Everything you need to move money</h2>
            <p className={s.sectionDesc}>Payments, revenue splits, payouts, and a ledger that always balances.</p>
          </div>

          <div className={s.capabilitiesGrid}>
            <div className={`${s.capability} ${s.reveal}`}>
              <div className={s.capabilityIcon}>$</div>
              <h3 className={s.capabilityTitle}>Accept Payments</h3>
              <p className={s.capabilityDesc}>Charge cards and bank accounts. Soledgic handles processing, receipts, and failed payment recovery.</p>
            </div>
            <div className={`${s.capability} ${s.reveal} ${s.delay1}`}>
              <div className={s.capabilityIcon}>&harr;</div>
              <h3 className={s.capabilityTitle}>Split Revenue</h3>
              <p className={s.capabilityDesc}>Define who gets paid from every transaction. Platform fees, seller payouts, referral cuts &mdash; set it once or per charge.</p>
            </div>
            <div className={`${s.capability} ${s.reveal} ${s.delay2}`}>
              <div className={s.capabilityIcon}>&#9719;</div>
              <h3 className={s.capabilityTitle}>Hold Funds</h3>
              <p className={s.capabilityDesc}>Hold funds until orders are fulfilled, disputes are resolved, or your release conditions are met.</p>
            </div>
            <div className={`${s.capability} ${s.reveal}`}>
              <div className={s.capabilityIcon}>&uarr;</div>
              <h3 className={s.capabilityTitle}>Pay Out</h3>
              <p className={s.capabilityDesc}>Send earnings to sellers and creators. Daily, weekly, or on-demand. Every payout hits the ledger automatically.</p>
            </div>
            <div className={`${s.capability} ${s.reveal} ${s.delay1}`}>
              <div className={s.capabilityIcon}>&equiv;</div>
              <h3 className={s.capabilityTitle}>Real-Time Ledger</h3>
              <p className={s.capabilityDesc}>Every transaction is double-entry recorded. Balances are always accurate, always auditable, always in sync.</p>
            </div>
            <div className={`${s.capability} ${s.reveal} ${s.delay2}`}>
              <div className={s.capabilityIcon}>&#9632;</div>
              <h3 className={s.capabilityTitle}>Tax &amp; Compliance</h3>
              <p className={s.capabilityDesc}>Automatic 1099 generation, W-9 collection, and withholding rules. Stay compliant without extra tools.</p>
            </div>
          </div>
        </section>

        {/* ── Built for ────────────────────────────────────── */}
        <section className={s.builtForSection} id="built-for">
          <div className={`${s.sectionHeader} ${s.reveal}`}>
            <div className={s.sectionLabel}>Built for</div>
            <h2 className={s.sectionTitle}>Platforms that move money</h2>
            <p className={s.sectionDesc}>If your product collects and distributes funds, Soledgic handles the flow.</p>
          </div>

          <div className={s.builtForGrid}>
            <div className={`${s.useCase} ${s.reveal}`}>
              <div className={s.useCaseLabel}>Marketplaces</div>
              <h3 className={s.useCaseTitle}>Multi-sided commerce</h3>
              <div className={s.useCaseTags}>
                <span className={s.useCaseTag}>Sellers</span>
                <span className={s.useCaseTag}>Buyers</span>
                <span className={s.useCaseTag}>Platform fees</span>
                <span className={s.useCaseTag}>Settlement</span>
              </div>
            </div>
            <div className={`${s.useCase} ${s.reveal} ${s.delay1}`}>
              <div className={s.useCaseLabel}>Creator Platforms</div>
              <h3 className={s.useCaseTitle}>Royalties and payouts</h3>
              <div className={s.useCaseTags}>
                <span className={s.useCaseTag}>Royalties</span>
                <span className={s.useCaseTag}>Splits</span>
                <span className={s.useCaseTag}>Payouts</span>
                <span className={s.useCaseTag}>Tax compliance</span>
              </div>
            </div>
            <div className={`${s.useCase} ${s.reveal} ${s.delay2}`}>
              <div className={s.useCaseLabel}>Service Platforms</div>
              <h3 className={s.useCaseTitle}>Contractor payments</h3>
              <div className={s.useCaseTags}>
                <span className={s.useCaseTag}>Contractors</span>
                <span className={s.useCaseTag}>Invoicing</span>
                <span className={s.useCaseTag}>Scheduled payouts</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────── */}
        <section className={s.section} id="how-it-works">
          <div className={`${s.sectionHeader} ${s.reveal}`}>
            <div className={s.sectionLabel}>How it works</div>
            <h2 className={s.sectionTitle}>From charge to payout</h2>
            <p className={s.sectionDesc}>One integration, complete money flow control.</p>
          </div>

          <div className={s.flowContainer}>
            <div className={s.flowStep}>
              <div className={s.flowNumber}>1</div>
              <div>
                <h3 className={s.flowTitle}>Charge</h3>
                <p className={s.flowDesc}>Your customer pays. Soledgic processes the payment and records it to your ledger with the splits you defined.</p>
              </div>
            </div>
            <div className={s.flowStep}>
              <div className={s.flowNumber}>2</div>
              <div>
                <h3 className={s.flowTitle}>Hold</h3>
                <p className={s.flowDesc}>Funds are held until you&apos;re ready. Disputes and chargebacks are resolved before anyone gets paid.</p>
              </div>
            </div>
            <div className={s.flowStep}>
              <div className={s.flowNumber}>3</div>
              <div>
                <h3 className={s.flowTitle}>Split</h3>
                <p className={s.flowDesc}>Revenue is divided by your rules. Seller balances, platform fees, referral commissions &mdash; all updated instantly.</p>
              </div>
            </div>
            <div className={s.flowStep}>
              <div className={s.flowNumber}>4</div>
              <div>
                <h3 className={s.flowTitle}>Pay Out</h3>
                <p className={s.flowDesc}>Sellers get paid on your schedule. Every payout is recorded, reconciled, and ready for tax season.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────── */}
        <section className={s.pricingSection} id="pricing">
          <div className={s.pricingSectionHeader}>
            <div className={s.sectionLabel}>Pricing</div>
            <h2 className={s.sectionTitle}>Simple, transparent pricing</h2>
            <p className={s.sectionDesc}>Monthly platform fee for ledger and tools. Transaction fees on payments processed.</p>
          </div>

          <div className={s.pricingHighlight}>
            <div className={s.pricingRate}>3.4% + $0.55 <span>per transaction</span></div>
            <p className={s.pricingNote}>Payment processing and payouts included on all plans</p>
          </div>

          <div className={s.pricingGrid}>
            {/* Pro */}
            <div className={s.pricingCard}>
              <h3 className={s.pricingCardTier}>Pro</h3>
              <div className={s.pricingCardPrice}>$49<span>/mo</span></div>
              <div className={s.pricingCardRateInfo}>+ 3.4% + $0.55 per transaction</div>
              <p className={s.pricingCardDesc}>For solo founders who need payments and a ledger.</p>
              <ul className={s.pricingCardList}>
                <li>3 ledgers</li>
                <li>1 team member</li>
                <li>7-day settlement</li>
                <li>Weekly payouts</li>
                <li>Email support</li>
                <li>$20/ledger overage</li>
              </ul>
              <a href="mailto:ani@osifoholdings.com" className={s.pricingCardBtn}>Start Free Trial</a>
            </div>

            {/* Business (featured) */}
            <div className={`${s.pricingCard} ${s.pricingCardFeatured}`}>
              <h3 className={s.pricingCardTier}>Business</h3>
              <div className={s.pricingCardPrice}>$249<span>/mo</span></div>
              <div className={s.pricingCardRateInfo}>+ 3.4% + $0.55 per transaction</div>
              <p className={s.pricingCardDesc}>For growing platforms with splits, payouts, and multiple team members.</p>
              <ul className={s.pricingCardList}>
                <li>10 ledgers</li>
                <li>10 team members</li>
                <li>Configurable settlement</li>
                <li>Daily or on-demand payouts</li>
                <li>Webhooks &amp; full API access</li>
                <li>Priority support</li>
                <li>$20/ledger overage</li>
              </ul>
              <a href="mailto:ani@osifoholdings.com" className={`${s.pricingCardBtn} ${s.pricingCardBtnFeatured}`}>Start Free Trial</a>
            </div>

            {/* Scale */}
            <div className={s.pricingCard}>
              <h3 className={s.pricingCardTier}>Scale</h3>
              <div className={s.pricingCardPrice}>$999<span>/mo</span></div>
              <div className={s.pricingCardRateInfo}>+ 3.4% + $0.55 per transaction</div>
              <p className={s.pricingCardDesc}>For high-volume platforms that need custom rules and dedicated support.</p>
              <ul className={s.pricingCardList}>
                <li>Unlimited ledgers</li>
                <li>Unlimited team members</li>
                <li>Custom settlement rules</li>
                <li>Dedicated support</li>
                <li>SLA guarantee</li>
                <li>Custom integrations</li>
              </ul>
              <a href="mailto:ani@osifoholdings.com" className={s.pricingCardBtn}>Contact Sales</a>
            </div>
          </div>

          <p className={s.pricingFootnote}>14-day free trial &middot; 50% off first month &middot; No credit card required</p>
        </section>

        {/* ── CTA ──────────────────────────────────────────── */}
        <section className={s.ctaSection}>
          <h2 className={s.ctaTitle}>Ready to stop stitching together payment tools?</h2>
          <p className={s.ctaDesc}>Payments, splits, payouts, and a ledger &mdash; one platform.</p>
          <a href="mailto:ani@osifoholdings.com" className={`${s.btnPrimary} ${s.ctaBtn}`}>Get Started</a>
        </section>

        {/* ── Footer ───────────────────────────────────────── */}
        <footer className={s.footer}>
          <p>&copy; 2026 Soledgic. A product of <a href="https://osifoholdings.com">Osifo Holdings L.L.C.</a></p>
        </footer>
      </div>
    </div>
  )
}
