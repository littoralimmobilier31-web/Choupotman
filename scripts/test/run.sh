#!/usr/bin/env bash
#
# Runs every end-to-end suite against a running production build.
#
#   npm run build
#   npm start &
#   npm test              # or: ./scripts/test/run.sh
#   ./scripts/test/run.sh cms files      # a subset, by name
#
# Suites are run in sequence, not in parallel: they share one SQLite database and
# one admin session, and a parallel run would have them deleting each other's
# fixtures and racing on the same reference counters.
#
# Every rate-limit bucket except the authentication ones is cleared between
# suites. The policies are right for real use and wrong for a test run: the API
# allowance is exhausted about two thirds of the way through, and the chatbot's
# is exhausted by re-running one suite a few times. Past that point every
# assertion fails on 429 and the run measures the limiter instead of the
# application. The login and password-reset buckets are left alone, because
# auth-flow is where those limiters are actually tested.
set -uo pipefail
cd "$(dirname "$0")/../.."

BASE="${BASE:-http://localhost:3000}"

# auth-flow is excluded from the default set: it changes the admin password and
# needs a freshly seeded database, so it would invalidate the cached session the
# other suites share. Run it on its own against a reset database.
ALL=(
  projects-flow
  crm-flow
  finance-flow
  content-flow
  cms-flow
  files-flow
  comms-flow
  accounting-flow
  system-flow
  ai-flow
  portal-flow
)

# Arguments select a subset by prefix: `run.sh cms files` runs cms-flow and
# files-flow.
if [[ $# -gt 0 ]]; then
  SELECTED=()
  for wanted in "$@"; do
    for suite in "${ALL[@]}"; do
      [[ "$suite" == "$wanted" || "$suite" == "$wanted-flow" ]] && SELECTED+=("$suite")
    done
  done
  if [[ ${#SELECTED[@]} -eq 0 ]]; then
    printf '\033[31mAucune suite ne correspond à : %s\033[0m\n' "$*"
    printf 'Suites disponibles : %s\n' "${ALL[*]}"
    exit 2
  fi
else
  SELECTED=("${ALL[@]}")
fi

# The server has to be up: a connection error would otherwise be reported as
# hundreds of assertion failures.
if [[ "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' "$BASE/api/auth/csrf" 2>/dev/null || echo 000)" != "200" ]]; then
  printf '\033[31mLe serveur ne répond pas sur %s\033[0m\n' "$BASE"
  printf 'Lancez : npm run build && npm start\n'
  exit 2
fi

reset_limits() {
  npx tsx -e "
import { run } from './src/lib/db/client';
run(\"DELETE FROM rate_limit_hits WHERE bucket NOT LIKE 'login:%' AND bucket NOT LIKE 'passwordReset:%'\");
" >/dev/null 2>&1 || true
}

TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_SUITES=()
STARTED_AT="$(date +%s)"

for suite in "${SELECTED[@]}"; do
  printf '\n\033[1;44m %s \033[0m\n' "$suite"
  reset_limits

  output="$(./scripts/test/"$suite".sh 2>&1)"
  status=$?

  # Echo everything: a failure is only useful with its assertion text.
  printf '%s\n' "$output"

  line="$(printf '%s' "$output" | sed 's/\x1b\[[0-9;]*m//g' | grep -a '^Résultat:' | tail -1)"
  pass="$(sed -n 's/^Résultat: \([0-9]*\) réussis.*/\1/p' <<<"$line")"
  fail="$(sed -n 's/.*, \([0-9]*\) échoués.*/\1/p' <<<"$line")"

  TOTAL_PASS=$((TOTAL_PASS + ${pass:-0}))
  TOTAL_FAIL=$((TOTAL_FAIL + ${fail:-0}))

  if [[ "$status" -ne 0 || "${fail:-1}" -ne 0 ]]; then
    FAILED_SUITES+=("$suite")
  fi
done

ELAPSED=$(( $(date +%s) - STARTED_AT ))

# The suites clean up through the API, which is the right path — but the API
# deliberately refuses to delete an issued invoice or a sent message, and those
# refusals are exactly what the suites verify. Left alone the rows pile up run
# after run and end up in a demonstration. `--keep-fixtures` leaves them for
# inspection after a failure.
if [[ "${*}" != *--keep-fixtures* ]]; then
  npx tsx scripts/test/clean.ts >/dev/null 2>&1 || true
fi

printf '\n\033[1m════════════════════════════════════════\033[0m\n'
printf '\033[1m%d suites · %d assertions réussies · %d échouées · %ds\033[0m\n' \
  "${#SELECTED[@]}" "$TOTAL_PASS" "$TOTAL_FAIL" "$ELAPSED"

if [[ ${#FAILED_SUITES[@]} -gt 0 ]]; then
  printf '\033[31mSuites en échec : %s\033[0m\n' "${FAILED_SUITES[*]}"
  exit 1
fi

printf '\033[32mToutes les suites passent.\033[0m\n'
printf '\033[2mNon incluse : auth-flow (change le mot de passe admin, exige une base réinitialisée).\033[0m\n'
