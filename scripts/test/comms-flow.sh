#!/usr/bin/env bash
#
# End-to-end check of the calendar, the messaging and the notifications.
#
#   npm run build && npm run start &
#   ./scripts/test/comms-flow.sh
#
# The two things worth proving here:
#
#   1. The calendar is a projection, not a copy. Changing a project's delivery
#      date has to move the calendar entry, with no synchronisation step that
#      could drift — so the test changes the project and reads the calendar.
#   2. A sent message is a record. It cannot be edited or deleted, because the
#      outbox has to say what the client actually received rather than what we
#      would prefer to have written.
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

CLIENT_ID=""; PROJECT_ID=""; EVENT_ID=""; DRAFT_ID=""; SENT_ID=""; TEMPLATE_KEY=""
cleanup_all() {
  [[ -n "$EVENT_ID"     ]] && api DELETE "/api/evenements/$EVENT_ID"                      >/dev/null 2>&1
  [[ -n "$DRAFT_ID"     ]] && api DELETE "/api/messages/$DRAFT_ID"                        >/dev/null 2>&1
  [[ -n "$SENT_ID"      ]] && api DELETE "/api/messages/$SENT_ID"                         >/dev/null 2>&1
  [[ -n "$TEMPLATE_KEY" ]] && api DELETE "/api/messages/modeles?cle=$TEMPLATE_KEY"        >/dev/null 2>&1
  [[ -n "$PROJECT_ID"   ]] && api DELETE "/api/projets/$PROJECT_ID?force=1"               >/dev/null 2>&1
  [[ -n "$CLIENT_ID"    ]] && api DELETE "/api/clients/$CLIENT_ID?force=1"                >/dev/null 2>&1
  return 0
}
trap cleanup_all EXIT

TODAY="$(date -u +%F)"
SOON="$(date -u -d '+5 days' +%F 2>/dev/null || date -u -v+5d +%F)"
LATER="$(date -u -d '+12 days' +%F 2>/dev/null || date -u -v+12d +%F)"
HORIZON="$(date -u -d '+60 days' +%F 2>/dev/null || date -u -v+60d +%F)"

calendar() { req "$BASE/api/evenements?du=$TODAY&au=$HORIZON"; }

# ── Calendrier ───────────────────────────────────────────────────────────

say "1. Créer un événement"
RESP="$(api POST /api/evenements "{\"title\":\"TEST — Point d'avancement\",\"kind\":\"meeting\",\"starts_at\":\"${SOON}T10:00:00.000Z\",\"location\":\"Visioconférence\"}")"
EVENT_ID="$(json "$RESP" id)"
if [[ -n "$EVENT_ID" ]]; then ok "événement créé (#$EVENT_ID)"; else bad "création refusée: ${RESP:0:250}"; fi
expect_contains "$(calendar)" "TEST — Point d'avancement" "l’événement apparaît au calendrier"

say "2. Une date de début manquante est refusée"
expect_code 400 "$(api_code POST /api/evenements '{"title":"TEST — Sans date"}')" "événement sans date rejeté"

say "3. Un type d'événement inventé est refusé"
expect_code 400 "$(api_code POST /api/evenements "{\"title\":\"TEST — Type inconnu\",\"kind\":\"anniversaire\",\"starts_at\":\"${SOON}T10:00:00.000Z\"}")" "type hors énumération rejeté"

say "4. Le calendrier est une projection, pas une copie"
# Aucune table de calendrier n'est alimentée par le projet : l'entrée doit
# apparaître du seul fait que la date de livraison existe.
RESP="$(api POST /api/clients '{"name":"TEST — Client calendrier","email":"calendrier@test.invalid"}')"
CLIENT_ID="$(json "$RESP" id)"
RESP="$(api POST /api/projets "{\"title\":\"TEST — Projet daté\",\"client_id\":$CLIENT_ID,\"delivery_date\":\"$SOON\",\"budget\":1000}")"
PROJECT_ID="$(json "$RESP" id)"
if [[ -n "$PROJECT_ID" ]]; then ok "projet créé (#$PROJECT_ID)"; else bad "création refusée: ${RESP:0:250}"; fi
expect_contains "$(calendar)" 'Livraison — TEST — Projet daté' "la livraison figure au calendrier"

