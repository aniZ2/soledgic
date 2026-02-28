# Migration Hygiene

## Why this exists
- Historical one-off cleanup migrations in the `20260199`-`20260220` range were mutating data.
- The chain is now long enough that full resets are slow and harder to reason about.

## What was changed
- One-off cleanup migrations in `20260199`-`20260207` were converted to explicit NO-OPs.
- Existing NO-OP migrations in `20260208`-`20260220` remain unchanged.
- New baseline planning helper script added:
  - `scripts/migrations-baseline-playbook.sh`

## Baseline compaction workflow
1. Create a baseline schema dump:
   - `scripts/migrations-baseline-playbook.sh <version>`
2. Validate reset/build/test from a clean clone.
3. Coordinate archive/cutover in a dedicated release branch.
4. Keep migration versions monotonic and avoid editing post-cutover history.

## Policy going forward
- No one-off data cleanup SQL in normal migration chain.
- Use explicit admin runbooks/scripts for data corrections.
- Any exceptional data migration must be:
  - idempotent
  - scoped by stable identifiers (never secrets)
  - reviewed as a production data change
