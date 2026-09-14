#!/usr/bin/env bash
#
# End-to-end check of the client portal against a running server.
#
#   npm run build && npm run start &
#   ./scripts/test/portal-flow.sh
#
# The property under test is isolation: a signed-in client sees their own data
# and nothing else. Two clients are created, each with a project, an issued
# invoice and a portal access; then client A is used to try to reach client B's
# project, invoice, quote PDF and files. Every attempt must come back 404 — the
# same answer as for something that does not exist, so the portal cannot be used
# to discover what other clients exist.
#
# Also covers: the forced change of a temporary password, feedback scoped to
# one's own project, and session revocation on logout.
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

# This script signs in twice, deliberately fails twice more and changes a
# password; the auth limiters would otherwise stop it partway. `auth-flow.sh` is
# where those limiters are actually tested.
reset_auth_limits

A_JAR="$(mktemp)"; B_JAR="$(mktemp)"
CLIENT_A=""; CLIENT_B=""; PROJECT_A=""; PROJECT_B=""; INVOICE_A=""; INVOICE_B=""

cleanup_all() {
  for id in "$INVOICE_A" "$INVOICE_B"; do [[ -n "$id" ]] && api DELETE "/api/factures/$id" >/dev/null 2>&1; done
  for id in "$PROJECT_A" "$PROJECT_B"; do [[ -n "$id" ]] && api DELETE "/api/projets/$id?force=1" >/dev/null 2>&1; done
  for id in "$CLIENT_A" "$CLIENT_B"; do [[ -n "$id" ]] && api DELETE "/api/clients/$id?force=1" >/dev/null 2>&1; done
  rm -f "$A_JAR" "$B_JAR"
  # The admin cookie jar is intentionally kept: see scripts/test/lib.sh.
}
trap cleanup_all EXIT

# Requests as a portal client, using that client's own cookie jar.
as_client() {
  local jar="$1"; shift
  curl -sS --noproxy '*' -b "$jar" -c "$jar" -H "Origin: $BASE" "$@"
}
as_client_code() {
  local jar="$1"; shift
  curl -sS --noproxy '*' -b "$jar" -c "$jar" -H "Origin: $BASE" -o /dev/null -w '%{http_code}' "$@"
}

portal_login() {
  local jar="$1" email="$2" password="$3"
  as_client "$jar" -X POST "$BASE/api/client/connexion" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}"
}

say "1. Deux clients de test, chacun avec un projet et une facture"
for side in A B; do
  RESP="$(api POST /api/clients "{\"name\":\"TEST — Client $side\",\"email\":\"portal-$side@example.test\",\"currency\":\"DZD\"}")"
  ID="$(json "$RESP" id)"
  if [[ -z "$ID" ]]; then bad "création du client $side refusée: ${RESP:0:200}"; summary; exit 1; fi
  RESP="$(api POST /api/projets "{\"title\":\"TEST — Projet $side\",\"client_id\":$ID,\"status\":\"in_progress\",\"budget\":100000,\"currency\":\"DZD\",\"scaffold\":true}")"
  PID="$(json "$RESP" id)"
  RESP="$(api POST /api/factures "{\"client_id\":$ID,\"project_id\":$PID,\"title\":\"TEST $side\",\"currency\":\"DZD\",\"tax_rate\":0,\"items\":[{\"label\":\"Prestation\",\"quantity\":1,\"unit\":\"forfait\",\"unit_price\":100000,\"discount\":0}]}")"
  IID="$(json "$RESP" id)"
  api PATCH "/api/factures/$IID" '{"status":"sent"}' >/dev/null
  if [[ "$side" == "A" ]]; then CLIENT_A="$ID"; PROJECT_A="$PID"; INVOICE_A="$IID"
  else CLIENT_B="$ID"; PROJECT_B="$PID"; INVOICE_B="$IID"; fi
done
ok "client A #$CLIENT_A (projet #$PROJECT_A, facture #$INVOICE_A)"
ok "client B #$CLIENT_B (projet #$PROJECT_B, facture #$INVOICE_B)"

