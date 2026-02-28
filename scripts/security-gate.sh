#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Pre-deploy Security Gate
# =============================================================================
# Unified gate with 7 checks. Exits non-zero on any blocking failure.
#
# Usage:
#   ./scripts/security-gate.sh [--pre-push | --ci | --deploy]
#
# Modes:
#   --pre-push  Skips unit tests and build (fast, for git pre-push hook)
#   --ci        Runs all checks except Next.js build
#   --deploy    Runs all checks including Next.js build (default)
# =============================================================================

MODE="--deploy"
if [ "$#" -gt 0 ]; then
  for arg in "$@"; do
    case "$arg" in
      --pre-push|--ci|--deploy)
        MODE="$arg"
        ;;
      --)
        ;;
      *)
        echo "Unknown argument: $arg"
        echo "Usage: ./scripts/security-gate.sh [--pre-push | --ci | --deploy]"
        exit 2
        ;;
    esac
  done
fi
FAILURES=0
CHECKS_RUN=0
CHECKS_PASSED=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

pass() {
  CHECKS_PASSED=$((CHECKS_PASSED + 1))
  echo -e "${GREEN}PASS${NC} [$1] $2"
}

fail() {
  FAILURES=$((FAILURES + 1))
  echo -e "${RED}FAIL${NC} [$1] $2"
}

warn() {
  echo -e "${YELLOW}WARN${NC} [$1] $2"
}

echo "========================================"
echo "  Security Gate (mode: ${MODE})"
echo "========================================"
echo ""

# =============================================================================
# Check 1: Hardcoded secrets (full codebase, not just staged files)
# =============================================================================
CHECKS_RUN=$((CHECKS_RUN + 1))
echo "--- Check 1: Hardcoded secrets ---"

SECRET_PATTERNS=(
  'sk_live_[a-zA-Z0-9]{32,}'
  'sk_test_[a-zA-Z0-9]{20,}'
  'whsec_[a-zA-Z0-9]{20,}'
  'SUPABASE_SERVICE_ROLE_KEY.*=.*ey[A-Za-z0-9_-]+'
  'Bearer ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
)

