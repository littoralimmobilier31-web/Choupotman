#!/usr/bin/env bash
#
# End-to-end check of the commercial funnel against a running server.
#
#   npm run dev &
#   ./scripts/test/crm-flow.sh
#
# Walks a lead from creation through the pipeline to conversion into a client and
# a project, then exercises the brief: token link, public save, required-answer
# validation, completion and token invalidation. Cleans up after itself.
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

LEAD_ID=""; CLIENT_ID=""; PROJECT_ID=""; BRIEF_ID=""
cleanup_all() {
  [[ -n "$BRIEF_ID"   ]] && api DELETE "/api/briefs/$BRIEF_ID" >/dev/null 2>&1
  [[ -n "$PROJECT_ID" ]] && api DELETE "/api/projets/$PROJECT_ID?force=1" >/dev/null 2>&1
  [[ -n "$CLIENT_ID"  ]] && api DELETE "/api/clients/$CLIENT_ID?force=1" >/dev/null 2>&1
  [[ -n "$LEAD_ID"    ]] && api DELETE "/api/prospects/$LEAD_ID?force=1" >/dev/null 2>&1
  # The cookie jar is intentionally kept: see scripts/test/lib.sh.
}
trap cleanup_all EXIT

say "1. Création d'un prospect"
RESP="$(api POST /api/prospects '{"name":"TEST — Prospect flux","company":"TEST SARL","email":"test-flux@example.com","phone":"+213000000000","service_interest":"Site vitrine","budget_range":"150 000 – 400 000 DZD","estimated_value":250000,"currency":"DZD","deadline_hint":"urgent","message":"Nous avons besoin dun site vitrine multilingue avec espace client et prise de rendez-vous en ligne."}')"
LEAD_ID="$(json "$RESP" id)"
if [[ -n "$LEAD_ID" ]]; then ok "prospect créé (#$LEAD_ID)"; else bad "création refusée: ${RESP:0:300}"; summary; exit 1; fi

say "2. Le score de qualification est calculé côté serveur"
SCORE="$(sed -n 's/.*"score":\([0-9]*\).*/\1/p' <<<"$RESP" | head -1)"
if [[ -n "$SCORE" && "$SCORE" -ge 60 ]]; then
  ok "score élevé pour un prospect complet et urgent ($SCORE/100)"
else
  bad "score attendu ≥ 60 pour email+tel+société+budget+urgence (obtenu: '${SCORE:-vide}')"
fi

say "3. Avancement dans le pipeline"
for stage in contacted qualified proposal; do
  CODE="$(api_code PUT "/api/prospects/$LEAD_ID" "{\"stage\":\"$stage\"}")"
  expect_code 200 "$CODE" "passage en « $stage »"
done
expect_code 400 "$(api_code PUT "/api/prospects/$LEAD_ID" '{"stage":"peut-etre"}')" "étape inconnue rejetée"

say "4. Conversion en client et projet"
RESP="$(api POST "/api/prospects/$LEAD_ID/convertir" '{"createProject":true,"projectTitle":"TEST — Projet issu du prospect","budget":250000}')"
CLIENT_ID="$(json "$RESP" clientId)"
PROJECT_ID="$(json "$RESP" projectId)"
if [[ -n "$CLIENT_ID" ]]; then ok "client créé (#$CLIENT_ID)"; else bad "conversion refusée: ${RESP:0:300}"; fi
if [[ -n "$PROJECT_ID" ]]; then ok "projet créé (#$PROJECT_ID)"; else bad "le projet devrait être créé"; fi

say "5. Une seconde conversion est refusée"
expect_code 409 "$(api_code POST "/api/prospects/$LEAD_ID/convertir" '{"createProject":false}')" "pas de client en double"

say "6. Le prospect converti est conservé, pas supprimé"
RESP="$(api DELETE "/api/prospects/$LEAD_ID")"
expect_contains "$RESP" '"archived":true' "conservé comme origine du client"

say "7. Le projet issu de la conversion est structuré"
RESP="$(req "$BASE/api/etapes?projet=$PROJECT_ID")"
STAGES="$(grep -o '"project_id"' <<<"$RESP" | wc -l | tr -d ' ')"
if [[ "$STAGES" -ge 7 ]]; then ok "$STAGES étapes générées"; else bad "au moins 7 étapes attendues, obtenu $STAGES"; fi

say "8. Création d'un brief rattaché au projet"
RESP="$(api POST /api/briefs "{\"title\":\"TEST — Brief de cadrage\",\"client_id\":$CLIENT_ID,\"project_id\":$PROJECT_ID,\"intro_text\":\"Quelques questions.\",\"locale\":\"fr\",\"expires_in_days\":30}")"
BRIEF_ID="$(json "$RESP" id)"
TOKEN="$(jstr "$RESP" token)"
if [[ -n "$BRIEF_ID" && -n "$TOKEN" ]]; then ok "brief créé (#$BRIEF_ID) avec un lien unique"; else bad "création refusée: ${RESP:0:300}"; summary; exit 1; fi