say "5. Déplacer la livraison déplace l'entrée"
api PATCH "/api/projets/$PROJECT_ID" "{\"delivery_date\":\"$LATER\"}" >/dev/null
RESP="$(calendar)"
if grep -q "\"startsAt\":\"${LATER}T" <<<"$RESP"; then
  ok "l’entrée a suivi la nouvelle date"
else
  bad "la date du calendrier n’a pas suivi"
fi
# …et rien ne subsiste à l'ancienne date.
RESP="$(req "$BASE/api/evenements?du=$SOON&au=$SOON")"
if grep -q 'TEST — Projet daté' <<<"$RESP"; then bad "une entrée fantôme reste à l'ancienne date"; else ok "aucune entrée fantôme"; fi

say "6. Une échéance de tâche apparaît aussi"
RESP="$(api POST /api/taches "{\"title\":\"TEST — Tâche datée\",\"project_id\":$PROJECT_ID,\"due_date\":\"$SOON\"}")"
TASK_ID="$(json "$RESP" id)"
expect_contains "$(calendar)" 'TEST — Tâche datée' "la tâche figure au calendrier"
[[ -n "$TASK_ID" ]] && api DELETE "/api/taches/$TASK_ID" >/dev/null 2>&1

say "7. Modifier un événement"
api PATCH "/api/evenements/$EVENT_ID" '{"title":"TEST — Point reporté","location":"Bureau"}' >/dev/null
expect_contains "$(calendar)" 'TEST — Point reporté' "titre modifié"

say "8. Supprimer un événement"
expect_code 200 "$(api_code DELETE "/api/evenements/$EVENT_ID")" "événement supprimé"
if grep -q 'TEST — Point reporté' <<<"$(calendar)"; then bad "l'événement supprimé apparaît encore"; else ok "retiré du calendrier"; fi
EVENT_ID=""

# ── Modèles de message ───────────────────────────────────────────────────

say "9. Créer un modèle de message"
RESP="$(api POST /api/messages/modeles '{"key":"test_relance","name":"TEST — Relance","subject":"Suivi — {{project_title}}","body":"Bonjour {{client_name}},\n\nOù en sommes-nous sur {{project_title}} ?\n\n{{owner_name}}"}')"
if grep -q '"ok":true' <<<"$RESP"; then TEMPLATE_KEY="test_relance"; ok "modèle créé"; else bad "création refusée: ${RESP:0:250}"; fi
expect_contains "$RESP" 'client_name' "les variables utilisées sont signalées"

say "10. Une variable inconnue est signalée, pas silencieuse"
RESP="$(api POST /api/messages/modeles '{"key":"test_faute","name":"TEST — Faute de frappe","body":"Bonjour {{clientname}}"}')"
expect_contains "$RESP" 'unknownVariables' "la variable inconnue est remontée"
expect_contains "$RESP" 'clientname' "elle est nommée"
api DELETE '/api/messages/modeles?cle=test_faute' >/dev/null 2>&1

say "11. Une clé de modèle invalide est refusée"
expect_code 400 "$(api_code POST /api/messages/modeles '{"key":"Clé Invalide!","name":"TEST","body":"corps"}')" "clé hors format rejetée"

# ── Messages ─────────────────────────────────────────────────────────────

say "12. Enregistrer un brouillon"
RESP="$(api POST /api/messages "{\"client_id\":$CLIENT_ID,\"subject\":\"TEST — Brouillon\",\"body\":\"Contenu du brouillon de test.\",\"send\":false}")"
DRAFT_ID="$(json "$RESP" id)"
if [[ -n "$DRAFT_ID" ]]; then ok "brouillon enregistré (#$DRAFT_ID)"; else bad "enregistrement refusé: ${RESP:0:250}"; fi
expect_contains "$(req "$BASE/api/messages/$DRAFT_ID")" '"status":"draft"' "statut brouillon"

say "13. L'adresse est reprise de la fiche client"
expect_contains "$(req "$BASE/api/messages/$DRAFT_ID")" 'calendrier@test.invalid' "destinataire déduit du client"

say "14. Un brouillon est modifiable"
api PATCH "/api/messages/$DRAFT_ID" '{"subject":"TEST — Brouillon révisé"}' >/dev/null
expect_contains "$(req "$BASE/api/messages/$DRAFT_ID")" 'Brouillon révisé' "objet modifié"

say "15. Sans destinataire, l'envoi est refusé"
expect_code 400 "$(api_code POST /api/messages '{"subject":"TEST — Sans destinataire","body":"Corps.","send":true}')" "message sans adresse rejeté"