SECRETS_FOUND=0
for pattern in "${SECRET_PATTERNS[@]}"; do
  MATCHES=$(grep -rE "$pattern" \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    --include="*.json" --include="*.env" --include="*.sh" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
    --exclude-dir=test-data --exclude-dir=.claude \
    --exclude="*.example" --exclude="*.md" --exclude="security-gate.sh" \
    --exclude="test-security-fixes.sh" --exclude="first-light-test.sh" \
    . 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    SECRETS_FOUND=1
    echo "  Pattern: $pattern"
    echo "$MATCHES" | head -5 | sed 's/^/    /'
  fi
done

if [ "$SECRETS_FOUND" -eq 1 ]; then
  fail "1" "Hardcoded secrets detected"
else
  pass "1" "No hardcoded secrets"
fi

# =============================================================================
# Check 2: SECURITY DEFINER without SET search_path
# =============================================================================
CHECKS_RUN=$((CHECKS_RUN + 1))
echo "--- Check 2: SECURITY DEFINER without search_path ---"

# Only check SQL files changed vs origin/main (old migrations are deployed and immutable)
DEFINER_ISSUES=0
CHANGED_SQL=$(git diff --name-only origin/main -- '*.sql' 2>/dev/null || true)
UNTRACKED_SQL=$(git ls-files --others --exclude-standard -- '*.sql' 2>/dev/null || true)
ALL_NEW_SQL=$(printf '%s\n%s' "$CHANGED_SQL" "$UNTRACKED_SQL" | sort -u | grep -v '^$' || true)

while IFS= read -r sqlfile; do
  [ -z "$sqlfile" ] && continue
  [ ! -f "$sqlfile" ] && continue
  if grep -qi 'SECURITY DEFINER' "$sqlfile" 2>/dev/null; then
    DEFINER_COUNT=$( (grep -ci 'SECURITY DEFINER' "$sqlfile" 2>/dev/null || true) | awk '{s+=$1} END {print s+0}')
    SEARCHPATH_COUNT=$( (grep -ci "SET search_path" "$sqlfile" 2>/dev/null || true) | awk '{s+=$1} END {print s+0}')
    if [ "$DEFINER_COUNT" -gt "$SEARCHPATH_COUNT" ]; then
      DEFINER_ISSUES=1
      echo "  $sqlfile: SECURITY DEFINER ($DEFINER_COUNT) > SET search_path ($SEARCHPATH_COUNT)"
    fi
  fi
done <<< "$ALL_NEW_SQL"

if [ "$DEFINER_ISSUES" -eq 1 ]; then
  fail "2" "SECURITY DEFINER function(s) missing SET search_path"
else
  pass "2" "All SECURITY DEFINER functions have SET search_path"
fi

# =============================================================================
# Check 3: State-changing routes with csrfProtection: false (exclude webhooks)
# =============================================================================
CHECKS_RUN=$((CHECKS_RUN + 1))
echo "--- Check 3: CSRF protection disabled ---"

# Method-aware scan:
# - Allow csrfProtection:false on GET handlers
# - Allow explicit webhook/read-only/livemode exemptions
# - Flag all other cases (POST/PUT/PATCH/DELETE/default context)
CSRF_ISSUES=$(find ./apps/web/src/app/api -name "route.ts" -type f 2>/dev/null | \
  while IFS= read -r file; do
    awk '
      /export const GET = createApiHandler\(/ { current_method = "GET" }
      /export const POST = createApiHandler\(/ { current_method = "POST" }
      /export const PUT = createApiHandler\(/ { current_method = "PUT" }
      /export const PATCH = createApiHandler\(/ { current_method = "PATCH" }
      /export const DELETE = createApiHandler\(/ { current_method = "DELETE" }
      /csrfProtection:[[:space:]]*false/ {
        line = tolower($0)
        file = tolower(FILENAME)
        if (file ~ /webhook/) next
        if (line ~ /webhook|readonly|active-ledger-group|livemode/) next
        if (current_method == "GET") next
        printf "%s:%d:%s\n", FILENAME, FNR, $0
      }
    ' "$file"
  done || true)

if [ -n "$CSRF_ISSUES" ]; then
  echo "$CSRF_ISSUES" | sed 's/^/    /'
  fail "3" "CSRF protection disabled on non-webhook routes"
else
  pass "3" "No CSRF protection bypasses outside allowed routes"
fi

# =============================================================================
# Check 4: SQL injection patterns in template literals
# =============================================================================
CHECKS_RUN=$((CHECKS_RUN + 1))
echo "--- Check 4: SQL injection patterns ---"

SQL_INJECTION_PATTERNS=(
  '`[^`]*\$\{[^}]*\}[^`]*(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)'
  '(SELECT|INSERT|UPDATE|DELETE).*`[^`]*\$\{[^}]*\}'
)

SQLI_FOUND=0
for pattern in "${SQL_INJECTION_PATTERNS[@]}"; do
  MATCHES=$(grep -rEn "$pattern" \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
    --exclude="*.test.*" --exclude="*.spec.*" \
    . 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    SQLI_FOUND=1
    echo "$MATCHES" | head -5 | sed 's/^/    /'
  fi
done

if [ "$SQLI_FOUND" -eq 1 ]; then
  fail "4" "Potential SQL injection in template literals"
else
  pass "4" "No SQL injection patterns detected"
fi

# =============================================================================
# Check 5: DROP TABLE / TRUNCATE in pending migrations
# =============================================================================
CHECKS_RUN=$((CHECKS_RUN + 1))
echo "--- Check 5: Destructive SQL in pending migrations ---"

# Check for DROP TABLE or TRUNCATE in migration files (excluding comments)
DESTRUCTIVE_FOUND=0
while IFS= read -r migration; do
  # Strip SQL comments and check for destructive statements
  MATCHES=$(grep -inE '^\s*(DROP\s+TABLE|TRUNCATE)' "$migration" 2>/dev/null \
    | grep -v '^\s*--' || true)
  if [ -n "$MATCHES" ]; then
    DESTRUCTIVE_FOUND=1
    echo "  $migration:"
    echo "$MATCHES" | sed 's/^/    /'
  fi
done < <(find ./supabase/migrations -name "*.sql" -newer .git/HEAD 2>/dev/null || true)

# Also check uncommitted migration files
while IFS= read -r migration; do
  if [ -f "$migration" ]; then
    MATCHES=$(grep -inE '^\s*(DROP\s+TABLE|TRUNCATE)' "$migration" 2>/dev/null \
      | grep -v '^\s*--' || true)
    if [ -n "$MATCHES" ]; then
      DESTRUCTIVE_FOUND=1
      echo "  $migration:"
      echo "$MATCHES" | sed 's/^/    /'
    fi
  fi
done < <(git diff --name-only --diff-filter=A -- 'supabase/migrations/*.sql' 2>/dev/null || true)

if [ "$DESTRUCTIVE_FOUND" -eq 1 ]; then
  fail "5" "DROP TABLE or TRUNCATE found in pending migrations"
else
  pass "5" "No destructive SQL in pending migrations"
fi

# =============================================================================
# Check 6: Unit tests (skippable in --pre-push mode)
# =============================================================================
CHECKS_RUN=$((CHECKS_RUN + 1))
echo "--- Check 6: Unit tests ---"

if [ "$MODE" = "--pre-push" ]; then
  warn "6" "Skipped in --pre-push mode"
else
  if npm run test 2>&1; then
    pass "6" "All unit tests passed"
  else
    fail "6" "Unit tests failed"
  fi
fi

# =============================================================================
# Check 7: Next.js build (only in --deploy mode)
# =============================================================================
CHECKS_RUN=$((CHECKS_RUN + 1))
echo "--- Check 7: Next.js build ---"

if [ "$MODE" = "--deploy" ]; then
  if (cd apps/web && npm run build) 2>&1; then
    pass "7" "Next.js build succeeded"
  else
    fail "7" "Next.js build failed"
  fi
else
  warn "7" "Skipped (only runs in --deploy mode)"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "========================================"
echo "  Results: ${CHECKS_PASSED}/${CHECKS_RUN} passed, ${FAILURES} failed"
echo "========================================"

if [ "$FAILURES" -gt 0 ]; then
  echo -e "${RED}Security gate FAILED${NC} — fix the above issues before deploying."
  exit 1
fi

echo -e "${GREEN}Security gate PASSED${NC}"
exit 0
