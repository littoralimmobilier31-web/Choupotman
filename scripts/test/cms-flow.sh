#!/usr/bin/env bash
#
# End-to-end check of the public-content modules: portfolio, case studies, blog,
# testimonials, FAQ.
#
#   npm run build && npm run start &
#   ./scripts/test/cms-flow.sh
#
# Three things are actually being tested here, and they are the three that would
# quietly corrupt the site if they broke:
#
#   1. A partial update stays partial. `PATCH {"status":"published"}` must not
#      blank the article's body, and clearing a field must really clear it —
#      those two requirements pull in opposite directions and both must hold.
#   2. Publishing and unpublishing move content on and off the public pages
#      immediately, despite the pages being cached (ISR).
#   3. Deleting archives first. A published address that people may have shared
#      is not erased by one click.
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

PROJECT_ID=""; STUDY_ID=""; POST_ID=""; TESTIMONIAL_ID=""; FAQ_ID=""; MEDIA_ID=""
cleanup_all() {
  [[ -n "$PROJECT_ID"     ]] && api DELETE "/api/portfolio/$PROJECT_ID?force=1"     >/dev/null 2>&1
  [[ -n "$STUDY_ID"       ]] && api DELETE "/api/etudes-de-cas/$STUDY_ID?force=1"   >/dev/null 2>&1
  [[ -n "$POST_ID"        ]] && api DELETE "/api/blog/$POST_ID?force=1"             >/dev/null 2>&1
  [[ -n "$TESTIMONIAL_ID" ]] && api DELETE "/api/temoignages/$TESTIMONIAL_ID?force=1" >/dev/null 2>&1
  [[ -n "$FAQ_ID"         ]] && api DELETE "/api/faq/$FAQ_ID"                       >/dev/null 2>&1
  return 0
}
trap cleanup_all EXIT

page() { curl -sS --noproxy '*' -L "$BASE$1"; }

# ── Portfolio ────────────────────────────────────────────────────────────

say "1. Créer une réalisation"
RESP="$(api POST /api/portfolio '{
  "title":"TEST — Réalisation de contrôle",
  "summary":"Résumé de la réalisation de test.",
  "client_name":"Client de test",
  "year":2025,
  "status":"draft",
  "technologies":["Next.js","SQLite"],
  "links":[{"label":"Site","url":"https://exemple.test"}],
  "metrics":[{"label":"Temps de chargement","value":"0,8 s"}]
}')"
PROJECT_ID="$(json "$RESP" id)"
if [[ -n "$PROJECT_ID" ]]; then ok "réalisation créée (#$PROJECT_ID)"; else bad "création refusée: ${RESP:0:250}"; fi

say "2. Un brouillon n'apparaît pas sur le site"
if grep -q 'TEST — Réalisation de contrôle' <<<"$(page /projets)"; then
  bad "le brouillon est visible publiquement"
else
  ok "le brouillon reste privé"
fi

say "3. Publier rend la réalisation visible immédiatement"
api PATCH "/api/portfolio/$PROJECT_ID" '{"status":"published"}' >/dev/null
expect_contains "$(page /projets)" 'TEST — Réalisation de contrôle' "visible après publication (cache invalidé)"

say "4. Une modification partielle ne détruit pas le reste"
# La régression visée : un PATCH qui ne porte que sur le statut ne doit pas
# réinitialiser les listes (technologies, liens, chiffres) ni le résumé.
RESP="$(req "$BASE/api/portfolio/$PROJECT_ID")"
expect_contains "$RESP" 'Résumé de la réalisation de test' "le résumé a survécu au PATCH de statut"
expect_contains "$RESP" 'Next.js' "les technologies ont survécu"
expect_contains "$RESP" 'exemple.test' "les liens ont survécu"
expect_contains "$RESP" 'Temps de chargement' "les chiffres ont survécu"

say "5. Vider un champ le vide réellement"
api PATCH "/api/portfolio/$PROJECT_ID" '{"summary":null}' >/dev/null
RESP="$(req "$BASE/api/portfolio/$PROJECT_ID")"
if grep -q 'Résumé de la réalisation de test' <<<"$RESP"; then
  bad "le résumé est toujours présent après effacement"
else
  ok "le champ vidé est bien vide en base"
fi
# …et le reste n'a pas bougé pour autant.
expect_contains "$RESP" 'Next.js' "l’effacement d’un champ n’a pas touché les autres"

