#!/usr/bin/env bash
#
# End-to-end check of the contracts, expenses and subscriptions.
#
#   npm run build && npm run start &
#   ./scripts/test/accounting-flow.sh
#
# These three modules hold commitments and money, so the tests are mostly about
# what stays fixed:
#
#   - a contract's text is expanded once, at creation, and editing the template
#     afterwards must not rewrite it;
#   - a signed contract cannot be reworded, re-priced, or deleted;
#   - rolling a subscription forward writes a real expense, and only when the
#     renewal date has actually been reached.
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

CLIENT_ID=""; PROJECT_ID=""; TEMPLATE_ID=""; CONTRACT_ID=""; EXPENSE_ID=""; SUB_ID=""; SUB2_ID=""
cleanup_all() {
  [[ -n "$CONTRACT_ID" ]] && api DELETE "/api/contrats/$CONTRACT_ID?force=1"      >/dev/null 2>&1
  [[ -n "$TEMPLATE_ID" ]] && api DELETE "/api/contrats/modeles?id=$TEMPLATE_ID"   >/dev/null 2>&1
  [[ -n "$EXPENSE_ID"  ]] && api DELETE "/api/depenses/$EXPENSE_ID"               >/dev/null 2>&1
  [[ -n "$SUB_ID"      ]] && api DELETE "/api/abonnements/$SUB_ID?force=1"        >/dev/null 2>&1
  [[ -n "$SUB2_ID"     ]] && api DELETE "/api/abonnements/$SUB2_ID?force=1"       >/dev/null 2>&1
  [[ -n "$PROJECT_ID"  ]] && api DELETE "/api/projets/$PROJECT_ID?force=1"        >/dev/null 2>&1
  [[ -n "$CLIENT_ID"   ]] && api DELETE "/api/clients/$CLIENT_ID?force=1"         >/dev/null 2>&1
  return 0
}
trap cleanup_all EXIT

TODAY="$(date -u +%F)"
YESTERDAY="$(date -u -d '-1 day' +%F 2>/dev/null || date -u -v-1d +%F)"
NEXT_MONTH="$(date -u -d '+31 days' +%F 2>/dev/null || date -u -v+31d +%F)"

say "0. Contexte"
RESP="$(api POST /api/clients '{"name":"TEST — Client contrat","company":"Société Contrat","address":"12 rue de test","email":"contrat@test.invalid"}')"
CLIENT_ID="$(json "$RESP" id)"
RESP="$(api POST /api/projets "{\"title\":\"TEST — Projet contractualisé\",\"client_id\":$CLIENT_ID,\"budget\":250000,\"revisions_included\":3}")"
PROJECT_ID="$(json "$RESP" id)"
if [[ -n "$CLIENT_ID" && -n "$PROJECT_ID" ]]; then ok "client #$CLIENT_ID et projet #$PROJECT_ID créés"; else bad "contexte incomplet"; fi

# ── Modèles de contrat ───────────────────────────────────────────────────

say "1. Créer un modèle de contrat"
RESP="$(api POST /api/contrats/modeles '{"name":"TEST — Modèle de prestation","body":"CONTRAT DE PRESTATION\n\nEntre {{owner_name}} et {{client_name}} ({{company}}), demeurant {{client_address}}.\n\nObjet : {{project_title}}\nMontant : {{amount}}\nLivraison : {{delivery_date}}\nRévisions incluses : {{revisions_included}}\n\nFait le {{today}}."}')"
TEMPLATE_ID="$(json "$RESP" id)"
if [[ -n "$TEMPLATE_ID" ]]; then ok "modèle créé (#$TEMPLATE_ID)"; else bad "création refusée: ${RESP:0:250}"; fi

say "2. Un modèle trop court est refusé"
expect_code 400 "$(api_code POST /api/contrats/modeles '{"name":"TEST — Trop court","body":"Court."}')" "corps trop court rejeté"

# ── Contrats ─────────────────────────────────────────────────────────────

