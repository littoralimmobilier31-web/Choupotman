#!/usr/bin/env bash
#
# End-to-end check of the finance module against a running server.
#
#   npm run dev &
#   ./scripts/test/finance-flow.sh
#
# Covers what actually protects the accounts: correct totals (line discount →
# document discount → VAT on the discounted base), quote-to-invoice conversion
# without retyping, partial payments, refusal of over-payment, locked amounts on
# an issued invoice, and cancellation instead of deletion.
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

CLIENT_ID=""; QUOTE_ID=""; INVOICE_ID=""
cleanup_all() {
  [[ -n "$INVOICE_ID" ]] && api DELETE "/api/factures/$INVOICE_ID" >/dev/null 2>&1
  [[ -n "$QUOTE_ID"   ]] && api DELETE "/api/devis/$QUOTE_ID" >/dev/null 2>&1
  [[ -n "$CLIENT_ID"  ]] && api DELETE "/api/clients/$CLIENT_ID?force=1" >/dev/null 2>&1
  # The cookie jar is intentionally kept: see scripts/test/lib.sh.
}
trap cleanup_all EXIT

say "1. Client de test"
RESP="$(api POST /api/clients '{"name":"TEST — Client finance","email":"finance-test@example.com","currency":"DZD"}')"
CLIENT_ID="$(json "$RESP" id)"
if [[ -n "$CLIENT_ID" ]]; then ok "client créé (#$CLIENT_ID)"; else bad "création refusée: ${RESP:0:300}"; summary; exit 1; fi

say "2. Devis avec remise de ligne, remise globale et TVA"
# 2 × 100 000 avec 10 % de remise ligne = 180 000
# +   1 ×  50 000 sans remise          =  50 000  → sous-total 230 000
# remise globale 10 %                  = −23 000  → base 207 000
# TVA 19 %                             = +39 330  → total 246 330
BODY="{\"client_id\":$CLIENT_ID,\"title\":\"TEST — Prestation\",\"currency\":\"DZD\",\"status\":\"draft\",\"discount_type\":\"percent\",\"discount_value\":10,\"tax_rate\":19,\"items\":[
  {\"label\":\"Développement\",\"quantity\":2,\"unit\":\"jour\",\"unit_price\":100000,\"discount\":10},
  {\"label\":\"Hébergement\",\"quantity\":1,\"unit\":\"forfait\",\"unit_price\":50000,\"discount\":0}
]}"
RESP="$(api POST /api/devis "$BODY")"
QUOTE_ID="$(json "$RESP" id)"
if [[ -n "$QUOTE_ID" ]]; then ok "devis créé (#$QUOTE_ID)"; else bad "création refusée: ${RESP:0:300}"; summary; exit 1; fi

# La base imposable (207 000) n'est pas stockée : elle vaut subtotal − remise.
RESP="$(req "$BASE/api/devis/$QUOTE_ID")"
for pair in "subtotal:230000" "discount_total:23000" "tax_total:39330" "total:246330"; do
  field="${pair%%:*}"; want="${pair##*:}"
  got="$(sed -n "s/.*\"$field\":\([0-9.]*\).*/\1/p" <<<"$RESP" | head -1)"
  if [[ "${got%.*}" == "$want" ]]; then ok "$field = $want"; else bad "$field — attendu $want, obtenu '${got:-vide}'"; fi
done

say "3. Transformation du devis en facture"
RESP="$(api POST "/api/devis/$QUOTE_ID/facturer")"
INVOICE_ID="$(json "$RESP" invoiceId)"
if [[ -n "$INVOICE_ID" ]]; then ok "facture créée (#$INVOICE_ID)"; else bad "facturation refusée: ${RESP:0:300}"; summary; exit 1; fi

RESP="$(req "$BASE/api/factures/$INVOICE_ID")"
TOTAL="$(sed -n 's/.*"total":\([0-9.]*\).*/\1/p' <<<"$RESP" | head -1)"
if [[ "${TOTAL%.*}" == "246330" ]]; then ok "total repris à l'identique (246330)"; else bad "total attendu 246330, obtenu '${TOTAL:-vide}'"; fi
expect_contains "$RESP" '"status":"draft"' "créée en brouillon, à vérifier avant émission"

say "4. Une seconde facturation du même devis est refusée"
expect_code 409 "$(api_code POST "/api/devis/$QUOTE_ID/facturer")" "pas de double facturation"

say "5. Paiement impossible tant que la facture est en brouillon"
CODE="$(api_code POST /api/paiements "{\"invoice_id\":$INVOICE_ID,\"amount\":1000,\"currency\":\"DZD\",\"method\":\"transfer\"}")"
expect_code 409 "$CODE" "règlement refusé sur un brouillon"

