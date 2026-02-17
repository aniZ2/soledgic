# soledgic Web Dashboard

## Setup Instructions

### 1. Apply database migration
```bash
cd /Users/osifo/Desktop/soledgic
supabase db push
```

### 2. Enable OAuth providers in Supabase
Go to: https://supabase.com/dashboard/project/soledgic/auth/providers

**Google OAuth:**
1. Go to Google Cloud Console
2. Create OAuth 2.0 credentials
3. Add redirect URI: `https://soledgic.supabase.co/auth/v1/callback`
4. Copy Client ID and Secret to Supabase

**GitHub OAuth:**
1. Go to GitHub Settings > Developer Settings > OAuth Apps
2. Create new app
3. Set callback URL: `https://soledgic.supabase.co/auth/v1/callback`
4. Copy Client ID and Secret to Supabase

### 3. Install dependencies
```bash
cd apps/web
pnpm install
```

### 4. Run development server
```bash
pnpm dev
```

Open http://localhost:3000

---

## Pages Built

### Marketing
- `/` - Landing page with pricing, features, comparison

### Authentication
- `/login` - Sign in (Google, GitHub, email)
- `/signup` - Create account (Google, GitHub, email)
- `/auth/callback` - OAuth callback handler
- `/auth/signout` - Sign out handler

### Dashboard
- `/dashboard` - Main dashboard with stats and recent ledgers
- `/onboarding` - Organization + first ledger setup
- `/ledgers` - List all ledgers
- `/ledgers/new` - Create new ledger
- `/ledgers/[id]` - Ledger detail with stats, transactions, API key
- `/ledgers/[id]/expenses` - Expense list
- `/ledgers/[id]/expenses/new` - Add expense with IRS categories
- `/ledgers/[id]/sales/new` - Record sale
- `/ledgers/[id]/reports` - P&L, trial balance, exports
- `/billing` - Subscription management, plan selection
- `/settings` - Profile, organization, team settings

### API Routes
- `/api/organizations` - List user's organizations
- `/api/ledgers` - Create/list ledgers
- `/api/ledgers/[id]/expenses` - Record expense (proxies to soledgic API)
- `/api/ledgers/[id]/sales` - Record sale (proxies to soledgic API)

---

## Database Tables Added

- `user_profiles` - User account info
- `organizations` - Billing entity
- `organization_members` - Team membership
- `organization_invitations` - Pending invites
- `subscriptions` - Payment Processor subscription sync
- `billing_events` - Payment audit trail
- `pricing_plans` - Plan configuration
- `api_key_scopes` - Role-based API access

---

## Pricing (Final)

| Plan | Price | Ledgers | Team | Overage |
|------|-------|---------|------|---------|
| Pro | $49/mo | 3 | 1 | $20/ledger |
| Business | $249/mo | 10 | 10 | $20/ledger |
| Scale | $999/mo | ∞ | ∞ | - |

- 14-day free trial
- 50% off first month

---

## Still To Build

1. **Payment Processor Integration**
   - Checkout flow
   - Webhook handler
   - Customer portal

2. **Team Features**
   - Invite members
   - Role management
   - Accept invitation flow

3. **Transactions Page**
   - Full transaction history
   - Filters and search
   - Bulk export

4. **Contractors Page**
   - List contractors
   - 1099 tracking
   - Payment history

5. **Reconciliation UI**
   - Import bank statements
   - Matching interface
   - Period close flow

---

## Tech Stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS
- Supabase Auth
- Supabase Database
- Payment Processor (pending)
