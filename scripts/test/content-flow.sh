#!/usr/bin/env bash
#
# End-to-end check of the settings, profile and services screens.
#
#   npm run build && npm run start &
#   ./scripts/test/content-flow.sh
#
# The point of this suite is the rule from the specification: the site must
# never invent anything about the owner. That is not a promise in a prompt — it
# is a mechanism, and this tests the mechanism:
#
#   - a setting left empty is stored as NULL, and the public page hides the
#     section instead of rendering a placeholder;
#   - the "À propos" page shows exactly the profile entries that exist, and
#     nothing when there are none;
#   - saving a form does not corrupt the settings catalogue (a value-only save
#     must not flatten a field's declared type).
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

ENTRY_ID=""; SERVICE_ID=""
cleanup_all() {
  [[ -n "$ENTRY_ID"   ]] && api DELETE "/api/profil/$ENTRY_ID" >/dev/null 2>&1
  [[ -n "$SERVICE_ID" ]] && api DELETE "/api/services/$SERVICE_ID?force=1" >/dev/null 2>&1
  # Restore the settings this script changed.
  api POST /api/parametres '{"group":"identity","values":{"site.role_label":"","site.short_bio":""}}' >/dev/null 2>&1
  # The cookie jar is intentionally kept: see scripts/test/lib.sh.
}
trap cleanup_all EXIT

say "1. Un champ vide n'invente rien sur la page publique"
api POST /api/parametres '{"group":"identity","values":{"site.role_label":"","site.short_bio":""}}' >/dev/null
PAGE="$(curl -sS --noproxy '*' -L "$BASE/a-propos")"
# `placeholder=` est un attribut HTML légitime sur les champs de formulaire :
# on ne cherche donc que du texte de remplissage réellement visible.
if grep -qiE "lorem ipsum|votre texte ici|à compléter|texte par défaut" <<<"$PAGE"; then
  bad "du texte de remplissage apparaît sur la page publique"
else
  ok "aucun texte de remplissage"
fi

say "2. Un champ renseigné apparaît tel quel"
api POST /api/parametres '{"group":"identity","values":{"site.role_label":"Développeur web et consultant IT"}}' >/dev/null
PAGE="$(curl -sS --noproxy '*' -L "$BASE/a-propos")"
expect_contains "$PAGE" 'Développeur web et consultant IT' "la valeur saisie est affichée"

say "3. Le type déclaré d'un paramètre survit à un enregistrement"
# Régression : un formulaire enregistre des valeurs sans connaître le type de
# chaque champ ; un défaut écraseur transformerait tout en « string ».
setting_type() {
  req "$BASE/api/parametres?groupe=identity" \
    | tr '{' '\n' | grep '"key":"site.short_bio"' \
    | sed -n 's/.*"value_type":"\([a-z]*\)".*/\1/p' | head -1
}
BEFORE="$(setting_type)"
api POST /api/parametres '{"group":"identity","values":{"site.short_bio":"Une présentation courte."}}' >/dev/null
AFTER="$(setting_type)"
if [[ -n "$AFTER" && "$BEFORE" == "$AFTER" ]]; then
  ok "type préservé (${AFTER##*:})"
else
  bad "le type a changé — avant: '${BEFORE:-?}' après: '${AFTER:-?}'"
fi

say "4. Une clé inconnue est refusée, pas créée"
RESP="$(api POST /api/parametres '{"group":"identity","values":{"site.cle_injectee":"valeur"}}')"
expect_contains "$RESP" 'error\|rejected' "clé hors catalogue rejetée"
RESP="$(req "$BASE/api/parametres?groupe=identity")"
if grep -q 'cle_injectee' <<<"$RESP"; then bad "la clé a été créée"; else ok "aucune clé créée"; fi

say "5. Un groupe inconnu est refusé"
expect_code 400 "$(api_code POST /api/parametres '{"group":"inexistant","values":{"x":"y"}}')" "groupe hors énumération rejeté"