say "9. Le lien public fonctionne sans session"
RESP="$(curl -sS --noproxy '*' "$BASE/api/brief/$TOKEN")"
expect_contains "$RESP" '"questions"' "questionnaire servi sans authentification"
expect_code 200 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' "$BASE/brief/$TOKEN")" "page du brief accessible"

say "10. Un jeton inconnu ne révèle rien"
expect_code 404 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' "$BASE/api/brief/jeton-inexistant-xyz")" "404 générique"

say "11. Enregistrement d'une réponse par le client"
RESP="$(curl -sS --noproxy '*' -H "Origin: $BASE" -X POST "$BASE/api/brief/$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"answers":[{"key":"contact_name","value":"Client de test"},{"key":"email","value":"client@example.com"}],"complete":false}')"
expect_contains "$RESP" '"saved":2' "deux réponses enregistrées"

say "12. Une clé inconnue est ignorée, pas insérée"
RESP="$(curl -sS --noproxy '*' -H "Origin: $BASE" -X POST "$BASE/api/brief/$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"answers":[{"key":"cle_injectee","value":"x"}],"complete":false}')"
expect_contains "$RESP" 'Aucune réponse reconnue' "clé hors questionnaire rejetée"

say "13. Requête depuis une autre origine refusée"
CODE="$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' -H 'Origin: https://evil.example' \
  -X POST "$BASE/api/brief/$TOKEN" -H 'Content-Type: application/json' \
  -d '{"answers":[{"key":"contact_name","value":"pirate"}]}')"
expect_code 403 "$CODE" "origine croisée bloquée"

say "14. Validation impossible tant que l'obligatoire manque"
RESP="$(curl -sS --noproxy '*' -H "Origin: $BASE" -X POST "$BASE/api/brief/$TOKEN" \
  -H 'Content-Type: application/json' -d '{"answers":[{"key":"contact_name","value":"Client de test"}],"complete":true}')"
expect_contains "$RESP" '"missing"' "réponses obligatoires manquantes signalées"

say "15. Validation complète du brief"
ANSWERS='{"answers":[
  {"key":"contact_name","value":"Client de test"},
  {"key":"email","value":"client@example.com"},
  {"key":"project_name","value":"Site vitrine"},
  {"key":"project_description","value":"Un site vitrine multilingue."},
  {"key":"objectives","value":"Recevoir plus de demandes."},
  {"key":"budget","value":"150 000 – 400 000 DZD"},
  {"key":"deadline","value":"1 mois"}
],"complete":true}'
RESP="$(curl -sS --noproxy '*' -H "Origin: $BASE" -X POST "$BASE/api/brief/$TOKEN" \
  -H 'Content-Type: application/json' -d "$ANSWERS")"
expect_contains "$RESP" '"completed":true' "brief validé"

say "16. Un brief validé n'accepte plus de modification"
CODE="$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' -H "Origin: $BASE" -X POST "$BASE/api/brief/$TOKEN" \
  -H 'Content-Type: application/json' -d '{"answers":[{"key":"contact_name","value":"changé"}]}')"
expect_code 409 "$CODE" "verrouillé après validation"

say "17. Régénérer le lien invalide l'ancien"
RESP="$(api PATCH "/api/briefs/$BRIEF_ID" '{"regenerate_token":true}')"
NEW_TOKEN="$(jstr "$RESP" token)"
if [[ -n "$NEW_TOKEN" && "$NEW_TOKEN" != "$TOKEN" ]]; then ok "nouveau jeton émis"; else bad "un nouveau jeton était attendu"; fi
expect_code 404 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' "$BASE/api/brief/$TOKEN")" "ancien lien désactivé"
expect_code 200 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' "$BASE/api/brief/$NEW_TOKEN")" "nouveau lien actif"

say "18. Les réponses sont conservées après régénération"
RESP="$(req "$BASE/api/briefs/$BRIEF_ID")"
expect_contains "$RESP" 'Client de test' "réponses intactes"

say "19. Nettoyage"
expect_code 200 "$(api_code DELETE "/api/briefs/$BRIEF_ID")" "brief supprimé"
BRIEF_ID=""
expect_code 200 "$(api_code DELETE "/api/projets/$PROJECT_ID?force=1")" "projet supprimé"
PROJECT_ID=""
expect_code 200 "$(api_code DELETE "/api/clients/$CLIENT_ID?force=1")" "client supprimé"
CLIENT_ID=""
expect_code 200 "$(api_code DELETE "/api/prospects/$LEAD_ID?force=1")" "prospect supprimé"
LEAD_ID=""

summary