say "2. Création des accès à l'espace client"
RESP="$(api POST "/api/clients/$CLIENT_A/acces" '{"email":"portal-a@example.test","full_name":"Client A"}')"
PASS_A="$(jstr "$RESP" temporaryPassword)"
RESP="$(api POST "/api/clients/$CLIENT_B/acces" '{"email":"portal-b@example.test","full_name":"Client B"}')"
PASS_B="$(jstr "$RESP" temporaryPassword)"
if [[ -n "$PASS_A" && -n "$PASS_B" ]]; then ok "mots de passe provisoires générés"; else bad "génération échouée: ${RESP:0:200}"; summary; exit 1; fi

say "3. Le même email ne peut pas avoir deux accès"
expect_code 409 "$(api_code POST "/api/clients/$CLIENT_A/acces" '{"email":"portal-a@example.test"}')" "doublon refusé"

say "4. Connexion au portail"
RESP="$(portal_login "$A_JAR" 'portal-a@example.test' "$PASS_A")"
expect_contains "$RESP" '"ok":true' "client A connecté"
expect_contains "$RESP" '"mustChangePassword":true' "changement de mot de passe exigé"
RESP="$(portal_login "$B_JAR" 'portal-b@example.test' "$PASS_B")"
expect_contains "$RESP" '"ok":true' "client B connecté"

say "5. Un mauvais mot de passe est refusé, sans révéler le compte"
RESP="$(curl -sS --noproxy '*' -H "Origin: $BASE" -X POST "$BASE/api/client/connexion" \
  -H 'Content-Type: application/json' -d '{"email":"portal-a@example.test","password":"faux"}')"
expect_contains "$RESP" 'Identifiants incorrects' "message générique"
RESP="$(curl -sS --noproxy '*' -H "Origin: $BASE" -X POST "$BASE/api/client/connexion" \
  -H 'Content-Type: application/json' -d '{"email":"inexistant@example.test","password":"faux"}')"
expect_contains "$RESP" 'Identifiants incorrects' "même message pour un compte inexistant"

say "6. Tant que le mot de passe est provisoire, le portail redirige"
LOC="$(curl -sS --noproxy '*' -b "$A_JAR" -o /dev/null -w '%{redirect_url}' "$BASE/client")"
if [[ "$LOC" == *"mot-de-passe"* ]]; then ok "redirection vers le changement de mot de passe"; else bad "attendu une redirection (obtenu: '${LOC:-aucune}')"; fi

say "7. Changement du mot de passe provisoire"
CSRF_A="$(as_client "$A_JAR" "$BASE/api/auth/csrf" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
NEW_A='Portail-Test-2026!a'
RESP="$(as_client "$A_JAR" -X POST "$BASE/api/client/mot-de-passe" -H 'Content-Type: application/json' \
  -H "x-csrf-token: $CSRF_A" \
  -d "{\"currentPassword\":\"$PASS_A\",\"newPassword\":\"$NEW_A\",\"confirmPassword\":\"$NEW_A\",\"csrf\":\"$CSRF_A\"}")"
expect_contains "$RESP" '"ok":true' "mot de passe changé"
expect_code 200 "$(as_client_code "$A_JAR" "$BASE/client")" "le portail se charge ensuite"

say "8. Un mot de passe faible est refusé"
RESP="$(as_client "$A_JAR" -X POST "$BASE/api/client/mot-de-passe" -H 'Content-Type: application/json' \
  -H "x-csrf-token: $CSRF_A" \
  -d "{\"currentPassword\":\"$NEW_A\",\"newPassword\":\"motdepasse\",\"confirmPassword\":\"motdepasse\",\"csrf\":\"$CSRF_A\"}")"
expect_contains "$RESP" 'majuscule\|chiffre\|caractère' "politique appliquée"

say "9. Le client A voit ses propres données"
expect_code 200 "$(as_client_code "$A_JAR" "$BASE/client/projets/$PROJECT_A")" "son projet"
expect_code 200 "$(as_client_code "$A_JAR" "$BASE/client/factures")" "ses factures"
expect_code 200 "$(as_client_code "$A_JAR" "$BASE/api/client/factures/$INVOICE_A/pdf")" "le PDF de sa facture"