say "6. Émission de la facture"
RESP="$(api PATCH "/api/factures/$INVOICE_ID" '{"status":"sent"}')"
expect_contains "$RESP" '"ok":true' "facture émise"
# Régression : un PATCH de statut seul ne doit jamais réinitialiser les montants
# (les valeurs par défaut du schéma ne doivent pas se substituer aux champs absents).
RESP="$(req "$BASE/api/factures/$INVOICE_ID")"
TOTAL="$(sed -n 's/.*"total":\([0-9.]*\).*/\1/p' <<<"$RESP" | head -1)"
if [[ "${TOTAL%.*}" == "246330" ]]; then ok "montants intacts après un PATCH de statut"; else bad "total attendu 246330, obtenu '${TOTAL:-vide}'"; fi
expect_contains "$RESP" '"discount_type":"percent"' "remise conservée"
expect_contains "$RESP" '"tax_rate":19' "taux de TVA conservé"

say "7. Les montants sont verrouillés après émission"
CODE="$(api_code PATCH "/api/factures/$INVOICE_ID" '{"items":[{"label":"Ligne pirate","quantity":1,"unit":"forfait","unit_price":1,"discount":0}]}')"
expect_code 409 "$CODE" "modification des lignes refusée"

say "8. Paiement partiel"
RESP="$(api POST /api/paiements "{\"invoice_id\":$INVOICE_ID,\"amount\":100000,\"currency\":\"DZD\",\"method\":\"transfer\",\"reference\":\"TEST-VIR-1\"}")"
expect_contains "$RESP" '"ok":true' "règlement de 100 000 enregistré"
RESP="$(req "$BASE/api/factures/$INVOICE_ID")"
expect_contains "$RESP" '"status":"partially_paid"' "statut dérivé : partiellement payée"
BALANCE="$(sed -n 's/.*"balance_due":\([0-9.]*\).*/\1/p' <<<"$RESP" | head -1)"
if [[ "${BALANCE%.*}" == "146330" ]]; then ok "reste dû = 146330"; else bad "reste dû attendu 146330, obtenu '${BALANCE:-vide}'"; fi

say "9. Le sur-paiement est refusé"
CODE="$(api_code POST /api/paiements "{\"invoice_id\":$INVOICE_ID,\"amount\":999999,\"currency\":\"DZD\",\"method\":\"cash\"}")"
expect_code 400 "$CODE" "montant supérieur au solde rejeté"

say "10. Solde de la facture"
RESP="$(api POST /api/paiements "{\"invoice_id\":$INVOICE_ID,\"amount\":146330,\"currency\":\"DZD\",\"method\":\"ccp\",\"reference\":\"TEST-CCP-2\"}")"
expect_contains "$RESP" '"ok":true' "solde encaissé"
RESP="$(req "$BASE/api/factures/$INVOICE_ID")"
expect_contains "$RESP" '"status":"paid"' "statut dérivé : payée"
expect_contains "$RESP" '"balance_due":0' "reste dû nul"

say "11. Le PDF est généré"
CODE="$(code "$BASE/api/factures/$INVOICE_ID/pdf")"
expect_code 200 "$CODE" "PDF de facture"
HEAD="$(req "$BASE/api/factures/$INVOICE_ID/pdf" | head -c 5)"
if [[ "$HEAD" == "%PDF-" ]]; then ok "en-tête PDF valide"; else bad "en-tête inattendu: '$HEAD'"; fi
expect_code 200 "$(code "$BASE/api/devis/$QUOTE_ID/pdf")" "PDF de devis"

say "12. Une facture émise est annulée, jamais supprimée"
RESP="$(api DELETE "/api/factures/$INVOICE_ID")"
expect_contains "$RESP" 'cancelled\|annul' "annulation plutôt que suppression"
RESP="$(req "$BASE/api/factures/$INVOICE_ID")"
expect_contains "$RESP" "\"id\":$INVOICE_ID" "la facture existe toujours (numéro conservé)"
INVOICE_ID=""

say "13. Un devis envoyé est archivé, pas supprimé"
api PATCH "/api/devis/$QUOTE_ID" '{"status":"sent"}' >/dev/null
RESP="$(api DELETE "/api/devis/$QUOTE_ID")"
expect_contains "$RESP" '"archived":true' "devis archivé"
QUOTE_ID=""

say "14. Nettoyage"
expect_code 200 "$(api_code DELETE "/api/clients/$CLIENT_ID?force=1")" "client de test supprimé"
CLIENT_ID=""

summary
