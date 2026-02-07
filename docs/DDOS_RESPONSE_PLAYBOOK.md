# Soledgic DDoS Response Playbook

## 🚨 Alert System Overview

### How Alerts Work

```
Audit Log → Security Monitor (cron) → Email Alert
    ↓
┌─────────────────────────────────────────────────┐
│ Checks every 15 minutes:                        │
│ • Rate limit hits (threshold: 100/hour)         │
│ • Auth failures (threshold: 50/hour)            │
│ • DB fallback activations (threshold: 5/hour)   │
│ • Unique IPs rate-limited (threshold: 20/hour)  │
└─────────────────────────────────────────────────┘
```

### Alert Severity Levels

| Level | Trigger | Action Required |
|-------|---------|-----------------|
| **CRITICAL** | 300+ rate limits OR 20+ unique IPs OR 100+ auth failures | Immediate response |
| **WARNING** | 100+ rate limits OR 50+ auth failures OR 5+ DB fallbacks | Investigate within 1 hour |
| **INFO** | Minor anomalies | Review during business hours |

---

## 🛡️ DDoS Response Procedures

### Level 1: Automated Protection (No Action Needed)

Your system handles these automatically:

1. **Rate Limiting** - Attackers blocked at 200 req/min per API key
2. **DB Fallback** - If Redis fails, Postgres takes over at 10% capacity
3. **Fail-Closed** - Sensitive endpoints block when rate limiting unavailable

**You'll know it's working when:**
- You receive a WARNING alert about rate limit hits
- Logs show "DB Fallback Protection Active"
- Your legitimate customers are unaffected

### Level 2: Manual Intervention Required

**Trigger:** CRITICAL alert or sustained attack for 30+ minutes

#### Step 1: Assess the Attack

```bash
# Check Supabase logs for attack pattern
# Go to: Supabase Dashboard → Logs → Edge Functions

# Look for:
# - Which endpoints are targeted
# - Source IP addresses
# - Request patterns
```

#### Step 2: Enable Cloudflare Under Attack Mode

If you're using Cloudflare:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain
3. Click **Security** → **Settings**
4. Set **Security Level** to **I'm Under Attack**

This adds a 5-second JavaScript challenge to all requests, blocking most bots.

#### Step 3: Block Malicious IPs

**Option A: Cloudflare Firewall Rules**

1. Go to Cloudflare → **Security** → **WAF** → **Custom Rules**
2. Create rule:
   ```
   Rule name: Block DDoS IPs
   Expression: (ip.src in {1.2.3.4 5.6.7.8 9.10.11.12})
   Action: Block
   ```

**Option B: Supabase Edge Function IP Block**

Add to `_shared/utils.ts`:

```typescript
const BLOCKED_IPS = [
  '1.2.3.4',
  '5.6.7.8',
  // Add malicious IPs here
]

// In createHandler, add early check:
const clientIp = getClientIp(req)
if (clientIp && BLOCKED_IPS.includes(clientIp)) {
  return new Response('Forbidden', { status: 403 })
}
```

#### Step 4: Increase Rate Limit Strictness

Temporarily reduce limits in `utils.ts`:

```typescript
// During attack - reduce all limits by 50%
const RATE_LIMITS: Record<string, { requests: number; windowSeconds: number }> = {
  'record-sale': { requests: 100, windowSeconds: 60 },  // Was 200
  // ... reduce others
}
```

### Level 3: Emergency Procedures

**Trigger:** System degradation, legitimate users affected

#### Option A: Maintenance Mode

Create a simple response that blocks all non-essential traffic:

```typescript
// In each Edge Function, add at the top:
const MAINTENANCE_MODE = Deno.env.get('MAINTENANCE_MODE') === 'true'

if (MAINTENANCE_MODE) {
  return new Response(
    JSON.stringify({ 
      error: 'System temporarily unavailable for maintenance',
      retry_after: 300 
    }),
    { status: 503, headers: { 'Retry-After': '300' } }
  )
}
```

Enable via Supabase secrets:
```bash
supabase secrets set MAINTENANCE_MODE=true
```

#### Option B: Allowlist Mode

Only allow known good API keys:

```typescript
const ALLOWLIST_MODE = Deno.env.get('ALLOWLIST_MODE') === 'true'
const ALLOWED_KEYS = (Deno.env.get('ALLOWED_API_KEYS') || '').split(',')

// In validateApiKey, after normal validation:
if (ALLOWLIST_MODE && !ALLOWED_KEYS.includes(apiKey)) {
  return null  // Reject non-allowlisted keys
}
```

---

## 📊 Monitoring Dashboards

### Upstash Redis

**URL:** https://console.upstash.com

**Watch for:**
- Commands/second spike
- Memory usage
- Bandwidth usage approaching quota
- Latency increases

### Supabase

**URL:** https://supabase.com/dashboard

**Check:**
- Edge Function invocations
- Database CPU usage
- API request count
- Error rates

### Cloudflare (if enabled)

**URL:** https://dash.cloudflare.com

**Monitor:**
- Requests by country
- Threat events
- Bot traffic percentage
- WAF events

---

## 🔧 Environment Variables Required

Add these to Supabase Edge Function secrets:

```bash
# Email alerts
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set SECURITY_ALERT_EMAIL=your-email@company.com

# Cron authentication
supabase secrets set CRON_SECRET=your-random-secret-here

# Emergency controls
supabase secrets set MAINTENANCE_MODE=false
supabase secrets set ALLOWLIST_MODE=false
supabase secrets set ALLOWED_API_KEYS=key1,key2,key3
```

---

## ⏰ Cron Job Setup

Add to your cron configuration (Supabase or external):

```bash
# Run security check every 15 minutes
*/15 * * * * curl -X POST \
  "https://YOUR_PROJECT.supabase.co/functions/v1/security-alerts" \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

Or use Supabase's built-in cron:

```sql
-- In Supabase SQL Editor
SELECT cron.schedule(
  'security-alerts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/security-alerts',
    headers := '{"x-cron-secret": "YOUR_CRON_SECRET"}'::jsonb
  );
  $$
);
```

---

## 📋 Post-Attack Checklist

After an attack is mitigated:

- [ ] Review audit logs for attack timeline
- [ ] Identify and document attack vectors
- [ ] Update blocked IP list
- [ ] Review rate limits - adjust if needed
- [ ] Check for any data integrity issues
- [ ] Update this playbook with lessons learned
- [ ] Consider upgrading Upstash/Cloudflare plans if limits were reached

---

## 📞 Emergency Contacts

| Service | Contact | Purpose |
|---------|---------|---------|
| Upstash Support | support@upstash.com | Redis issues |
| Supabase Support | support@supabase.io | Database/Edge issues |
| Cloudflare Support | (Dashboard) | DDoS mitigation |

---

## 🔄 Regular Maintenance

**Weekly:**
- Review security alert history
- Clean up old rate_limits records: `SELECT cleanup_rate_limits();`
- Check Upstash quota usage

**Monthly:**
- Review and update blocked IP list
- Test alert system with mock data
- Review rate limit thresholds based on traffic patterns

---

**Last Updated:** December 22, 2025
