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
JAR="$(mktemp)"
CSRF=""

# The bootstrap password is single-use; after `scripts/test/auth-flow.sh` has run
# the account uses the password that script set. This default is that test value —
# never a real credential. Override with ADMIN_PASSWORD.
ADMIN_LOGIN="${ADMIN_LOGIN:-Choupotman}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-${TEST_PASSWORD:-Chp-Test-2026!ok}}"

cleanup() { rm -f "$JAR"; }
trap cleanup EXIT

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
admin_login() {
  local nonce resp
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

summary() {
  printf '\n\033[1mRésultat: %d réussis, %d échoués\033[0m\n' "$PASS" "$FAIL"
  [[ "$FAIL" -eq 0 ]]
}