say "6. Galerie du projet"
RESP="$(api POST "/api/portfolio/$PROJECT_ID/medias" '{"url":"https://exemple.test/capture.png","kind":"image","alt_text":"Capture de test"}')"
MEDIA_ID="$(json "$RESP" id)"
if [[ -n "$MEDIA_ID" ]]; then ok "média ajouté (#$MEDIA_ID)"; else bad "ajout refusé: ${RESP:0:250}"; fi
expect_code 400 "$(api_code POST "/api/portfolio/$PROJECT_ID/medias" '{"kind":"image"}')" "média sans adresse refusé"
expect_code 200 "$(api_code DELETE "/api/portfolio/$PROJECT_ID/medias?media=$MEDIA_ID")" "média retiré"
MEDIA_ID=""
expect_code 404 "$(api_code DELETE "/api/portfolio/$PROJECT_ID/medias?media=999999")" "média inexistant : 404"

say "7. Supprimer archive d'abord"
RESP="$(api DELETE "/api/portfolio/$PROJECT_ID")"
expect_contains "$RESP" '"archived":true' "archivé plutôt que supprimé"
if grep -q 'TEST — Réalisation de contrôle' <<<"$(page /projets)"; then
  bad "la réalisation archivée apparaît encore"
else
  ok "retirée du site public"
fi
expect_contains "$(req "$BASE/api/portfolio/$PROJECT_ID")" 'TEST — Réalisation de contrôle' "toujours présente en base"

# ── Études de cas ────────────────────────────────────────────────────────

say "8. Créer une étude de cas"
RESP="$(api POST /api/etudes-de-cas '{
  "title":"TEST — Étude de contrôle",
  "problem":"Le problème posé par le client de test.",
  "result":"Le résultat obtenu.",
  "metrics":[{"label":"Délai","value":"3 semaines"}],
  "status":"published"
}')"
STUDY_ID="$(json "$RESP" id)"
if [[ -n "$STUDY_ID" ]]; then ok "étude créée (#$STUDY_ID)"; else bad "création refusée: ${RESP:0:250}"; fi
expect_contains "$(page /etudes-de-cas)" 'TEST — Étude de contrôle' "visible sur /etudes-de-cas"

say "9. Le temps de lecture est recalculé, pas saisi"
RESP="$(req "$BASE/api/etudes-de-cas/$STUDY_ID")"
MINUTES="$(json "$RESP" reading_minutes)"
if [[ -n "$MINUTES" ]]; then ok "temps de lecture calculé ($MINUTES min)"; else bad "aucun temps de lecture"; fi

say "10. Un statut hors énumération est refusé"
expect_code 400 "$(api_code PATCH "/api/etudes-de-cas/$STUDY_ID" '{"status":"en_ligne"}')" "statut inventé rejeté"

# ── Blog ─────────────────────────────────────────────────────────────────

say "11. Créer un article"
RESP="$(api POST /api/blog '{
  "title":"TEST — Article de contrôle",
  "excerpt":"Le chapeau de test.",
  "content":"Un corps d’article suffisamment long pour que le temps de lecture soit calculé et que le contenu soit indexé correctement dans la recherche interne.",
  "tags":["test","controle"],
  "status":"draft"
}')"
POST_ID="$(json "$RESP" id)"
if [[ -n "$POST_ID" ]]; then ok "article créé (#$POST_ID)"; else bad "création refusée: ${RESP:0:250}"; fi

say "12. Publier puis vérifier que le contenu est intact"
api PATCH "/api/blog/$POST_ID" '{"status":"published"}' >/dev/null
RESP="$(req "$BASE/api/blog/$POST_ID")"
expect_contains "$RESP" 'suffisamment long' "le corps de l’article a survécu au changement de statut"
expect_contains "$RESP" 'Le chapeau de test' "le chapeau a survécu"
expect_contains "$RESP" '"published_at":"20' "la date de publication a été posée"
expect_contains "$(page /blog)" 'TEST — Article de contrôle' "visible sur /blog"

say "13. Les mots-clés sont conservés"
expect_contains "$RESP" 'controle' "les mots-clés ont survécu au PATCH"

say "14. L'article est trouvable dans la recherche interne"
expect_contains "$(req "$BASE/api/recherche?q=Article+de+contr%C3%B4le")" 'TEST — Article de contrôle' "indexé dans la recherche"

say "15. Archiver retire du blog"
RESP="$(api DELETE "/api/blog/$POST_ID")"
expect_contains "$RESP" '"archived":true' "archivé plutôt que supprimé"
if grep -q 'TEST — Article de contrôle' <<<"$(page /blog)"; then
  bad "l'article archivé apparaît encore"
else
  ok "retiré du blog public"
fi

# ── Témoignages ──────────────────────────────────────────────────────────

