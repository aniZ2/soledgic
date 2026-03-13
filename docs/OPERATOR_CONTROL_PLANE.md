# Operator Control Plane

This document covers the Soledgic routes and scripts that are intentionally not part of the public `/v1` API contract.

These surfaces are for dashboard operators and internal tooling only.

## Security Boundary

The operator control plane is separate from the public treasury API.

Public integration surface:

- `/v1/*`
- authenticated with `x-api-key`
- documented in `docs/openapi.yaml`
- wrapped by `@soledgic/sdk`

Operator control-plane surface:

- `/api/identity/*`
- `/api/ecosystems/*`
- authenticated dashboard session required
- CSRF protection enabled on mutating routes
- handlers run server-side with the service-role client
- intentionally excluded from the public SDK and OpenAPI spec

Do not expose these routes directly to third-party platform backends.

## Identity Routes

These routes are implemented in the Next.js app and require an authenticated user session.

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/identity/profile` | `GET`, `PATCH` | Shared user profile metadata |
| `/api/identity/tax-profile` | `GET`, `PUT` | Shared tax profile for the signed-in user |
| `/api/identity/payout-profile` | `GET`, `PUT` | Shared payout preferences for the signed-in user |
| `/api/identity/portfolio` | `GET` | Read-only balance summary across linked participants |
| `/api/identity/participants` | `POST` | Link a ledger participant to a user |
| `/api/identity/participants/{linkId}` | `DELETE` | Unlink a participant identity link |

Important constraints:

- balances remain ledger-scoped
- portfolio is read-only aggregation, not pooled money
- self-linking requires a matching participant email unless the operator is an org owner/admin

## Ecosystem Routes

These routes manage groups of related organizations/platforms.

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/ecosystems/current` | `GET` | Return the current user's active ecosystem summary |
| `/api/ecosystems/current` | `PATCH` | Update current ecosystem metadata or move the current organization into another ecosystem |

Important constraints:

- ecosystems group platforms for identity and portfolio visibility
- ecosystems do not merge ledgers or balances
- moving a platform into another ecosystem requires ecosystem ownership/admin rights

## Data Model

The operator control plane sits above the public treasury resources.

Core tables:

- `user_profiles`
- `participant_identity_links`
- `shared_tax_profiles`
- `shared_payout_profiles`
- `ecosystems`
- `ecosystem_memberships`

The public treasury tables remain ledger-scoped:

- `ledgers`
- `accounts`
- `transactions`
- `held_funds`

## Verification Scripts

### Multi-platform ecosystem verifier

Creates a fixture with:

- one shared identity
- two organizations
- two ledgers linked into one ecosystem
- linked participant balances across both platforms

Run:

```bash
npm run test:ecosystem
```

### Fixture cleanup

The cleanup script is dry-run by default and targets only the ecosystem verification fixtures.

Run a dry-run:

```bash
npm run test:ecosystem:cleanup -- --run-id <runId>
```

Execute deletion:

```bash
npm run test:ecosystem:cleanup -- --run-id <runId> --execute
```

Bulk cleanup of all matching fixtures:

```bash
npm run test:ecosystem:cleanup -- --all --execute
```

The cleanup script removes:

- fixture auth users
- fixture ecosystems
- fixture organizations and ledgers
- participant identity links
- shared tax and payout profiles
- user profiles

## Public Contract Rule

If a feature depends on:

- session cookies
- CSRF tokens
- service-role-backed user context

it belongs to the operator control plane, not the public `/v1` contract.
