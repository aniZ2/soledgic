import Link from 'next/link'
import s from './landing.module.css'

export default function HomePage() {
  return (
    <div className={s.page}>
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

      <section className={s.hero}>
        <div className={s.heroLabel}>
          <span className={s.heroLabelDot} />
          Financial infrastructure for digital platforms
        </div>

        <h1 className={s.heroTitle}>
          The financial backend for platforms that{' '}
          <span className={s.heroTitleAccent}>move money.</span>
        </h1>

        <p className={s.heroSub}>
          Soledgic gives marketplaces, creator platforms, and embedded-payment
          products one system for checkout, revenue splits, payouts, ledgers,
          reconciliation, reporting, and webhooks.
        </p>

        <div className={s.heroCtas}>
          <Link href="/signup" className={s.btnPrimary}>Start Free</Link>
          <Link href="/docs" className={s.btnGhost}>Read the Docs</Link>
        </div>

        <div className={s.heroVisual}>
          <div className={s.flowDiagram}>
            <div className={s.flowNode}>
              <div className={s.flowNodeIcon}>🛒</div>
              <span className={s.flowNodeLabel}>Buyer</span>
              <span className={s.flowNodeSub}>Checks out once</span>
            </div>

            <div className={s.flowArrow} />

            <div className={`${s.flowNode} ${s.flowCenter}`}>
              <div className={s.flowCenterPulse} />
              <div className={s.flowCenterIcon}>S</div>
              <span className={s.flowNodeLabel}>Soledgic</span>
              <span className={s.flowNodeSub}>Charges, splits, records</span>
            </div>

            <div className={s.flowArrow} />

            <div className={s.flowNode}>
              <div className={s.flowNodeIcon}>💸</div>
              <span className={s.flowNodeLabel}>Seller / Creator</span>
              <span className={s.flowNodeSub}>Gets paid on schedule</span>
            </div>

            <div className={s.flowArrow} />

            <div className={s.flowNode}>
              <div className={s.flowNodeIcon}>📚</div>
              <span className={s.flowNodeLabel}>Finance Team</span>
              <span className={s.flowNodeSub}>Closes from the same ledger</span>
            </div>
          </div>
        </div>
      </section>

      <div className={s.metrics}>
        <div className={s.metric}>
          <div className={s.metricValue}>&lt;100ms</div>
          <div className={s.metricLabel}>Ledger writes</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricValue}>2 modes</div>
          <div className={s.metricLabel}>Marketplace or standard</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricValue}>1 ledger</div>
          <div className={s.metricLabel}>System of record</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricValue}>Zero-drift</div>
          <div className={s.metricLabel}>Balance reconciliation</div>
        </div>
      </div>

      <section className={s.problemSection} id="how">
        <div className={s.problemInner}>
          <div className={s.problemGrid}>
            <div className={s.problemSide}>
              <h2>
                Most platforms can charge a card. Few can explain{' '}
                <span>where the money went.</span>
              </h2>
              <ul className={s.problemList}>
                <li className={s.problemItem}>
                  <div className={s.problemIcon}>💳</div>
                  <div className={s.problemText}>
                    <h4>A payment processor</h4>
                    <p>That moves money, but leaves you to calculate splits, holds, payout timing, refunds, and downstream state.</p>
                  </div>
                </li>
                <li className={s.problemItem}>
                  <div className={s.problemIcon}>📒</div>
                  <div className={s.problemText}>
                    <h4>Accounting software</h4>
                    <p>That closes books after the fact, but does not run checkout, creator balances, settlement, or payout operations.</p>
                  </div>
                </li>
                <li className={s.problemItem}>
                    <div className={s.problemIcon}>🧑‍💻</div>
                  <div className={s.problemText}>
                    <h4>Internal glue and spreadsheets</h4>
                    <p>Multiple sources of truth for product, finance, support, and ops. Month-end, reconciliation, and audit prep become manual work.</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className={s.solutionSide}>
              <h3>Soledgic becomes the operating layer.</h3>
              <p>
                The same system that helps your platform accept money also
                tracks balances, controls payouts, powers reporting, and exposes
                the data back to your product and finance team.
              </p>
              <div className={s.solutionSteps}>
                <div className={s.solutionStep}>
                  <div className={s.stepNumber}>1</div>
                  <div className={s.stepContent}>
                    <h4>Launch checkout and billing flows</h4>
                    <p>Create ledgers, issue API keys, configure payment rails, and start collecting payments through one platform surface.</p>
                  </div>
                </div>
                <div className={s.solutionStep}>
                  <div className={s.stepNumber}>2</div>
                  <div className={s.stepContent}>
                    <h4>Split, hold, and record every movement</h4>
                    <p>Sales, fees, reserves, refunds, and transfers are written into a double-entry ledger instead of scattered across tools.</p>
                  </div>
                </div>
                <div className={s.solutionStep}>
                  <div className={s.stepNumber}>3</div>
                  <div className={s.stepContent}>
                    <h4>Run balances and payouts with confidence</h4>
                    <p>Pay creators, sellers, contractors, or vendors on schedule, expose payout setup flows, and keep platform and recipient balances in sync.</p>
                  </div>
                </div>
                <div className={s.solutionStep}>
                  <div className={s.stepNumber}>4</div>
                  <div className={s.stepContent}>
                    <h4>Close, report, and monitor from the same source</h4>
                    <p>P&amp;L, balance sheet, tax summaries, reconciliation, webhooks, and operational monitoring all come from the same data model.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={s.section} id="capabilities">
        <p className={s.sectionEyebrow}>Capabilities</p>
        <h2 className={s.sectionTitle}>Everything your platform finance stack needs</h2>
        <p className={s.sectionDesc}>
          Soledgic is not just a payments integration. It is the product and
          finance infrastructure that sits between checkout and month-end.
        </p>

        <div className={s.capGrid}>
          <div className={s.capCard}>
            <span className={s.capEmoji}>🧾</span>
            <h3 className={s.capTitle}>Checkout &amp; Payment Orchestration</h3>
            <p className={s.capDesc}>
              Create checkout sessions, support hosted payment flows, store
              billing methods, and keep processor events flowing back into
              platform state.
            </p>
          </div>
          <div className={s.capCard}>
            <span className={s.capEmoji}>⚖️</span>
            <h3 className={s.capTitle}>Revenue Splits &amp; Funds Control</h3>
            <p className={s.capDesc}>
              Configure split logic, withholding, held funds, settlement
              timing, and fee treatment across creators, products, or
              platform-specific rules.
            </p>
          </div>
          <div className={s.capCard}>
            <span className={s.capEmoji}>💸</span>
            <h3 className={s.capTitle}>Payouts &amp; Recipient Operations</h3>
            <p className={s.capDesc}>
              Onboard payout recipients, check eligibility, trigger scheduled
              or on-demand payouts, and surface earnings and statements through
              a creator-facing portal.
            </p>
          </div>
          <div className={s.capCard}>
            <span className={s.capEmoji}>📖</span>
            <h3 className={s.capTitle}>Ledger, Balances &amp; Reconciliation</h3>
            <p className={s.capDesc}>
              Every transaction lands in a double-entry ledger with balances,
              transaction history, period controls, imported bank lines, and
              reconciliation tooling.
            </p>
          </div>
          <div className={s.capCard}>
            <span className={s.capEmoji}>🛡️</span>
            <h3 className={s.capTitle}>Reports, Tax &amp; Period Close</h3>
            <p className={s.capDesc}>
              Generate P&amp;L, balance sheet, trial balance, AP/AR aging, tax
              summaries, statements, runway projections, and frozen close-period
              snapshots.
            </p>
          </div>
          <div className={s.capCard}>
            <span className={s.capEmoji}>🧠</span>
            <h3 className={s.capTitle}>Developer, Risk &amp; Ops Tooling</h3>
            <p className={s.capDesc}>
              API keys, outbound webhooks, docs, SDKs, alerting, preflight
              authorization, shadow-ledger projections, and operational health
              monitoring are built in.
            </p>
          </div>
        </div>
      </section>

      <section className={s.builtForSection} id="built-for">
        <div className={s.builtForInner}>
          <p className={s.sectionEyebrow}>Built For</p>
          <h2 className={s.sectionTitle}>Platforms with multi-party money flow</h2>
          <p className={s.sectionDesc}>
            If your product collects money from one party and owes it to
            another, Soledgic is the infrastructure layer underneath.
          </p>

          <div className={s.builtForGrid}>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>📚</span>
              <div className={s.builtForLabel}>Creator Economy</div>
              <h3 className={s.builtForTitle}>Creator &amp; Publishing Platforms</h3>
              <p className={s.builtForDesc}>
                Royalties, subscriptions, digital sales, recurring payouts, and
                creator statements without stitching together a back office.
              </p>
            </div>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>🏪</span>
              <div className={s.builtForLabel}>Marketplaces</div>
              <h3 className={s.builtForTitle}>Digital &amp; Service Marketplaces</h3>
              <p className={s.builtForDesc}>
                Platform commissions, seller balances, held funds, refunds, and
                payout schedules for two-sided transactions.
              </p>
            </div>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>🎓</span>
              <div className={s.builtForLabel}>Education</div>
              <h3 className={s.builtForTitle}>Course &amp; Learning Platforms</h3>
              <p className={s.builtForDesc}>
                Instructor splits, cohort billing, recurring subscriptions, and
                financial reporting for education products.
              </p>
            </div>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>🎵</span>
              <div className={s.builtForLabel}>Music &amp; Audio</div>
              <h3 className={s.builtForTitle}>Streaming &amp; Distribution Platforms</h3>
              <p className={s.builtForDesc}>
                Revenue sharing, royalty logic, label payouts, and reporting for
                platforms with ongoing earnings distribution.
              </p>
            </div>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>📡</span>
              <div className={s.builtForLabel}>Media</div>
              <h3 className={s.builtForTitle}>Newsletter &amp; Podcast Platforms</h3>
              <p className={s.builtForDesc}>
                Subscription billing, sponsorship revenue allocation, and
                statement-ready payouts for media businesses.
              </p>
            </div>
            <div className={s.builtForCard}>
              <span className={s.builtForEmoji}>⚙️</span>
              <div className={s.builtForLabel}>Embedded Finance</div>
              <h3 className={s.builtForTitle}>Software Products with Money Movement</h3>
              <p className={s.builtForDesc}>
                Accept payments, collect fees, pay counterparties, and maintain
                clean books without building your own financial backend.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={s.pricingSection} id="pricing">
        <div className={s.pricingInner}>
          <p className={s.sectionEyebrow}>Pricing</p>
          <h2 className={s.sectionTitle}>Start with the infrastructure, not the overhead.</h2>
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

      <section className={s.ctaSection}>
        <h2 className={s.ctaTitle}>
          If your product moves money between multiple parties, this is the layer that keeps it coherent.
        </h2>
        <p className={s.ctaDesc}>
          Payments in. Splits calculated. Payouts sent. Books balanced.
          Product, finance, and operations all work from the same source of truth.
        </p>
        <Link href="/signup" className={s.ctaBtnWhite}>
          Start Your Free Account
        </Link>
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
