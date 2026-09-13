#!/usr/bin/env bash
#
# End-to-end authentication check against a running server.
#
#   npm run build && npm run start &
#   ./scripts/test/auth-flow.sh [base-url]
#
# Verifies, in order: the admin redirects when unauthenticated, a wrong password
# is rejected generically, the seeded bootstrap login works, the session forces a
# password change, the change succeeds, the admin then loads, and logout revokes
# the session.
#
# Exits non-zero on the first failed expectation.
set -uo pipefail
cd "$(dirname "$0")/../.."

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"
PASS=0
FAIL=0

# Not a credential: the value this test *sets* on a throwaway dev database, so the
# other scripts know how to log in afterwards. Override with TEST_PASSWORD.
NEW_PASSWORD="${TEST_PASSWORD:-Chp-Test-2026!ok}"

# The bootstrap password only works for the very first login. Reset the database
# (npm run db:reset -- --all) before re-running this script.
#
# Read from the environment with no default on purpose: a credential must never
# live in the repository. `.env.local` holds it — source it, or export the
# variable for this run.
INITIAL_PASSWORD="${BOOTSTRAP_ADMIN_PASSWORD:-}"
if [[ -z "$INITIAL_PASSWORD" && -f .env.local ]]; then
  INITIAL_PASSWORD="$(sed -n 's/^BOOTSTRAP_ADMIN_PASSWORD=//p' .env.local | head -1)"
fi
if [[ -z "$INITIAL_PASSWORD" ]]; then
  printf '\033[31mBOOTSTRAP_ADMIN_PASSWORD est requis.\033[0m\n'
  printf 'Exportez-le ou renseignez-le dans .env.local, puis relancez.\n'
  exit 2
fi

cleanup() { rm -f "$JAR"; }
trap cleanup EXIT

say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }

req() { curl -sS --noproxy '*' -b "$JAR" -c "$JAR" -H "Origin: $BASE" "$@"; }
code() { curl -sS --noproxy '*' -b "$JAR" -c "$JAR" -o /dev/null -w '%{http_code}' "$@"; }
location() { curl -sS --noproxy '*' -b "$JAR" -c "$JAR" -o /dev/null -w '%{redirect_url}' "$@"; }

expect_code() {
  local want="$1" got="$2" label="$3"
  if [[ "$got" == "$want" ]]; then ok "$label ($got)"; else bad "$label — attendu $want, obtenu $got"; fi
}

say "1. Espace admin sans session"
LOC="$(location "$BASE/espace-admin")"
if [[ "$LOC" == *"/espace-admin/connexion"* ]]; then
  ok "redirige vers la connexion"
else
  bad "devrait rediriger vers /espace-admin/connexion (obtenu: '${LOC:-aucune redirection}')"
fi

say "2. Page de connexion"
expect_code 200 "$(code "$BASE/espace-admin/connexion")" "page accessible"
# The form fetches its nonce from a route handler (Next forbids cookie writes
# during a page render), so the test does the same.
CSRF="$(req "$BASE/api/auth/csrf" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
if [[ -n "$CSRF" ]]; then ok "jeton CSRF pré-session émis"; else bad "aucun jeton CSRF obtenu"; fi
if grep -q 'chp_csrf' "$JAR"; then ok "cookie CSRF posé"; else bad "aucun cookie CSRF"; fi

say "3. Mot de passe incorrect"
RESP="$(req -X POST "$BASE/api/auth/connexion" -H 'Content-Type: application/json' \
  -d "{\"login\":\"Choupotman\",\"password\":\"mauvais-mot-de-passe\",\"csrf\":\"$CSRF\"}")"
if grep -q 'Identifiants incorrects' <<<"$RESP"; then
  ok "rejeté avec un message générique (pas d'oracle de compte)"
else
  bad "réponse inattendue: $RESP"
fi

say "4. Requête sans jeton CSRF"
RESP="$(curl -sS --noproxy '*' -X POST "$BASE/api/auth/connexion" -H 'Content-Type: application/json' \
  -H "Origin: $BASE" -d '{"login":"Choupotman","password":"x","csrf":"invalide"}')"
if grep -qi 'session expirée\|refusée' <<<"$RESP"; then
  ok "rejeté (CSRF invalide)"
else
  bad "réponse inattendue: $RESP"
fi

say "5. Connexion avec le mot de passe initial"
RESP="$(req -X POST "$BASE/api/auth/connexion" -H 'Content-Type: application/json' \
  -d "{\"login\":\"Choupotman\",\"password\":\"$INITIAL_PASSWORD\",\"csrf\":\"$CSRF\"}")"