say "3. Créer un contrat depuis le modèle"
RESP="$(api POST /api/contrats "{\"template_id\":$TEMPLATE_ID,\"client_id\":$CLIENT_ID,\"project_id\":$PROJECT_ID,\"title\":\"TEST — Contrat de contrôle\",\"body\":\"\",\"amount\":250000,\"delivery_date\":\"$NEXT_MONTH\"}")"
CONTRACT_ID="$(json "$RESP" id)"
if [[ -n "$CONTRACT_ID" ]]; then ok "contrat créé (#$CONTRACT_ID)"; else bad "création refusée: ${RESP:0:300}"; fi

say "4. Les variables ont été remplacées, pas laissées telles quelles"
RESP="$(req "$BASE/api/contrats/$CONTRACT_ID")"
expect_contains "$RESP" 'TEST — Client contrat' "le nom du client est inséré"
expect_contains "$RESP" 'Société Contrat' "l’entreprise est insérée"
expect_contains "$RESP" 'TEST — Projet contractualisé' "l’objet est inséré"
if grep -q '{{' <<<"$RESP"; then bad "des accolades subsistent dans le contrat"; else ok "aucune variable non remplacée"; fi

say "5. Le contrat porte une référence"
expect_contains "$RESP" '"number":"CTR' "numéro attribué automatiquement"

say "6. Modifier le modèle ne réécrit pas le contrat"
# C'est la garantie centrale : le contrat est figé au moment de sa rédaction.
api POST /api/contrats/modeles "{\"id\":$TEMPLATE_ID,\"name\":\"TEST — Modèle modifié\",\"body\":\"TEXTE ENTIÈREMENT DIFFÉRENT, suffisamment long pour passer la validation du modèle.\"}" >/dev/null
RESP="$(req "$BASE/api/contrats/$CONTRACT_ID")"
if grep -q 'TEXTE ENTIÈREMENT DIFFÉRENT' <<<"$RESP"; then
  bad "le contrat a suivi la modification du modèle"
else
  ok "le contrat conserve son texte d’origine"
fi
expect_contains "$RESP" 'CONTRAT DE PRESTATION' "le texte initial est intact"

say "7. Un brouillon est modifiable"
api PATCH "/api/contrats/$CONTRACT_ID" '{"amount":300000}' >/dev/null
expect_contains "$(req "$BASE/api/contrats/$CONTRACT_ID")" '"amount":300000' "montant modifié"

say "8. Le PDF est généré"
HEADERS="$(req -D - -o /dev/null "$BASE/api/contrats/$CONTRACT_ID/pdf")"
expect_contains "$HEADERS" 'application/pdf' "PDF servi"

say "9. Marquer comme signé fige le contrat"
api PATCH "/api/contrats/$CONTRACT_ID" '{"status":"signed"}' >/dev/null
RESP="$(req "$BASE/api/contrats/$CONTRACT_ID")"
expect_contains "$RESP" '"status":"signed"' "statut signé"
expect_contains "$RESP" '"signed_at":"20' "date de signature posée"
expect_code 409 "$(api_code PATCH "/api/contrats/$CONTRACT_ID" '{"body":"Texte réécrit après signature."}')" "réécriture refusée (409)"
expect_code 409 "$(api_code PATCH "/api/contrats/$CONTRACT_ID" '{"amount":1}')" "changement de montant refusé (409)"
expect_contains "$(req "$BASE/api/contrats/$CONTRACT_ID")" '"amount":300000' "le montant signé est intact"

say "10. Un contrat signé est annulé, pas supprimé"
RESP="$(api DELETE "/api/contrats/$CONTRACT_ID")"
expect_contains "$RESP" '"cancelled":true' "annulé plutôt que supprimé"
expect_contains "$(req "$BASE/api/contrats/$CONTRACT_ID")" 'TEST — Contrat de contrôle' "toujours présent en base"

