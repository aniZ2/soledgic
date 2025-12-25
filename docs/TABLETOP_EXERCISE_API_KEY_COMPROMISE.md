# Soledgic Tabletop Exercise: API Key Compromise
## Incident Response Simulation
**Exercise Date:** December 22, 2024  
**Duration:** 30 minutes  
**Classification:** Internal Training

---

## Scenario Overview

**INJECT #1 (T+0 minutes)**

You receive an urgent Slack message from a customer:

> "Hey, we think our Soledgic API key might have been exposed. One of our developers 
> accidentally committed it to a public GitHub repo about 2 hours ago. The repo has 
> been private for about 30 minutes now, but we're worried. Our ledger is 'Booklyverse'.
> What should we do?"

---

## Exercise Questions

### Phase 1: Initial Response (T+0 to T+5)

**Q1.1:** What is your immediate response to the customer?

<details>
<summary>Expected Response</summary>

1. Acknowledge receipt and assure them you're taking immediate action
2. Ask for: Ledger ID, approximate time of exposure, any suspicious activity noticed
3. Tell them you will rotate their API key immediately
4. Advise them to update their systems with the new key ASAP

**Sample Response:**
> "Thanks for reporting this immediately. I'm rotating your API key right now. 
> Please stand by for the new key - you'll need to update your integration within 
> the next few minutes. Can you confirm your Ledger ID so I can verify?"
</details>

**Q1.2:** What are your first three technical actions?

<details>
<summary>Expected Response</summary>

1. **Rotate the API key immediately:**
```sql
-- In Supabase SQL Editor
SELECT rotate_api_key('0a885204-e07a-48c1-97e9-495ac96a2581'::UUID);
-- Returns new key (save it securely to send to customer)
```

2. **Check for suspicious activity in the exposure window:**
```sql
SELECT 
  action,
  ip_address,
  request_id,
  risk_score,
  created_at,
  request_body
FROM audit_log
WHERE ledger_id = '0a885204-e07a-48c1-97e9-495ac96a2581'
  AND created_at > NOW() - INTERVAL '3 hours'
ORDER BY created_at DESC
LIMIT 100;
```

3. **Check for any payouts or high-risk transactions:**
```sql
SELECT * FROM transactions
WHERE ledger_id = '0a885204-e07a-48c1-97e9-495ac96a2581'
  AND created_at > NOW() - INTERVAL '3 hours'
  AND transaction_type IN ('payout', 'transfer', 'refund')
ORDER BY created_at DESC;
```
</details>

---

### Phase 2: Investigation (T+5 to T+15)

**INJECT #2 (T+5 minutes)**

Your audit log query reveals the following:

```
| action      | ip_address    | risk_score | created_at          |
|-------------|---------------|------------|---------------------|
| get_balance | 203.0.113.42  | 10         | 2024-12-22 14:30:00 |
| get_balance | 203.0.113.42  | 10         | 2024-12-22 14:30:01 |
| get_balance | 203.0.113.42  | 10         | 2024-12-22 14:30:02 |
| record_sale | 203.0.113.42  | 10         | 2024-12-22 14:31:00 |
| record_sale | 203.0.113.42  | 10         | 2024-12-22 14:31:01 |
| record_sale | 198.51.100.5  | 10         | 2024-12-22 14:45:00 | <- Customer's known IP
| get_balance | 198.51.100.5  | 10         | 2024-12-22 14:50:00 |
```

**Q2.1:** What does this tell you? Is this an active compromise?

<details>
<summary>Expected Response</summary>

**Yes, this appears to be an active compromise:**

1. IP `203.0.113.42` is NOT the customer's IP (`198.51.100.5`)
2. The unknown IP made multiple requests in rapid succession (reconnaissance)
3. The unknown IP attempted `record_sale` - potentially injecting fake transactions
4. Timeline: Unknown IP activity at 14:30-14:31, customer activity at 14:45+

**This is not a drill scenario - immediate escalation required.**
</details>

**Q2.2:** What additional queries do you run?

<details>
<summary>Expected Response</summary>

1. **Identify all transactions from the suspicious IP:**
```sql
SELECT * FROM transactions t
JOIN audit_log a ON a.entity_id = t.id::text
WHERE a.ip_address = '203.0.113.42'
  AND a.ledger_id = '0a885204-e07a-48c1-97e9-495ac96a2581';
```

