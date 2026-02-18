# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** create a public GitHub issue
2. Email security concerns to: security@soledgic.com
3. Include as much detail as possible about the vulnerability
4. Allow 48 hours for initial response

## Security Architecture

### Defense in Depth

Soledgic implements 7 layers of security:

```
Layer 1: DDoS Protection (Cloudflare/CDN)
Layer 2: Rate Limiting (Redis + Database fallback)
Layer 3: Authentication (Supabase Auth + API Keys)
Layer 4: Authorization (Row-Level Security)
Layer 5: Input Validation (Type checking + sanitization)
Layer 6: Audit Logging (Immutable audit trail)
Layer 7: Encryption (TLS + at-rest encryption)
```

### Authentication

- **Password Policy**: Minimum 12 characters with complexity requirements
- **Session Management**: JWT tokens with 1-hour expiry, refresh token rotation
- **API Keys**: SHA-256 hashed, never stored in plaintext
- **MFA**: Available via TOTP authenticator apps

### Authorization

- **Row-Level Security (RLS)**: All database tables protected
- **Organization Isolation**: Multi-tenant data separation
- **Role-Based Access**: Owner, Admin, Member roles
- **API Key Scoping**: Keys bound to specific ledgers

### Data Protection

- **Encryption in Transit**: TLS 1.3 for all connections
- **Encryption at Rest**: AES-256 for database and storage
- **Secret Storage**: Supabase Vault for sensitive tokens
- **PII Handling**: Sanitization before audit logging

## Security Headers

All responses include:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Authentication | 5 req | 5 min |
| API (authenticated) | 200 req | 1 min |
| Payouts | 50 req | 1 min |
| Health check | 5 req | 1 min |

Fail-closed endpoints (block if rate limiting unavailable):
- `execute-payout`
- `process-payout`
- `processor-webhook`
- `bank-feed`

## Input Validation

All inputs are validated for:

- **Type checking**: Strict TypeScript types
- **Length limits**: Maximum string lengths enforced
- **Format validation**: UUID, email, date formats
- **Integer safety**: `Number.isSafeInteger()` checks
- **SQL injection**: Parameterized queries only
- **XSS prevention**: HTML entity encoding

## Audit Logging

All operations are logged with:

- Timestamp
- User/API key identifier
- Action performed
- Entity affected
- IP address (anonymized)
- Request ID for tracing

Audit logs are **immutable** - cannot be modified or deleted.

## Incident Response

1. **Detection**: Automated alerting on security events
2. **Containment**: Emergency controls (maintenance mode, IP blocking)
3. **Investigation**: Audit log analysis
4. **Recovery**: Rollback capabilities, backup restoration
5. **Communication**: User notification within 72 hours

## Compliance

- **SOC 2**: Type II audit in progress
- **GDPR**: Data processing agreements available
- **PCI DSS**: Payment Processor handles card data (Level 1 certified)

## Security Checklist for Developers

### Before Committing

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] No console.log with sensitive data
- [ ] All user input validated
- [ ] Parameterized database queries
- [ ] Error messages don't leak internal details

### For API Endpoints

- [ ] Authentication required
- [ ] Authorization checked (RLS + explicit)
- [ ] Rate limiting enabled
- [ ] Input validation for all parameters
- [ ] Audit logging for mutations

### For Database Changes

- [ ] RLS policies on new tables
- [ ] Indexes for RLS performance
- [ ] No SECURITY DEFINER without search_path
- [ ] Migration tested in development

## Dependencies

Security updates are automated via:

- **Dependabot**: Weekly dependency updates
- **npm audit**: CI/CD pipeline checks
- **CodeQL**: Static analysis on every PR

## Contact

- Security issues: security@soledgic.com
- General questions: support@soledgic.com

---

Last updated: December 2024