say "11. Le statut reste dans l'énumération"
expect_code 400 "$(api_code PATCH "/api/contrats/$CONTRACT_ID" '{"status":"paraphe"}')" "statut inventé rejeté"

# ── Dépenses ─────────────────────────────────────────────────────────────

say "12. Enregistrer une dépense"
RESP="$(api POST /api/depenses "{\"label\":\"TEST — Nom de domaine\",\"category\":\"hosting\",\"amount\":4500,\"spent_at\":\"$TODAY\",\"supplier\":\"Registrar de test\",\"project_id\":$PROJECT_ID}")"
EXPENSE_ID="$(json "$RESP" id)"
if [[ -n "$EXPENSE_ID" ]]; then ok "dépense créée (#$EXPENSE_ID)"; else bad "création refusée: ${RESP:0:250}"; fi

say "13. Un montant nul ou négatif est refusé"
expect_code 400 "$(api_code POST /api/depenses '{"label":"TEST — Gratuit","amount":0}')" "montant zéro rejeté"
expect_code 400 "$(api_code POST /api/depenses '{"label":"TEST — Négatif","amount":-100}')" "montant négatif rejeté"

say "14. Une catégorie inventée est refusée"
expect_code 400 "$(api_code POST /api/depenses '{"label":"TEST — Hors catégorie","category":"cadeaux","amount":100}')" "catégorie hors énumération rejetée"

say "15. Un justificatif inexistant est refusé"
expect_code 400 "$(api_code POST /api/depenses '{"label":"TEST — Faux justificatif","amount":100,"receipt_file_id":999999}')" "fichier inexistant rejeté"

say "16. Le total et la répartition par catégorie sont cohérents"
RESP="$(req "$BASE/api/depenses?du=$TODAY&au=$TODAY")"
expect_contains "$RESP" '"byCategory"' "répartition fournie"
expect_contains "$RESP" 'hosting' "la catégorie de la dépense apparaît"

say "17. Modifier le montant est tracé"
api PATCH "/api/depenses/$EXPENSE_ID" '{"amount":5200}' >/dev/null
expect_contains "$(req "$BASE/api/depenses?du=$TODAY&au=$TODAY")" '5200' "montant modifié"

# ── Abonnements ──────────────────────────────────────────────────────────

say "18. Créer un abonnement"
RESP="$(api POST /api/abonnements "{\"service_name\":\"TEST — Hébergement mensuel\",\"category\":\"hosting\",\"amount\":2000,\"frequency\":\"monthly\",\"renewal_date\":\"$YESTERDAY\",\"auto_renew\":true}")"
SUB_ID="$(json "$RESP" id)"
if [[ -n "$SUB_ID" ]]; then ok "abonnement créé (#$SUB_ID)"; else bad "création refusée: ${RESP:0:250}"; fi

say "19. Le coût mensuel équivalent ramène les cycles sur une base commune"
RESP="$(api POST /api/abonnements '{"service_name":"TEST — Licence annuelle","category":"software","amount":12000,"frequency":"yearly","auto_renew":false}')"
SUB2_ID="$(json "$RESP" id)"
RESP="$(req "$BASE/api/abonnements")"
# 2000/mois + 12000/an (= 1000/mois) : le total doit dépasser 2999.
MONTHLY="$(json "$RESP" monthlyCost)"
if [[ -n "$MONTHLY" && "$MONTHLY" -ge 3000 ]]; then
  ok "coût mensuel équivalent calculé ($MONTHLY)"
else
  bad "coût mensuel inattendu: '${MONTHLY:-?}' (attendu ≥ 3000)"
fi

say "20. Les renouvellements proches sont signalés"
expect_contains "$(req "$BASE/api/abonnements")" 'TEST — Hébergement mensuel' "l’échéance atteinte est listée"

