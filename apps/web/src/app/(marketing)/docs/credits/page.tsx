export default function CreditsPage() {
  return (
    <div>
      <h1>Credits</h1>
      <p className="text-xl text-muted-foreground mt-2">
        A virtual currency system for in-app rewards and purchases. Credits let platforms
        incentivize user engagement while maintaining full financial integrity.
      </p>

      {/* ── How Credits Work ────────────────────────────────── */}
      <h2 id="how-credits-work">How Credits Work</h2>

      <div className="not-prose p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg mb-6">
        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
          Standard rate: <strong>1,000 credits = $1 USD</strong>. This rate is fixed globally across all platforms.
        </p>
      </div>

      <p>
        Credits flow through four stages. Each stage is a separate API call,
        giving your platform full control over the user experience.
      </p>

      <div className="not-prose my-8">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          {[
            { step: '1', title: 'Issue', desc: 'Platform awards credits to a user', color: 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300' },
            { step: '2', title: 'Convert', desc: 'User converts credits to spendable balance', color: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300' },
            { step: '3', title: 'Spend', desc: 'User purchases creator content', color: 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300' },
            { step: '4', title: 'Payout', desc: 'Creator withdraws real money', color: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300' },
          ].map((s) => (
            <div key={s.step} className={`flex-1 p-4 rounded-lg border ${s.color}`}>
              <div className="text-xs font-semibold uppercase mb-1">Step {s.step}</div>
              <div className="font-bold">{s.title}</div>
              <div className="text-sm mt-1 opacity-80">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <h3>Key Guarantees</h3>
      <ul>
        <li><strong>Credits are backed by platform budget</strong> — every credit issued creates a real financial obligation on the platform{"'"}s books.</li>
        <li><strong>Credits are not cash</strong> — users cannot withdraw credits or spendable balance as real money.</li>
        <li><strong>Only creators receive real payouts</strong> — when credits are spent on content, the creator earns real revenue through the normal payout flow.</li>
        <li><strong>Budget controls prevent overissuance</strong> — platforms set a monthly credit budget. Once exhausted, no more credits can be issued until the next month.</li>
      </ul>

      {/* ── API Reference ────────────────────────────────────── */}
      <h2 id="api-reference">API Reference</h2>

      <p>All credit operations use a single endpoint with an <code>action</code> field.</p>

      <h3>Issue Credits</h3>
      <p>Award credits to a user. Budget-checked against the org{"'"}s monthly limit.</p>

      <div className="not-prose">
        <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-sm text-slate-100">
{`curl -X POST "https://api.soledgic.com/v1/credits" \\
  -H "x-api-key: slk_test_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "issue",
    "user_id": "user_123",
    "credits": 5000,
    "reason": "referral_bonus"
  }'`}
        </pre>
      </div>

      <div className="not-prose mt-4">
        <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-sm text-green-300">
{`{
  "success": true,
  "user_id": "user_123",
  "credits_issued": 5000,
  "usd_value": 5.00,
  "transaction_id": "txn_abc123",
  "budget_remaining_cents": 495000
}`}
        </pre>
      </div>

      <h3>Convert Credits</h3>
      <p>
        Convert earned credits into a spendable balance. Minimum conversion: <strong>5,000 credits ($5)</strong>.
        Credits in the wallet are unconverted — they must be converted before spending.
      </p>

      <div className="not-prose">
        <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-sm text-slate-100">
{`curl -X POST "https://api.soledgic.com/v1/credits" \\
  -H "x-api-key: slk_test_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "convert",
    "user_id": "user_123",
    "credits": 5000
  }'`}
        </pre>
      </div>

      <h3>Spend (Redeem)</h3>
      <p>
        User spends their spendable balance on creator content. The creator/platform split applies
        just like a real-money purchase. Amount is in <strong>cents</strong>.
      </p>

      <div className="not-prose">
        <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-sm text-slate-100">
{`curl -X POST "https://api.soledgic.com/v1/credits" \\
  -H "x-api-key: slk_test_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "redeem",
    "user_id": "user_123",
    "creator_id": "creator_456",
    "amount": 500,
    "reference_id": "purchase_abc"
  }'`}
        </pre>
      </div>

      <div className="not-prose mt-4">
        <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-sm text-green-300">
{`{
  "success": true,
  "transaction_id": "txn_def456",
  "amount": 5.00,
  "creator_share": 4.00,
  "platform_share": 1.00,
  "user_remaining_balance": 0.00
}`}
        </pre>
      </div>

      <h3>Check Balance</h3>
      <p>Returns both the unconverted credit balance and the spendable USD balance.</p>

      <div className="not-prose">
        <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-sm text-slate-100">
{`curl -X POST "https://api.soledgic.com/v1/credits" \\
  -H "x-api-key: slk_test_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "balance",
    "user_id": "user_123"
  }'`}
        </pre>
      </div>

      <div className="not-prose mt-4">
        <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-sm text-green-300">
{`{
  "success": true,
  "user_id": "user_123",
  "credits": 10000,
  "credits_usd_value": 10.00,
  "spendable_usd": 5.00,
  "conversion_rate": "1000 credits = $1"
}`}
        </pre>
      </div>

      {/* ── Rules & Limits ───────────────────────────────────── */}
      <h2 id="rules">Rules &amp; Limits</h2>

      <div className="not-prose">
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-foreground">Rule</th>
              <th className="px-4 py-3 text-left font-medium text-foreground">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr><td className="px-4 py-3">Conversion rate</td><td className="px-4 py-3"><code>1,000 credits = $1 USD</code> (fixed, global)</td></tr>
            <tr><td className="px-4 py-3">Minimum conversion</td><td className="px-4 py-3">5,000 credits ($5)</td></tr>
            <tr><td className="px-4 py-3">User withdrawal</td><td className="px-4 py-3">Not allowed. Credits and spendable balance can only be spent in-app.</td></tr>
            <tr><td className="px-4 py-3">Creator payouts</td><td className="px-4 py-3">Normal payout flow. Creators earn real money from credit-funded purchases.</td></tr>
            <tr><td className="px-4 py-3">Monthly budget</td><td className="px-4 py-3">Set via org settings. Issuance blocked when budget is exhausted.</td></tr>
            <tr><td className="px-4 py-3">Custom rates</td><td className="px-4 py-3">Not supported. The 1000:$1 rate is enforced at the Soledgic level.</td></tr>
            <tr><td className="px-4 py-3">Display names</td><td className="px-4 py-3">Platforms can brand credits however they want (Coins, Stars, Energy) — the underlying rate is always 1000:$1.</td></tr>
          </tbody>
        </table>
      </div>

      <h3>SDK Usage</h3>

      <div className="not-prose">
        <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-sm text-slate-100">
{`import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({ apiKey: 'slk_test_...' })

// Issue 5000 credits ($5) to a user
await soledgic.issueCredits('user_123', 5000, {
  reason: 'weekly_login_bonus'
})

// Convert credits to spendable balance
await soledgic.convertCredits('user_123', 5000)

// User buys $5 content from a creator
await soledgic.redeemCredits('user_123', 'creator_456', 500, 'purchase_xyz')

// Check balance
const balance = await soledgic.getCreditBalance('user_123')
// { credits: 0, spendable_usd: 0.00 }`}
        </pre>
      </div>

      <div className="not-prose mt-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          <strong>Important:</strong> Credits represent a financial obligation. Every credit issued is backed
          by your platform{"'"}s monthly budget. Monitor your credit issuance carefully to
          avoid unexpected payout obligations.
        </p>
      </div>
    </div>
  )
}
