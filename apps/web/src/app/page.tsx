import Link from 'next/link'
import s from './landing.module.css'

export default function HomePage() {
  return (
    <div className={s.page}>
      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className={s.nav}>
        <Link href="/" className={s.navLogo}>Soledgic</Link>
        <ul className={s.navLinks}>
          <li><a href="#how">How it Works</a></li>
          <li><a href="#capabilities">Capabilities</a></li>
          <li><a href="#built-for">Built For</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><Link href="/login">Login</Link></li>
        </ul>
        <Link href="/signup" className={s.navCta}>Start Free</Link>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className={s.hero}>
        <div className={s.heroLabel}>
          <span className={s.heroLabelDot} />
          Now accepting early platforms
        </div>

        <h1 className={s.heroTitle}>
          Your creators make the content.{' '}
          <span className={s.heroTitleAccent}>We handle the money.</span>
        </h1>

        <p className={s.heroSub}>
          One platform to accept payments, split revenue, withhold taxes,
          and pay creators on time — with a real ledger underneath, not a
          spreadsheet.
        </p>

        <div className={s.heroCtas}>
          <Link href="/signup" className={s.btnPrimary}>Start Free</Link>
          <a href="#how" className={s.btnGhost}>See How it Works</a>
        </div>

        {/* Visual: Animated money flow */}
        <div className={s.heroVisual}>
          <div className={s.flowDiagram}>
            <div className={s.flowNode}>
              <div className={s.flowNodeIcon}>🛒</div>
              <span className={s.flowNodeLabel}>Buyer</span>
              <span className={s.flowNodeSub}>Pays $29.99</span>
            </div>

            <div className={s.flowArrow} />

            <div className={`${s.flowNode} ${s.flowCenter}`}>
              <div className={s.flowCenterPulse} />
              <div className={s.flowCenterIcon}>S</div>
              <span className={s.flowNodeLabel}>Soledgic</span>
              <span className={s.flowNodeSub}>Splits, ledgers, taxes</span>
            </div>

            <div className={s.flowArrow} />

            <div className={s.flowNode}>
              <div className={s.flowNodeIcon}>✍️</div>
              <span className={s.flowNodeLabel}>Creator</span>
              <span className={s.flowNodeSub}>Gets $23.99</span>
            </div>

            <div className={s.flowArrow} />

            <div className={s.flowNode}>
              <div className={s.flowNodeIcon}>🏢</div>
              <span className={s.flowNodeLabel}>Platform</span>
              <span className={s.flowNodeSub}>Keeps $6.00</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Metrics ──────────────────────────────────────────── */}
      <div className={s.metrics}>
        <div className={s.metric}>
          <div className={s.metricValue}>5 min</div>
          <div className={s.metricLabel}>To first payment</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricValue}>$0/mo</div>
          <div className={s.metricLabel}>Platform fee</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricValue}>80/20</div>
          <div className={s.metricLabel}>Or any split you want</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricValue}>1 API</div>
          <div className={s.metricLabel}>Replaces 3 vendors</div>
        </div>
      </div>

      {/* ── Problem / Solution ────────────────────────────────── */}
      <section className={s.problemSection} id="how">
        <div className={s.problemInner}>
          <div className={s.problemGrid}>
            <div className={s.problemSide}>
              <h2>
                You&apos;re duct-taping together{' '}
                <span>three tools</span> to pay one creator
              </h2>
              <ul className={s.problemList}>
                <li className={s.problemItem}>
                  <div className={s.problemIcon}>💳</div>
                  <div className={s.problemText}>
                    <h4>A payment processor</h4>
                    <p>That charges cards but doesn&apos;t understand splits, withholding, or creator payouts.</p>
                  </div>
                </li>
                <li className={s.problemItem}>
                  <div className={s.problemIcon}>📒</div>
                  <div className={s.problemText}>
                    <h4>Accounting software</h4>
                    <p>That tracks your books but can&apos;t process a transaction or trigger a payout.</p>
                  </div>
                </li>
                <li className={s.problemItem}>
                  <div className={s.problemIcon}>🧑‍💻</div>
                  <div className={s.problemText}>
                    <h4>Custom code &amp; spreadsheets</h4>
                    <p>Glue that breaks every month-end. Reconciliation takes days. Tax season is a nightmare.</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className={s.solutionSide}>
              <h3>With Soledgic, it&apos;s one thing.</h3>
              <p>
                Payments, splits, ledger, payouts, and tax reporting in a single system.
                Here&apos;s how it works:
              </p>
              <div className={s.solutionSteps}>
                <div className={s.solutionStep}>
                  <div className={s.stepNumber}>1</div>
                  <div className={s.stepContent}>
                    <h4>Connect your platform</h4>
                    <p>Create a ledger, set your revenue split, get your keys. Five minutes.</p>
                  </div>
                </div>
                <div className={s.solutionStep}>
                  <div className={s.stepNumber}>2</div>
                  <div className={s.stepContent}>
                    <h4>Buyers pay, we handle the math</h4>
                    <p>Card charged → split calculated → fees deducted → tax withheld → ledger balanced. One atomic step.</p>
                  </div>
                </div>
                <div className={s.solutionStep}>
                  <div className={s.stepNumber}>3</div>
                  <div className={s.stepContent}>
                    <h4>Creators get paid on time</h4>
                    <p>Scheduled or on-demand payouts. Creators see their earnings. You see the full financial picture.</p>
                  </div>
                </div>
                <div className={s.solutionStep}>
                  <div className={s.stepNumber}>4</div>
                  <div className={s.stepContent}>
                    <h4>Close your books in minutes</h4>
                    <p>Balance sheet, P&amp;L, 1099-K data — from the same ledger that processed every payment.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Capabilities ──────────────────────────────────────── */}
      <section className={s.section} id="capabilities">
        <p className={s.sectionEyebrow}>Capabilities</p>
        <h2 className={s.sectionTitle}>Everything between the sale and the payout</h2>
        <p className={s.sectionDesc}>
          One platform replaces the payment processor, accounting tool, and
          custom scripts you&apos;re maintaining today.
        </p>

        <div className={s.capGrid}>
          <div className={s.capCard}>
            <span className={s.capEmoji}>📖</span>
            <h3 className={s.capTitle}>Double-Entry Ledger</h3>
            <p className={s.capDesc}>
              Every cent tracked with debits and credits. Period locking,
              frozen statements, and full audit trails. Your accountant
              will actually enjoy month-end.
            </p>
          </div>
          <div className={s.capCard}>
            <span className={s.capEmoji}>⚖️</span>
            <h3 className={s.capTitle}>Flexible Revenue Splits</h3>
            <p className={s.capDesc}>
              80/20, 70/30, or custom per creator. Choose who absorbs
              processing fees. Tiered rates for top performers.
              Change it anytime.
            </p>
          </div>
          <div className={s.capCard}>
            <span className={s.capEmoji}>💸</span>
            <h3 className={s.capTitle}>Multi-Rail Payouts</h3>
            <p className={s.capDesc}>
              ACH, instant push-to-card, or international wire. Weekly,
              biweekly, monthly, or on-demand. Minimum thresholds and
              eligibility checks built in.
            </p>
          </div>
          <div className={s.capCard}>
            <span className={s.capEmoji}>🛡️</span>
            <h3 className={s.capTitle}>Tax &amp; Compliance</h3>
            <p className={s.capDesc}>
              Automatic withholding, 1099-K data exports, and secure
              creator tax info collection. KYC/KYB handled through
              integrated provider flows.
            </p>
          </div>
          <div className={s.capCard}>
            <span className={s.capEmoji}>⏸️</span>
            <h3 className={s.capTitle}>Settlement Control</h3>
            <p className={s.capDesc}>
              Hold funds until your logic says release — refund windows,
              fraud review, dispute resolution. You decide when money
              moves, not the processor.
            </p>
          </div>
          <div className={s.capCard}>
            <span className={s.capEmoji}>📊</span>
            <h3 className={s.capTitle}>Financial Reporting</h3>
            <p className={s.capDesc}>
              Balance sheet, P&amp;L, trial balance, AP/AR aging,
              runway projections. Generated from live ledger data.
              Ops gets answers without pinging engineering.
            </p>
          </div>
        </div>
      </section>

      {/* ── Built For ─────────────────────────────────────────── */}
      <section className={s.builtForSection} id="built-for">
        <div className={s.builtForInner}>
          <p className={s.sectionEyebrow}>Built For</p>
          <h2 className={s.sectionTitle}>Platforms where creators earn money</h2>
          <p className={s.sectionDesc}>
            If your users make content and you share the revenue,
            Soledgic is your financial backend.
          </p>

          <div className={s.builtForGrid}>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>📚</span>
              <div className={s.builtForLabel}>Publishing</div>
              <h3 className={s.builtForTitle}>Book &amp; Content Platforms</h3>
              <p className={s.builtForDesc}>
                Ebook sales, author royalties, audiobook splits,
                and subscription access — tracked and paid automatically.
              </p>
            </div>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>🎓</span>
              <div className={s.builtForLabel}>Education</div>
              <h3 className={s.builtForTitle}>Course &amp; Learning Platforms</h3>
              <p className={s.builtForDesc}>
                Course sales, instructor payouts, cohort billing,
                and multi-tier revenue sharing for teaching marketplaces.
              </p>
            </div>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>🏪</span>
              <div className={s.builtForLabel}>Marketplaces</div>
              <h3 className={s.builtForTitle}>Digital &amp; Service Marketplaces</h3>
              <p className={s.builtForDesc}>
                Seller payouts, platform commissions, escrow holds,
                and multi-vendor splits for two-sided marketplaces.
              </p>
            </div>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>🎵</span>
              <div className={s.builtForLabel}>Music &amp; Audio</div>
              <h3 className={s.builtForTitle}>Streaming &amp; Distribution</h3>
              <p className={s.builtForDesc}>
                Royalty tracking, per-play revenue splits, label payouts,
                and licensing fee management at scale.
              </p>
            </div>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>📡</span>
              <div className={s.builtForLabel}>Media</div>
              <h3 className={s.builtForTitle}>Newsletter &amp; Podcast Platforms</h3>
              <p className={s.builtForDesc}>
                Subscription billing, ad revenue splits, sponsorship
                payouts, and tip jar management for media creators.
              </p>
            </div>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>⚙️</span>
              <div className={s.builtForLabel}>SaaS</div>
              <h3 className={s.builtForTitle}>Platforms with Embedded Payments</h3>
              <p className={s.builtForDesc}>
                Accept payments, collect fees, pay vendors, and maintain
                a clean ledger — without building your own financial backend.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────── */}
      <section className={s.pricingSection} id="pricing">
        <div className={s.pricingInner}>
          <p className={s.sectionEyebrow}>Pricing</p>
          <h2 className={s.sectionTitle}>Start free. Scale when you earn.</h2>
          <p className={s.sectionDesc} style={{ margin: '0 auto' }}>
            No monthly platform fees to start. Pay processing costs on
            transactions, scale up when you&apos;re ready.
          </p>

          <div className={s.pricingRate}>
            2.75% + $0.30 <span>per card transaction</span>
          </div>
          <p className={s.pricingDetails}>
            ACH: 0.75% ($5 max) · Instant payouts: 1.5% · First ledger included free
          </p>

          <div className={s.pricingGrid}>
            <div className={s.pricingCard}>
              <div className={s.pricingTier}>Starter</div>
              <div className={s.pricingPrice}>Free</div>
              <div className={s.pricingSubtext}>Processing fees only</div>
              <ul className={s.pricingFeatures}>
                <li>1 ledger included</li>
                <li>Payment processing</li>
                <li>Revenue splits &amp; payouts</li>
                <li>Double-entry ledger</li>
                <li>Creator portal</li>
                <li>1 team member</li>
                <li>Email support</li>
              </ul>
              <Link href="/signup" className={s.pricingBtn}>Start Free</Link>
            </div>

            <div className={`${s.pricingCard} ${s.pricingCardFeatured}`}>
              <div className={s.pricingCardBadge}>Most Popular</div>
              <div className={s.pricingTier}>Growth</div>
              <div className={s.pricingPrice}>$149<span>/mo</span></div>
              <div className={s.pricingSubtext}>+ processing fees</div>
              <ul className={s.pricingFeatures}>
                <li>5 ledgers included</li>
                <li>Everything in Starter</li>
                <li>Tax withholding &amp; 1099-K</li>
                <li>Financial reports</li>
                <li>Scheduled &amp; on-demand payouts</li>
                <li>5 team members</li>
                <li>Priority support</li>
              </ul>
              <Link href="/signup" className={`${s.pricingBtn} ${s.pricingBtnFeatured}`}>
                Start 14-Day Trial
              </Link>
            </div>

            <div className={s.pricingCard}>
              <div className={s.pricingTier}>Enterprise</div>
              <div className={s.pricingPrice}>Custom</div>
              <div className={s.pricingSubtext}>Volume discounts available</div>
              <ul className={s.pricingFeatures}>
                <li>Unlimited ledgers</li>
                <li>Everything in Growth</li>
                <li>Custom payout schedules</li>
                <li>Dedicated account manager</li>
                <li>SLA guarantee</li>
                <li>Unlimited team members</li>
                <li>Custom integrations</li>
              </ul>
              <a href="mailto:sales@soledgic.com" className={s.pricingBtn}>Contact Sales</a>
            </div>
          </div>

          <p className={s.pricingFootnote}>
            All plans include payments, ledger, splits, and payouts.
            Additional ledgers: $20/month each.
          </p>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className={s.ctaSection}>
        <h2 className={s.ctaTitle}>
          Your creators deserve to get paid without the chaos.
        </h2>
        <p className={s.ctaDesc}>
          One platform. Payments in, splits calculated, creators paid,
          books balanced. Set it up in five minutes.
        </p>
        <Link href="/signup" className={s.ctaBtnWhite}>
          Start Your Free Account
        </Link>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
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