say "16. Créer un témoignage"
RESP="$(api POST /api/temoignages '{
  "author_name":"TEST — Client témoin",
  "company":"Société de test",
  "quote":"Un témoignage de contrôle assez long pour passer la validation.",
  "rating":5,
  "is_published":true
}')"
TESTIMONIAL_ID="$(json "$RESP" id)"
if [[ -n "$TESTIMONIAL_ID" ]]; then ok "témoignage créé (#$TESTIMONIAL_ID)"; else bad "création refusée: ${RESP:0:250}"; fi

say "17. Un témoignage trop court est refusé"
expect_code 400 "$(api_code POST /api/temoignages '{"author_name":"TEST — Bref","quote":"Bien."}')" "citation trop courte rejetée"

say "18. Masquer un témoignage ne l'efface pas"
# Régression visée : le dépôt écrit la ligne entière ; un PATCH partiel doit
# donc être fusionné avec l'existant, sinon la citation disparaît.
api PATCH "/api/temoignages/$TESTIMONIAL_ID" '{"is_published":false}' >/dev/null
RESP="$(req "$BASE/api/temoignages/$TESTIMONIAL_ID")"
expect_contains "$RESP" 'assez long pour passer la validation' "la citation a survécu au masquage"
expect_contains "$RESP" 'Société de test' "l’entreprise a survécu"
expect_contains "$RESP" '"rating":5' "la note a survécu"

# ── FAQ ──────────────────────────────────────────────────────────────────

say "19. Créer une question"
RESP="$(api POST /api/faq '{"question":"TEST — Quels sont vos délais ?","answer":"Une réponse de contrôle.","category":"délais"}')"
FAQ_ID="$(json "$RESP" id)"
if [[ -n "$FAQ_ID" ]]; then ok "question créée (#$FAQ_ID)"; else bad "création refusée: ${RESP:0:250}"; fi
expect_contains "$(page /services)" 'TEST — Quels sont vos délais' "visible sous /services"

say "20. Une modification partielle conserve la réponse"
api PATCH "/api/faq/$FAQ_ID" '{"position":5}' >/dev/null
expect_contains "$(req "$BASE/api/faq?publies=0")" 'Une réponse de contrôle' "la réponse a survécu au PATCH de position"

say "21. Masquer retire de la page publique"
api PATCH "/api/faq/$FAQ_ID" '{"is_published":false}' >/dev/null
if grep -q 'TEST — Quels sont vos délais' <<<"$(page /services)"; then
  bad "la question masquée apparaît encore"
else
  ok "retirée de /services"
fi

# ── Permissions ──────────────────────────────────────────────────────────

say "22. Les permissions sont exigées"
for path in /api/portfolio /api/etudes-de-cas /api/blog /api/temoignages /api/faq; do
  got="$(curl -sS --noproxy '*' -H "Origin: $BASE" -o /dev/null -w '%{http_code}' \
    -X POST "$BASE$path" -H 'Content-Type: application/json' -d '{"title":"x","question":"x","answer":"x","author_name":"x","quote":"x"}')"
  expect_code 401 "$got" "sans session : $path refusé"
done

say "23. Un identifiant invalide n'est pas une erreur serveur"
expect_code 400 "$(code "$BASE/api/portfolio/abc")" "identifiant non numérique : 400"
expect_code 404 "$(code "$BASE/api/blog/999999")" "identifiant inexistant : 404"

# ── Nettoyage ────────────────────────────────────────────────────────────

say "24. Suppression définitive"
expect_code 200 "$(api_code DELETE "/api/portfolio/$PROJECT_ID?force=1")" "réalisation supprimée"
PROJECT_ID=""
expect_code 200 "$(api_code DELETE "/api/etudes-de-cas/$STUDY_ID?force=1")" "étude supprimée"
STUDY_ID=""
expect_code 200 "$(api_code DELETE "/api/blog/$POST_ID?force=1")" "article supprimé"
POST_ID=""
expect_code 200 "$(api_code DELETE "/api/temoignages/$TESTIMONIAL_ID?force=1")" "témoignage supprimé"
TESTIMONIAL_ID=""
expect_code 200 "$(api_code DELETE "/api/faq/$FAQ_ID")" "question supprimée"
FAQ_ID=""

say "25. Le site public ne garde aucune trace"
PAGE="$(page /projets)$(page /blog)$(page /etudes-de-cas)$(page /services)"
if grep -q 'TEST — ' <<<"$PAGE"; then bad "du contenu de test subsiste"; else ok "aucune trace de contenu de test"; fi

summary