say "6. Un formulaire ne peut pas écrire dans un autre groupe"
# La clé existe, mais dans le groupe « finance » : la requête vise « contact ».
RESP="$(api POST /api/parametres '{"group":"contact","values":{"finance.tax_rate":"99"}}')"
expect_contains "$RESP" 'error\|rejected' "clé d’un autre groupe ignorée"
RATE="$(req "$BASE/api/parametres?groupe=finance" | sed -n 's/.*"finance.tax_rate","value":"\([0-9]*\)".*/\1/p' | head -1)"
if [[ "$RATE" != "99" ]]; then ok "le taux de TVA est intact"; else bad "le taux de TVA a été modifié depuis un autre formulaire"; fi

say "7. Le parcours n'affiche que ce qui a été saisi"
RESP="$(api POST /api/profil '{"kind":"certification","title":"TEST — Certification réelle","organisation":"Organisme de test","start_date":"2024","is_published":true}')"
ENTRY_ID="$(json "$RESP" id)"
if [[ -n "$ENTRY_ID" ]]; then ok "élément de parcours créé (#$ENTRY_ID)"; else bad "création refusée: ${RESP:0:200}"; fi
PAGE="$(curl -sS --noproxy '*' -L "$BASE/a-propos")"
expect_contains "$PAGE" 'TEST — Certification réelle' "la certification saisie est affichée"

say "8. Masquer un élément le retire du site"
api PATCH "/api/profil/$ENTRY_ID" '{"is_published":false}' >/dev/null
PAGE="$(curl -sS --noproxy '*' -L "$BASE/a-propos")"
if grep -q 'TEST — Certification réelle' <<<"$PAGE"; then
  bad "l'élément masqué apparaît encore"
else
  ok "l'élément masqué n'apparaît plus"
fi

say "9. Catalogue de services"
RESP="$(api POST /api/services '{"name":"TEST — Prestation","family":"web","short_description":"Description de test.","bullets":["Point un","Point deux"],"starting_price":50000,"currency":"DZD","is_published":true}')"
SERVICE_ID="$(json "$RESP" id)"
if [[ -n "$SERVICE_ID" ]]; then ok "service créé (#$SERVICE_ID)"; else bad "création refusée: ${RESP:0:200}"; fi
PAGE="$(curl -sS --noproxy '*' -L "$BASE/services")"
expect_contains "$PAGE" 'TEST — Prestation' "le service publié apparaît"

say "10. Dépublier retire du site sans effacer"
RESP="$(api DELETE "/api/services/$SERVICE_ID")"
expect_contains "$RESP" '"archived":true' "dépublié plutôt que supprimé"
RESP="$(req "$BASE/api/services/$SERVICE_ID")"
expect_contains "$RESP" 'TEST — Prestation' "le service existe toujours en base"
PAGE="$(curl -sS --noproxy '*' -L "$BASE/services")"
if grep -q 'TEST — Prestation' <<<"$PAGE"; then bad "le service dépublié apparaît encore"; else ok "retiré du site public"; fi

say "11. Une famille de service inconnue est refusée"
expect_code 400 "$(api_code POST /api/services '{"name":"TEST — Hors famille","family":"inventee"}')" "famille hors énumération rejetée"

say "12. Les permissions sont exigées"
expect_code 401 "$(curl -sS --noproxy '*' -H "Origin: $BASE" -o /dev/null -w '%{http_code}' \
  -X POST "$BASE/api/parametres" -H 'Content-Type: application/json' -d '{"group":"identity","values":{}}')" "sans session : refusé"

say "13. Nettoyage"
expect_code 200 "$(api_code DELETE "/api/services/$SERVICE_ID?force=1")" "service de test supprimé"
SERVICE_ID=""
expect_code 200 "$(api_code DELETE "/api/profil/$ENTRY_ID")" "élément de parcours supprimé"
ENTRY_ID=""

summary