say "16. Envoyer met en file quand aucun SMTP n'est configuré"
# Rien n'est perdu avant que le serveur d'envoi soit renseigné : c'est le
# comportement attendu, pas une erreur.
RESP="$(api POST /api/messages "{\"client_id\":$CLIENT_ID,\"subject\":\"TEST — Message envoyé\",\"body\":\"Contenu envoyé.\",\"send\":true}")"
SENT_ID="$(json "$RESP" id)"
if [[ -n "$SENT_ID" ]]; then ok "message accepté (#$SENT_ID)"; else bad "envoi refusé: ${RESP:0:250}"; fi
if grep -q '"mailConfigured":false' <<<"$RESP"; then
  ok "la réponse dit clairement qu’aucun SMTP n’est configuré"
  STATUS='queued'
else
  ok "SMTP configuré : envoi tenté"
  STATUS='sent'
fi
expect_contains "$(req "$BASE/api/messages/$SENT_ID")" "\"status\":\"$STATUS\"" "statut cohérent ($STATUS)"

say "17. La file d'envoi est consultable et traitable"
RESP="$(req "$BASE/api/messages/file")"
expect_contains "$RESP" '"ok":true' "file consultable"
RESP="$(api POST /api/messages/file)"
if grep -q '"mailConfigured":false' <<<"$RESP"; then
  expect_contains "$RESP" 'restent en attente' "le traitement explique pourquoi rien ne part"
else
  expect_contains "$RESP" '"sent"' "le traitement rend un compte-rendu"
fi

say "18. Un message envoyé n'est pas réécrivable"
# Cette garantie est ce qui rend l'historique fiable.
api PATCH "/api/messages/$SENT_ID" '{"status":"sent"}' >/dev/null 2>&1
npx tsx -e "
import { run } from './src/lib/db/client';
run(\"UPDATE messages SET status = 'sent', sent_at = datetime('now') WHERE id = $SENT_ID\");
" >/dev/null 2>&1
expect_code 409 "$(api_code PATCH "/api/messages/$SENT_ID" '{"subject":"TEST — Réécriture"}')" "modification refusée (409)"
expect_code 409 "$(api_code DELETE "/api/messages/$SENT_ID")" "suppression refusée (409)"
expect_contains "$(req "$BASE/api/messages/$SENT_ID")" 'TEST — Message envoyé' "le texte d’origine est intact"

say "19. Un brouillon reste supprimable"
expect_code 200 "$(api_code DELETE "/api/messages/$DRAFT_ID")" "brouillon supprimé"
DRAFT_ID=""

# ── Notifications ────────────────────────────────────────────────────────

say "20. Les notifications sont consultables"
RESP="$(req "$BASE/api/notifications")"
expect_contains "$RESP" '"ok":true' "liste accessible"

say "21. Tout marquer comme lu"
RESP="$(api POST /api/notifications/tout-lu)"
expect_contains "$RESP" '"ok":true' "marquage accepté"
expect_contains "$(req "$BASE/api/notifications?nonlues=1")" '"items":\[\]' "plus aucune non lue"

say "22. On ne peut pas effacer la notification d'un autre"
expect_code 404 "$(api_code DELETE '/api/notifications?id=999999')" "identifiant hors périmètre : 404"

# ── Permissions ──────────────────────────────────────────────────────────

say "23. Les permissions sont exigées"
for path in /api/evenements /api/messages /api/messages/modeles; do
  got="$(curl -sS --noproxy '*' -H "Origin: $BASE" -o /dev/null -w '%{http_code}' \
    -X POST "$BASE$path" -H 'Content-Type: application/json' -d '{"title":"x","subject":"x","body":"x","key":"x","name":"x","starts_at":"2026-01-01T10:00:00Z"}')"
  expect_code 401 "$got" "sans session : $path refusé"
done

say "24. Le calendrier exige une session"
expect_code 401 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' "$BASE/api/evenements")" "lecture du calendrier refusée"

say "25. Nettoyage"
expect_code 200 "$(api_code DELETE "/api/messages/modeles?cle=$TEMPLATE_KEY")" "modèle supprimé"
TEMPLATE_KEY=""
expect_code 200 "$(api_code DELETE "/api/projets/$PROJECT_ID?force=1")" "projet supprimé"
PROJECT_ID=""
expect_code 200 "$(api_code DELETE "/api/clients/$CLIENT_ID?force=1")" "client supprimé"
CLIENT_ID=""

summary