say "21. Avancer le renouvellement crée la dépense"
BEFORE="$(req "$BASE/api/depenses" | grep -c 'renouvellement' || true)"
RESP="$(api PATCH "/api/abonnements/$SUB_ID" '{"roll":true}')"
expect_contains "$RESP" '"rolled":true' "renouvellement enregistré"
EXPENSE_FROM_SUB="$(json "$RESP" expenseId)"
if [[ -n "$EXPENSE_FROM_SUB" ]]; then ok "dépense générée (#$EXPENSE_FROM_SUB)"; else bad "aucune dépense générée"; fi
expect_contains "$(req "$BASE/api/depenses")" 'TEST — Hébergement mensuel (renouvellement)' "la dépense porte le nom du service"

say "22. La date a bien avancé d'un cycle"
RESP="$(req "$BASE/api/abonnements")"
if grep -q "\"renewal_date\":\"$YESTERDAY\"" <<<"$RESP"; then
  bad "la date de renouvellement n'a pas bougé"
else
  ok "la date a avancé"
fi

say "23. On ne peut pas avancer un renouvellement à venir"
expect_code 400 "$(api_code PATCH "/api/abonnements/$SUB_ID" '{"roll":true}')" "échéance future : refusé"

say "24. Un abonnement sans reconduction ne peut pas être avancé"
expect_code 400 "$(api_code PATCH "/api/abonnements/$SUB2_ID" '{"roll":true}')" "reconduction désactivée : refusé"

say "25. Résilier conserve l'historique"
RESP="$(api DELETE "/api/abonnements/$SUB_ID")"
expect_contains "$RESP" '"cancelled":true' "résilié plutôt que supprimé"
expect_contains "$(req "$BASE/api/depenses")" 'renouvellement' "la dépense générée est conservée"

# ── Statistiques ─────────────────────────────────────────────────────────

say "26. Les statistiques reflètent les enregistrements"
PAGE="$(req "$BASE/espace-admin/statistiques")"
expect_contains "$PAGE" 'Statistiques' "la page se rend"
if grep -qiE "lorem ipsum|votre texte ici|à compléter|chiffre d.exemple" <<<"$PAGE"; then
  bad "du texte de remplissage apparaît"
else
  ok "aucun chiffre inventé ni texte de remplissage"
fi

# ── Permissions ──────────────────────────────────────────────────────────

say "27. Les permissions sont exigées"
for path in /api/contrats /api/contrats/modeles /api/depenses /api/abonnements; do
  got="$(curl -sS --noproxy '*' -H "Origin: $BASE" -o /dev/null -w '%{http_code}' \
    -X POST "$BASE$path" -H 'Content-Type: application/json' \
    -d '{"title":"x","name":"x","body":"corps suffisamment long pour la validation","label":"x","amount":1,"service_name":"x"}')"
  expect_code 401 "$got" "sans session : $path refusé"
done

say "28. Nettoyage"
expect_code 200 "$(api_code DELETE "/api/contrats/$CONTRACT_ID?force=1")" "contrat supprimé"
CONTRACT_ID=""
expect_code 200 "$(api_code DELETE "/api/contrats/modeles?id=$TEMPLATE_ID")" "modèle supprimé"
TEMPLATE_ID=""
expect_code 200 "$(api_code DELETE "/api/depenses/$EXPENSE_ID")" "dépense supprimée"
EXPENSE_ID=""
[[ -n "$EXPENSE_FROM_SUB" ]] && api DELETE "/api/depenses/$EXPENSE_FROM_SUB" >/dev/null 2>&1
expect_code 200 "$(api_code DELETE "/api/abonnements/$SUB_ID?force=1")" "abonnement supprimé"
SUB_ID=""
expect_code 200 "$(api_code DELETE "/api/abonnements/$SUB2_ID?force=1")" "second abonnement supprimé"
SUB2_ID=""
expect_code 200 "$(api_code DELETE "/api/projets/$PROJECT_ID?force=1")" "projet supprimé"
PROJECT_ID=""
expect_code 200 "$(api_code DELETE "/api/clients/$CLIENT_ID?force=1")" "client supprimé"
CLIENT_ID=""

summary