if grep -q '"ok":true' <<<"$RESP"; then
  ok "connexion acceptée"
else
  bad "connexion refusée: $RESP"
  printf '\n  (Le mot de passe initial a peut-être déjà été changé. Relancez npm run db:reset -- --all)\n'
  printf '\nRésultat: %d réussis, %d échoués\n' "$PASS" "$FAIL"
  exit 1
fi
if grep -q '"mustChangePassword":true' <<<"$RESP"; then
  ok "changement de mot de passe exigé"
else
  bad "le compte devrait exiger un changement de mot de passe"
fi
if grep -q 'chp_session' "$JAR"; then ok "cookie de session posé"; else bad "aucun cookie de session"; fi

say "6. Toute route admin renvoie vers le changement de mot de passe"
LOC="$(location "$BASE/espace-admin")"
if [[ "$LOC" == *"changer-mot-de-passe"* ]]; then
  ok "redirection forcée active"
else
  bad "devrait rediriger vers /espace-admin/changer-mot-de-passe (obtenu: '${LOC:-aucune}')"
fi

say "7. Un mot de passe faible est refusé"
CSRF2="$(req "$BASE/espace-admin/changer-mot-de-passe" | sed -n 's/.*data-csrf="\([^"]*\)".*/\1/p' | head -1)"
if [[ -n "$CSRF2" ]]; then ok "jeton CSRF de session récupéré"; else bad "jeton CSRF de session introuvable"; fi
RESP="$(req -X POST "$BASE/api/auth/changer-mot-de-passe" -H 'Content-Type: application/json' \
  -H "x-csrf-token: ${CSRF2:-none}" \
  -d "{\"currentPassword\":\"$INITIAL_PASSWORD\",\"newPassword\":\"motdepasse\",\"confirmPassword\":\"motdepasse\",\"csrf\":\"${CSRF2:-none}\"}")"
if grep -qi 'majuscule\|faible\|courant\|csrf\|refus' <<<"$RESP"; then
  ok "mot de passe faible ou CSRF manquant refusé"
else
  bad "réponse inattendue: $RESP"
fi

say "8. Changement de mot de passe valide"
RESP="$(req -X POST "$BASE/api/auth/changer-mot-de-passe" -H 'Content-Type: application/json' \
  -H "x-csrf-token: ${CSRF2:-none}" \
  -d "{\"currentPassword\":\"$INITIAL_PASSWORD\",\"newPassword\":\"$NEW_PASSWORD\",\"confirmPassword\":\"$NEW_PASSWORD\",\"csrf\":\"${CSRF2:-none}\"}")"
if grep -q '"ok":true' <<<"$RESP"; then
  ok "mot de passe changé"
else
  bad "changement refusé: $RESP"
fi

say "9. L'espace admin se charge après le changement"
expect_code 200 "$(code "$BASE/espace-admin")" "tableau de bord accessible"

say "10. Recherche globale authentifiée"
RESP="$(req "$BASE/api/recherche?q=demo")"
if grep -q '"results"' <<<"$RESP"; then ok "API de recherche répond"; else bad "réponse inattendue: $RESP"; fi

say "11. Le mot de passe initial ne fonctionne plus"
RESP="$(curl -sS --noproxy '*' -c "$(mktemp)" -H "Origin: $BASE" "$BASE/api/auth/csrf")"
FRESH_CSRF="$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' <<<"$RESP")"
RESP="$(req -X POST "$BASE/api/auth/connexion" -H 'Content-Type: application/json' \
  -d "{\"login\":\"Choupotman\",\"password\":\"$INITIAL_PASSWORD\",\"csrf\":\"${FRESH_CSRF:-x}\"}")"
if grep -q '"ok":true' <<<"$RESP"; then
  bad "le mot de passe initial devrait être invalide après changement"
else
  ok "mot de passe initial définitivement retiré"
fi

say "12. Déconnexion"
expect_code 200 "$(code -X POST "$BASE/api/auth/deconnexion")" "déconnexion acceptée"
LOC="$(location "$BASE/espace-admin")"
if [[ "$LOC" == *"/espace-admin/connexion"* ]]; then
  ok "session révoquée"
else
  bad "la session devrait être révoquée (obtenu: '${LOC:-aucune}')"
fi

say "13. Surfaces privées absentes de robots.txt"
ROBOTS="$(curl -sS --noproxy '*' "$BASE/robots.txt")"
if grep -q 'Disallow: /espace-admin' <<<"$ROBOTS"; then
  ok "/espace-admin interdit à l'indexation"
else
  bad "/espace-admin devrait être interdit dans robots.txt"
fi

printf '\n\033[1mRésultat: %d réussis, %d échoués\033[0m\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