say "10. ISOLATION — le client A ne voit rien du client B"
expect_code 404 "$(as_client_code "$A_JAR" "$BASE/client/projets/$PROJECT_B")" "projet de B inaccessible"
expect_code 404 "$(as_client_code "$A_JAR" "$BASE/api/client/factures/$INVOICE_B/pdf")" "facture de B inaccessible"
expect_code 404 "$(as_client_code "$A_JAR" "$BASE/api/client/fichiers/1")" "fichier non partagé inaccessible"

say "11. ISOLATION — impossible de commenter le projet d'un autre"
CODE="$(as_client_code "$A_JAR" -X POST "$BASE/api/client/feedback" -H 'Content-Type: application/json' \
  -H "x-csrf-token: $CSRF_A" \
  -d "{\"projectId\":$PROJECT_B,\"decision\":\"comment\",\"comment\":\"tentative\",\"csrf\":\"$CSRF_A\"}")"
expect_code 404 "$CODE" "feedback sur le projet de B refusé"

say "12. Le feedback sur son propre projet fonctionne"
RESP="$(as_client "$A_JAR" -X POST "$BASE/api/client/feedback" -H 'Content-Type: application/json' \
  -H "x-csrf-token: $CSRF_A" \
  -d "{\"projectId\":$PROJECT_A,\"decision\":\"changes_requested\",\"comment\":\"Merci de revoir la page d accueil.\",\"csrf\":\"$CSRF_A\"}")"
expect_contains "$RESP" '"ok":true' "retour enregistré"
RESP="$(req "$BASE/api/feedback?projet=$PROJECT_A")"
expect_contains "$RESP" 'page d accueil' "visible côté administration"

say "13. Le CSRF est exigé sur le portail"
CODE="$(curl -sS --noproxy '*' -b "$A_JAR" -H "Origin: $BASE" -o /dev/null -w '%{http_code}' \
  -X POST "$BASE/api/client/feedback" -H 'Content-Type: application/json' \
  -d "{\"projectId\":$PROJECT_A,\"decision\":\"comment\",\"comment\":\"sans jeton\"}")"
expect_code 403 "$CODE" "requête sans jeton rejetée"

say "14. Un client ne peut pas atteindre l'administration"
LOC="$(curl -sS --noproxy '*' -b "$A_JAR" -o /dev/null -w '%{redirect_url}' "$BASE/espace-admin")"
if [[ "$LOC" == *"/espace-admin/connexion"* ]]; then
  ok "la session client ne vaut pas session admin"
else
  bad "devrait rediriger vers la connexion admin (obtenu: '${LOC:-aucune}')"
fi
expect_code 401 "$(curl -sS --noproxy '*' -b "$A_JAR" -H "Origin: $BASE" -o /dev/null -w '%{http_code}' "$BASE/api/clients")" "API admin refusée"

say "15. Désactiver un accès déconnecte immédiatement"
USERS="$(req "$BASE/api/clients/$CLIENT_B/acces")"
UID_B="$(json "$USERS" id)"
api PATCH "/api/clients/$CLIENT_B/acces" "{\"client_user_id\":$UID_B,\"is_active\":false}" >/dev/null
LOC="$(curl -sS --noproxy '*' -b "$B_JAR" -o /dev/null -w '%{redirect_url}' "$BASE/client")"
if [[ "$LOC" == *"connexion"* ]]; then ok "session de B révoquée"; else bad "la session aurait dû être révoquée (obtenu: '${LOC:-aucune}')"; fi
RESP="$(portal_login "$B_JAR" 'portal-b@example.test' "$PASS_B")"
expect_contains "$RESP" 'Identifiants incorrects' "reconnexion impossible une fois désactivé"

say "16. Déconnexion"
expect_code 200 "$(as_client_code "$A_JAR" -X POST "$BASE/api/client/deconnexion")" "déconnexion acceptée"
LOC="$(curl -sS --noproxy '*' -b "$A_JAR" -o /dev/null -w '%{redirect_url}' "$BASE/client")"
if [[ "$LOC" == *"connexion"* ]]; then ok "session terminée"; else bad "la session aurait dû être terminée"; fi

summary