2. **Check if the suspicious IP hit any other ledgers:**
```sql
SELECT DISTINCT ledger_id, COUNT(*) as request_count
FROM audit_log
WHERE ip_address = '203.0.113.42'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY ledger_id;
```

3. **Get full details of any transactions created:**
```sql
SELECT 
  t.*,
  json_agg(e.*) as entries
FROM transactions t
LEFT JOIN entries e ON e.transaction_id = t.id
WHERE t.ledger_id = '0a885204-e07a-48c1-97e9-495ac96a2581'
  AND t.created_at > NOW() - INTERVAL '3 hours'
GROUP BY t.id
ORDER BY t.created_at DESC;
```

4. **Check rate_limits for any violations:**
```sql
SELECT * FROM rate_limits
WHERE key LIKE '%0a885204%'
  AND created_at > NOW() - INTERVAL '3 hours';
```
</details>

**Q2.3:** Should you block IP 203.0.113.42? How?

<details>
<summary>Expected Response</summary>

**Yes, block immediately:**

1. **Add to blocked IPs (immediate):**
   - Go to Supabase Dashboard > Edge Functions > Secrets
   - Update `BLOCKED_IPS` to include `203.0.113.42`
   - Or via CLI: `supabase secrets set BLOCKED_IPS=203.0.113.42`

2. **Verify the block is working:**
```bash
curl -X GET "https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1/get-balance" \
  -H "x-api-key: sk_live_test" \
  -H "X-Forwarded-For: 203.0.113.42"
# Should return 403 Forbidden
```

3. **Consider broader action if attack persists:**
   - Enable `ALLOWLIST_MODE=true` temporarily
   - Only allow known good API keys
</details>

---

### Phase 3: Containment & Recovery (T+15 to T+25)

**INJECT #3 (T+15 minutes)**

Investigation reveals 2 fraudulent transactions were created:

```
| id          | type        | amount  | creator_id      | status    |
|-------------|-------------|---------|-----------------|-----------|
| txn_abc123  | sale        | 9999900 | attacker_payout | completed |
| txn_def456  | sale        | 5000000 | attacker_payout | completed |
```

The attacker created fake sales crediting a creator_id they control, totaling $149,999 in fake revenue.

**Q3.1:** What is your containment strategy?

<details>
<summary>Expected Response</summary>

1. **Reverse the fraudulent transactions immediately:**
```sql
-- Reverse transaction 1
SELECT reverse_transaction(
  'txn_abc123'::UUID,
  'Fraudulent transaction - API key compromise',
  'security_incident'
);

-- Reverse transaction 2
SELECT reverse_transaction(
  'txn_def456'::UUID,
  'Fraudulent transaction - API key compromise',
  'security_incident'
);
```

2. **Block any payouts to the attacker's creator_id:**
```sql
-- Check if any payouts are pending
SELECT * FROM payouts
WHERE ledger_id = '0a885204-e07a-48c1-97e9-495ac96a2581'
  AND status IN ('pending', 'processing');

-- Cancel any pending payouts
UPDATE payouts
SET status = 'cancelled',
    metadata = metadata || '{"cancelled_reason": "security_incident"}'::jsonb
WHERE ledger_id = '0a885204-e07a-48c1-97e9-495ac96a2581'
  AND status = 'pending';
```

3. **Verify ledger balance is restored:**
```sql
SELECT * FROM get_quick_health_status('0a885204-e07a-48c1-97e9-495ac96a2581');
```
</details>

**Q3.2:** What do you communicate to the customer?

<details>
<summary>Expected Response</summary>

**Incident Communication (send via secure channel):**

---

Subject: Security Incident Update - Immediate Action Required

Hi [Customer],

**Summary:** We've confirmed unauthorized access using your exposed API key. We've contained the incident.

**What happened:**
- An unauthorized party used your exposed API key between 14:30-14:31 UTC
- They created 2 fraudulent sale transactions totaling $149,999
- No real money was moved - these were ledger entries only
- We have reversed both transactions

**Actions taken:**
1. ✅ Your API key has been rotated (new key sent separately)
2. ✅ Fraudulent transactions reversed
3. ✅ Attacker's IP blocked
4. ✅ Your ledger balance verified correct

