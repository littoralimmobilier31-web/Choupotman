#!/usr/bin/env bash
#
# End-to-end check of the project module against a running server.
#
#   npm run dev &        (or npm run build && npm run start &)
#   ./scripts/test/projects-flow.sh
#
# Creates a throwaway project, then exercises stages, tasks, the kanban move,
# the checklist and comments — the exact endpoints the project workspace calls —
# and deletes everything it created at the end.
#
# Exits non-zero on the first failed expectation.
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

PROJECT_ID=""
cleanup_project() {
  if [[ -n "$PROJECT_ID" ]]; then
    api DELETE "/api/projets/$PROJECT_ID?force=1" >/dev/null 2>&1
  fi
  # The cookie jar is intentionally kept: see scripts/test/lib.sh.
}
trap cleanup_project EXIT

say "1. Création d'un projet de test"
RESP="$(api POST /api/projets '{"title":"TEST — flux projet","status":"planning","priority":"high","budget":120000,"currency":"DZD","revisions_included":2,"revision_extra_cost":5000,"scaffold":true}')"
PROJECT_ID="$(json "$RESP" id)"
if [[ -n "$PROJECT_ID" ]]; then ok "projet créé (#$PROJECT_ID)"; else bad "création refusée: ${RESP:0:300}"; summary; exit 1; fi

say "2. Le scaffolding a généré les étapes"
RESP="$(req "$BASE/api/etapes?projet=$PROJECT_ID")"
STAGE_COUNT="$(grep -o '"project_id"' <<<"$RESP" | wc -l | tr -d ' ')"
if [[ "$STAGE_COUNT" -ge 7 ]]; then
  ok "$STAGE_COUNT étapes créées automatiquement"
else
  bad "au moins 7 étapes attendues, obtenu $STAGE_COUNT"
fi
STAGE_ID="$(json "$RESP" id)"

say "3. Étape ajoutée manuellement"
RESP="$(api POST /api/etapes "{\"project_id\":$PROJECT_ID,\"name\":\"Recette client\"}")"
NEW_STAGE_ID="$(json "$RESP" id)"
if [[ -n "$NEW_STAGE_ID" ]]; then ok "étape créée (#$NEW_STAGE_ID)"; else bad "création refusée: ${RESP:0:300}"; fi

say "4. Étape rattachée à un projet inexistant refusée"
expect_code 404 "$(api_code POST /api/etapes '{"project_id":999999,"name":"Orpheline"}')" "projet inconnu rejeté"

say "5. Changement de statut d'étape"
RESP="$(api PATCH "/api/etapes/$NEW_STAGE_ID" '{"status":"in_progress"}')"
expect_contains "$RESP" '"ok":true' "statut mis à jour"
RESP="$(req "$BASE/api/etapes?projet=$PROJECT_ID")"
expect_contains "$RESP" 'in_progress' "statut persisté"

say "6. Statut d'étape invalide refusé"
expect_code 400 "$(api_code PATCH "/api/etapes/$NEW_STAGE_ID" '{"status":"peut-etre"}')" "valeur hors énumération rejetée"

say "7. Création d'une tâche dans l'étape"
RESP="$(api POST /api/taches "{\"project_id\":$PROJECT_ID,\"stage_id\":$NEW_STAGE_ID,\"title\":\"Valider la recette avec le client\",\"priority\":\"urgent\",\"status\":\"todo\"}")"
TASK_ID="$(json "$RESP" id)"
if [[ -n "$TASK_ID" ]]; then ok "tâche créée (#$TASK_ID)"; else bad "création refusée: ${RESP:0:300}"; fi

say "8. Sous-tâches (checklist)"
RESP="$(api POST /api/checklist "{\"task_id\":$TASK_ID,\"label\":\"Préparer l'environnement de recette\"}")"
ITEM_ID="$(json "$RESP" id)"
if [[ -n "$ITEM_ID" ]]; then ok "sous-tâche créée (#$ITEM_ID)"; else bad "création refusée: ${RESP:0:300}"; fi

RESP="$(api PATCH "/api/checklist/$ITEM_ID" '{"is_done":true}')"
expect_contains "$RESP" '"is_done":1' "sous-tâche cochée"
RESP="$(api PATCH "/api/checklist/$ITEM_ID" '{"is_done":false}')"
expect_contains "$RESP" '"is_done":0' "sous-tâche décochée"
expect_code 404 "$(api_code PATCH '/api/checklist/999999' '{"is_done":true}')" "sous-tâche inconnue rejetée"
expect_code 404 "$(api_code POST /api/checklist '{"task_id":999999,"label":"Orpheline"}')" "tâche inconnue rejetée"

say "9. Commentaires internes"
RESP="$(api POST /api/commentaires "{\"task_id\":$TASK_ID,\"body\":\"Recette planifiée avec le client.\"}")"
expect_contains "$RESP" 'Recette planifiée' "commentaire enregistré et renvoyé"
expect_code 400 "$(api_code POST /api/commentaires "{\"task_id\":$TASK_ID,\"body\":\"\"}")" "commentaire vide rejeté"

say "10. Détail de tâche (workspace)"
RESP="$(req "$BASE/api/taches/$TASK_ID")"
expect_contains "$RESP" '"checklist"' "checklist incluse"
expect_contains "$RESP" '"comments"' "commentaires inclus"

say "11. Déplacement kanban"
RESP="$(api PUT "/api/taches/$TASK_ID" '{"status":"in_progress","position":0}')"
expect_contains "$RESP" '"ok":true' "tâche déplacée en cours"
RESP="$(api PUT "/api/taches/$TASK_ID" '{"status":"done","position":0}')"
expect_contains "$RESP" '"ok":true' "tâche terminée"

say "12. L'avancement du projet a été recalculé"
RESP="$(req "$BASE/api/projets/$PROJECT_ID")"
PROGRESS="$(json "$RESP" progress)"
if [[ -n "$PROGRESS" && "$PROGRESS" -gt 0 ]]; then
  ok "avancement recalculé ($PROGRESS %)"
else
  bad "l'avancement devrait être supérieur à 0 (obtenu: '${PROGRESS:-vide}')"
fi

say "13. Suppression d'une étape contenant des tâches"
CODE="$(api_code DELETE "/api/etapes/$NEW_STAGE_ID")"
expect_code 409 "$CODE" "confirmation exigée"
expect_code 200 "$(api_code DELETE "/api/etapes/$NEW_STAGE_ID?force=1")" "suppression forcée acceptée"
RESP="$(req "$BASE/api/taches/$TASK_ID")"
expect_contains "$RESP" "\"id\":$TASK_ID" "la tâche survit à la suppression de son étape"

say "14. Le CSRF reste obligatoire"
CODE="$(curl -sS --noproxy '*' -b "$JAR" -H "Origin: $BASE" -o /dev/null -w '%{http_code}' \
  -X POST "$BASE/api/checklist" -H 'Content-Type: application/json' \
  -d "{\"task_id\":$TASK_ID,\"label\":\"sans jeton\"}")"
expect_code 403 "$CODE" "requête sans jeton CSRF rejetée"

say "15. Nettoyage"
expect_code 200 "$(api_code DELETE "/api/projets/$PROJECT_ID?force=1")" "projet de test supprimé"
PROJECT_ID=""

summary
