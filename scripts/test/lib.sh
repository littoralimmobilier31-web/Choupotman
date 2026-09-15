#!/usr/bin/env bash
#
# Shared helpers for the shell-based end-to-end checks.
#
# Sourced, never executed:
#
#   source "$(dirname "$0")/lib.sh"
#   admin_login
#
# Every request goes through `--noproxy '*'` because the agent proxy otherwise
# intercepts localhost, and carries an `Origin` header because the CSRF layer
# rejects cross-origin mutations on purpose.
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0
CSRF=""

# The cookie jar is cached between scripts on purpose: the login endpoint is
# rate-limited per IP (and it should be), so running four test scripts in a row
# would lock itself out if each one logged in afresh. Set TEST_FRESH_LOGIN=1 to
# force a new login. data/tmp is gitignored.
mkdir -p data/tmp 2>/dev/null || true
JAR="${TEST_JAR:-data/tmp/test-session.jar}"
touch "$JAR" 2>/dev/null || JAR="$(mktemp)"

# The bootstrap password is single-use; after `scripts/test/auth-flow.sh` has run
# the account uses the password that script set. This default is that test value —
# never a real credential. Override with ADMIN_PASSWORD.
ADMIN_LOGIN="${ADMIN_LOGIN:-Choupotman}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-${TEST_PASSWORD:-Chp-Test-2026!ok}}"

say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }

req()  { curl -sS --noproxy '*' -b "$JAR" -c "$JAR" -H "Origin: $BASE" "$@"; }
code() { curl -sS --noproxy '*' -b "$JAR" -c "$JAR" -H "Origin: $BASE" -o /dev/null -w '%{http_code}' "$@"; }

# JSON body + the CSRF token in both the header and the payload, which is what
# the browser client does.
api() {
  local method="$1" path="$2" body="${3:-{\}}"
  req -X "$method" "$BASE$path" \
    -H 'Content-Type: application/json' \
    -H "x-csrf-token: $CSRF" \
    -d "$(printf '%s' "$body" | sed "s/}$/,\"csrf\":\"$CSRF\"}/; s/^{,/{/")"
}

api_code() {
  local method="$1" path="$2" body="${3:-{\}}"
  code -X "$method" "$BASE$path" \
    -H 'Content-Type: application/json' \
    -H "x-csrf-token: $CSRF" \
    -d "$(printf '%s' "$body" | sed "s/}$/,\"csrf\":\"$CSRF\"}/; s/^{,/{/")"
}

# Reads a top-level or nested scalar out of a JSON response without pulling in a
# dependency. Good enough for assertions; not a parser.
json() { sed -n "s/.*\"$2\":\([0-9]*\).*/\1/p" <<<"$1" | head -1; }
jstr() { sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p" <<<"$1" | head -1; }

expect_code() {
  local want="$1" got="$2" label="$3"
  if [[ "$got" == "$want" ]]; then ok "$label ($got)"; else bad "$label — attendu $want, obtenu $got"; fi
}

expect_contains() {
  local haystack="$1" needle="$2" label="$3"
  if grep -q "$needle" <<<"$haystack"; then ok "$label"; else bad "$label — réponse: ${haystack:0:300}"; fi
}

# Logs in and leaves a usable session cookie + CSRF token in $CSRF.
#
# Reuses the cached session when it is still valid: /api/auth/csrf answers
# `"scope":"session"` only for an authenticated caller, which is a reliable and
# side-effect-free way to ask "am I still logged in?".
admin_login() {
  local nonce resp probe

  if [[ "${TEST_FRESH_LOGIN:-}" != '1' ]]; then
    probe="$(req "$BASE/api/auth/csrf")"
    if grep -q '"scope":"session"' <<<"$probe"; then
      CSRF="$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' <<<"$probe")"
      [[ -n "$CSRF" ]] && return 0
    fi
  fi

  nonce="$(req "$BASE/api/auth/csrf" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
  resp="$(req -X POST "$BASE/api/auth/connexion" -H 'Content-Type: application/json' \
    -d "{\"login\":\"$ADMIN_LOGIN\",\"password\":\"$ADMIN_PASSWORD\",\"csrf\":\"$nonce\"}")"

  if ! grep -q '"ok":true' <<<"$resp"; then
    printf '\033[31mConnexion impossible.\033[0m %s\n' "${resp:0:300}"
    printf 'Définissez ADMIN_PASSWORD, ou réinitialisez : npm run db:reset -- --all && npm run db:seed\n'
    exit 1
  fi

  # Now that a session cookie exists, the same endpoint returns a session-bound
  # token instead of the pre-session nonce.
  CSRF="$(req "$BASE/api/auth/csrf" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
  if [[ -z "$CSRF" ]]; then
    printf '\033[31mJeton CSRF de session introuvable.\033[0m\n'
    exit 1
  fi
}

# Clears the authentication rate-limit buckets before a test that signs in and
# changes passwords several times.
#
# The limiters are deliberately tight (a handful of attempts per window), and
# that is exactly what `auth-flow.sh` asserts. A functional test that signs two
# portal users in, fails twice on purpose and then changes a password would
# exhaust them and end up measuring the limiter instead of the feature.
#
# The password-reset bucket matters for a second reason: it is keyed on the
# account id, and SQLite reuses a rowid once the highest row is deleted — so a
# test that creates and deletes accounts sees the *previous* run's bucket.
reset_auth_limits() {
  npx tsx -e "
import { run } from './src/lib/db/client';
run(\"DELETE FROM rate_limit_hits WHERE bucket LIKE 'login:%' OR bucket LIKE 'passwordReset:%'\");
" >/dev/null 2>&1 || true
}

# Clears the generic API bucket.
#
# The policy is 300 requests per five minutes per user and IP — correct for a
# real session, and exhausted about two thirds of the way through a full run of
# every suite back to back. Past that point every assertion fails on 429 and the
# run measures the limiter rather than the application. `scripts/test/run.sh`
# calls this between suites; a single suite never comes close to the ceiling.
reset_api_limits() {
  npx tsx -e "
import { run } from './src/lib/db/client';
run(\"DELETE FROM rate_limit_hits WHERE bucket LIKE 'api:%' OR bucket LIKE 'upload:%' OR bucket LIKE 'aiAdmin:%'\");
" >/dev/null 2>&1 || true
}

summary() {
  printf '\n\033[1mRésultat: %d réussis, %d échoués\033[0m\n' "$PASS" "$FAIL"
  [[ "$FAIL" -eq 0 ]]
}