**Action required from you:**
1. Update your integration with the new API key immediately
2. Review your GitHub repository access and secrets management
3. Consider implementing secret scanning (GitHub has this built-in)

**Timeline of incident:**
- 12:30 UTC - API key exposed to public GitHub
- 14:30 UTC - Unauthorized access begins
- 15:00 UTC - Repository made private
- 15:30 UTC - Incident reported to us
- 15:35 UTC - API key rotated, attacker blocked
- 15:45 UTC - Fraudulent transactions reversed

We take security seriously. Please let us know if you have questions.

---
</details>

---

### Phase 4: Post-Incident (T+25 to T+30)

**Q4.1:** What are your post-incident actions?

<details>
<summary>Expected Response</summary>

**Immediate (Today):**
1. Complete incident report in `/docs/incidents/2024-12-22-api-key-compromise.md`
2. Log security alert in `security_alerts` table
3. Notify any other affected parties (if applicable)

**Short-term (This Week):**
1. Review and improve key rotation process
2. Add automated GitHub secret scanning alerts
3. Consider implementing IP allowlisting as optional feature for customers
4. Review rate limits on sensitive endpoints

**Long-term (This Month):**
1. Implement anomaly detection for unusual transaction patterns
2. Add customer notification system for suspicious activity
3. Create customer security guide for API key management
4. Consider webhook signing for additional auth layer
</details>

**Q4.2:** What documentation do you create?

<details>
<summary>Expected Response</summary>

**1. Incident Report (`/docs/incidents/2024-12-22-api-key-compromise.md`):**
- Timeline of events
- Root cause analysis
- Actions taken
- Lessons learned
- Preventive measures

**2. Audit Log Entry:**
```sql
INSERT INTO audit_log (
  ledger_id,
  action,
  entity_type,
  actor_type,
  actor_id,
  ip_address,
  request_body,
  risk_score
) VALUES (
  '0a885204-e07a-48c1-97e9-495ac96a2581',
  'security_incident_resolved',
  'incident',
  'system',
  'security_team',
  NULL,
  '{
    "incident_type": "api_key_compromise",
    "fraudulent_transactions": 2,
    "amount_reversed": 14999900,
    "attacker_ip": "203.0.113.42",
    "resolution_time_minutes": 15
  }',
  90
);
```

**3. Security Alert Record:**
```sql
INSERT INTO security_alerts (
  severity,
  alert_type,
  title,
  details,
  acknowledged_at,
  acknowledged_by
) VALUES (
  'critical',
  'api_key_compromise',
  'API Key Compromise - Booklyverse',
  '{
    "ledger_id": "0a885204-e07a-48c1-97e9-495ac96a2581",
    "exposure_source": "public_github",
    "attacker_ip": "203.0.113.42",
    "transactions_reversed": 2
  }',
  NOW(),
  'anita'
);
```
</details>

---

## Exercise Debrief

### What Went Well?
- [ ] Immediate key rotation capability exists
- [ ] Audit logs captured attacker activity
- [ ] IP blocking mechanism available
- [ ] Transaction reversal process works

### Areas for Improvement
- [ ] Automated alerting for unusual patterns
- [ ] Customer self-service key rotation
- [ ] Real-time suspicious activity notifications
- [ ] Faster detection (2 hours is too long)

### Action Items from Exercise

| Item | Priority | Owner | Due |
|------|----------|-------|-----|
| Implement anomaly detection alerts | High | Anita | 2 weeks |
| Add customer security documentation | Medium | Anita | 1 week |
| Create incident report template | Low | Anita | 1 week |
| Review rate limits on record-sale | Medium | Anita | 1 week |

---

## Appendix: Quick Reference Commands

### Rotate API Key
```sql
SELECT rotate_api_key('LEDGER_UUID'::UUID);
```

### Block IP Address
```bash
supabase secrets set BLOCKED_IPS=ip1,ip2,ip3
```

### Enable Maintenance Mode
```bash
supabase secrets set MAINTENANCE_MODE=true
```

### Enable Allowlist Mode
```bash
supabase secrets set ALLOWLIST_MODE=true
supabase secrets set ALLOWED_API_KEYS=key1,key2
```

### Check Recent Security Events
```sql
SELECT * FROM audit_log 
WHERE risk_score >= 50 
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY risk_score DESC;
```

---

*Exercise completed. File for compliance records.*
