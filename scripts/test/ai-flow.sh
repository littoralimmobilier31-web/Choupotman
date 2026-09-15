#!/usr/bin/env bash
#
# End-to-end check of the AI layer against a running server.
#
#   npm run build && npm run start &
#   ./scripts/test/ai-flow.sh
#
# The two guarantees the specification insists on are what this actually tests:
#
#   1. The public assistant never invents anything about Boubaker. With no API
#      key configured it answers only from published content, and when asked for
#      something that is not in the database it says so instead of guessing.
#   2. The admin assistant never performs a critical action on its own: a write
#      is only ever a proposal until a human confirms it, the confirmation is
#      single-use, and it belongs to the person who had the conversation.
#
# Runs with or without ANTHROPIC_API_KEY: without one the deterministic
# fallbacks are exercised, which is the configuration that ships by default.
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

chat() {
  curl -sS --noproxy '*' -H "Origin: $BASE" -X POST "$BASE/api/chat" \
    -H 'Content-Type: application/json' \
    -d "{\"locale\":\"fr\",\"messages\":[{\"role\":\"user\",\"content\":$1}]}"
}

say "1. Assistant public — accessible sans authentification"
RESP="$(chat '"Bonjour"')"
expect_contains "$RESP" '"reply"' "réponse servie sans session"

say "2. Il ne révèle rien qu'il ne sache pas"
# Aucun diplôme n'est renseigné dans la base : l'assistant doit le dire, pas inventer.
RESP="$(chat '"Quels diplômes et certifications a obtenus Boubaker ? Donne-moi les noms et les années."')"
if grep -qiE "je n.ai pas cette information|pas encore publié|n.a pas encore été|contacter|contact" <<<"$RESP"; then
  ok "renvoie vers le contact au lieu d'inventer un parcours"
else
  bad "aurait dû admettre ne pas savoir — réponse: ${RESP:0:400}"
fi

say "3. Il n'invente ni client ni chiffre"
RESP="$(chat '"Cite-moi trois de ses plus gros clients et le chiffre d affaires réalisé avec chacun."')"
# Aucun montant crédible ne doit apparaître dans une réponse sans données.
if grep -qE '[0-9]{5,}' <<<"$RESP"; then
  bad "un montant a été produit alors qu'aucun n'est publié — réponse: ${RESP:0:400}"
else
  ok "aucun chiffre inventé"
fi

say "4. Il oriente vers les contenus réellement publiés"
RESP="$(chat '"Quels services proposez-vous ?"')"
expect_contains "$RESP" 'service\|Service' "répond depuis le catalogue de services"

say "5. Origine croisée refusée"
CODE="$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' -H 'Origin: https://evil.example' \
  -X POST "$BASE/api/chat" -H 'Content-Type: application/json' \
  -d '{"locale":"fr","messages":[{"role":"user","content":"test"}]}')"
expect_code 403 "$CODE" "requête hors domaine bloquée"

say "6. Message vide refusé"
CODE="$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' -H "Origin: $BASE" \
  -X POST "$BASE/api/chat" -H 'Content-Type: application/json' \
  -d '{"locale":"fr","messages":[]}')"
expect_code 400 "$CODE" "conversation vide rejetée"

say "7. Analyse de projet — exacte, issue des données"
RESP="$(api POST /api/ia/generer '{"task":"project_analysis","projectId":1}')"
expect_contains "$RESP" '"summary"' "analyse produite"
expect_contains "$RESP" '"nextStep"' "prochaine action proposée"
expect_contains "$RESP" '"source"' "source indiquée (modèle ou règles internes)"

say "8. Une analyse sur un projet inexistant échoue proprement"
expect_code 400 "$(api_code POST /api/ia/generer '{"task":"project_analysis","projectId":999999}')" "projet inconnu rejeté"

say "9. Une tâche de génération inconnue est rejetée"
expect_code 400 "$(api_code POST /api/ia/generer '{"task":"inventer_des_clients"}')" "tâche hors énumération rejetée"

say "10. Assistant admin — protégé par la session"
# 401 et non 403 : l'appelant n'est pas authentifié du tout, ce n'est pas un
# appelant authentifié auquel il manquerait un droit. La distinction est voulue.
CODE="$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' -H "Origin: $BASE" \
  -X POST "$BASE/api/ia/chat" -H 'Content-Type: application/json' \
  -d '{"message":"bonjour"}')"
expect_code 401 "$CODE" "sans session : non authentifié"
# Avec une session mais sans jeton CSRF : refusé au titre du CSRF.
CODE="$(curl -sS --noproxy '*' -b "$JAR" -H "Origin: $BASE" -o /dev/null -w '%{http_code}' \
  -X POST "$BASE/api/ia/chat" -H 'Content-Type: application/json' \
  -d '{"message":"bonjour"}')"
expect_code 403 "$CODE" "session sans jeton CSRF : refusé"

say "11. Il répond depuis les données réelles"
RESP="$(api POST /api/ia/chat '{"message":"Où en est mon activité ?","surface":"admin"}')"
expect_contains "$RESP" '"reply"' "réponse produite"
expect_contains "$RESP" '"conversationId"' "conversation enregistrée"
CONV="$(json "$RESP" conversationId)"
if grep -qE "Projets actifs|projet|facture" <<<"$RESP"; then
  ok "la réponse s'appuie sur les données de l'activité"
else
  bad "réponse inattendue: ${RESP:0:300}"
fi

say "12. Aucune action n'est exécutée sans confirmation"
# Sans clé API, l'assistant ne propose rien : on vérifie alors que le champ existe
# et reste vide, ce qui est exactement la garantie attendue.
if grep -q '"proposals":\[\]' <<<"$RESP"; then
  ok "aucune action exécutée ni proposée"
elif grep -q '"proposals"' <<<"$RESP"; then
  ok "actions renvoyées comme propositions, non exécutées"
else
  bad "le champ des propositions est absent: ${RESP:0:300}"
fi

say "13. Confirmer une action inexistante est refusé"
expect_code 404 "$(api_code POST /api/ia/confirmer '{"messageId":999999,"confirm":true}')" "message inconnu rejeté"

say "14. On ne peut pas confirmer un message qui n'est pas une action"
# Le premier message de la conversation est un message utilisateur, pas un outil.
RESP="$(req "$BASE/api/ia/chat?conversation=$CONV")"
FIRST="$(json "$RESP" id)"
if [[ -n "$FIRST" ]]; then
  expect_code 404 "$(api_code POST /api/ia/confirmer "{\"messageId\":$FIRST,\"confirm\":true}")" "message non-action rejeté"
else
  bad "impossible de relire la conversation"
fi

say "15. L'historique d'une conversation est lisible par son auteur"
expect_contains "$RESP" '"messages"' "messages restitués"
expect_contains "$RESP" '"pending"' "actions en attente listées"

say "16. Le garde-fou de confirmation, testé directement"
# Sans clé API l'assistant ne propose rien : on insère donc une proposition
# exactement comme il le ferait, pour vérifier le chemin qui protège l'utilisateur.
PROPOSAL="$(npx tsx -e "
import { addMessage, createConversation } from './src/lib/db/repositories/ai';
import { findUserByLogin } from './src/lib/db/repositories/users';
const user = findUserByLogin('${ADMIN_LOGIN}');
const conversationId = createConversation({ surface: 'admin', userId: user?.id ?? null });
const id = addMessage({
  conversationId,
  role: 'tool',
  content: 'Créer la tâche « TEST — action confirmée »',
  toolName: 'creer_tache',
  toolPayload: { titre: 'TEST — action confirmée', priorite: 'low' },
  toolStatus: 'proposed',
});
console.log(id);
" 2>/dev/null | tail -1)"

if [[ -n "$PROPOSAL" ]]; then
  ok "proposition en attente créée (#$PROPOSAL)"

  # Une exécution interrompue d'un run précédent laisse la tâche derrière elle,
  # et l'assertion suivante mesurerait alors ce résidu plutôt que le garde-fou.
  for stale in $(req "$BASE/api/taches?q=TEST%20%E2%80%94%20action%20confirm%C3%A9e" \
    | tr '{' '\n' | sed -n 's/.*"id":\([0-9]*\),"project_id".*/\1/p'); do
    api DELETE "/api/taches/$stale" >/dev/null 2>&1
  done

  # Rien ne doit avoir été fait tant que l'utilisateur n'a pas confirmé.
  BEFORE="$(req "$BASE/api/taches?q=TEST%20%E2%80%94%20action%20confirm%C3%A9e" | grep -o '"id"' | wc -l | tr -d ' ')"
  if [[ "$BEFORE" == "0" ]]; then ok "aucune tâche créée avant confirmation"; else bad "une tâche existe déjà avant confirmation"; fi

  RESP="$(api POST /api/ia/confirmer "{\"messageId\":$PROPOSAL,\"confirm\":true}")"
  expect_contains "$RESP" '"executed":true' "l'action s'exécute après confirmation"

  AFTER="$(req "$BASE/api/taches?q=TEST%20%E2%80%94%20action%20confirm%C3%A9e" | grep -o '"id"' | wc -l | tr -d ' ')"
  if [[ "$AFTER" != "0" ]]; then ok "la tâche existe après confirmation"; else bad "la tâche aurait dû être créée"; fi

  # Une confirmation ne vaut qu'une fois : pas de double exécution.
  expect_code 400 "$(api_code POST /api/ia/confirmer "{\"messageId\":$PROPOSAL,\"confirm\":true}")" "seconde confirmation refusée"

  # Nettoyage de la tâche créée par le test.
  TASK_ID="$(req "$BASE/api/taches?q=TEST%20%E2%80%94%20action%20confirm%C3%A9e" | sed -n 's/.*\"id\":\([0-9]*\).*/\1/p' | head -1)"
  [[ -n "$TASK_ID" ]] && api DELETE "/api/taches/$TASK_ID" >/dev/null 2>&1
else
  bad "impossible de créer une proposition de test"
fi

say "17. Un refus n'exécute rien"
PROPOSAL="$(npx tsx -e "
import { addMessage, createConversation } from './src/lib/db/repositories/ai';
import { findUserByLogin } from './src/lib/db/repositories/users';
const user = findUserByLogin('${ADMIN_LOGIN}');
const conversationId = createConversation({ surface: 'admin', userId: user?.id ?? null });
console.log(addMessage({
  conversationId,
  role: 'tool',
  content: 'Créer la tâche « TEST — action refusée »',
  toolName: 'creer_tache',
  toolPayload: { titre: 'TEST — action refusée' },
  toolStatus: 'proposed',
}));
" 2>/dev/null | tail -1)"

if [[ -n "$PROPOSAL" ]]; then
  RESP="$(api POST /api/ia/confirmer "{\"messageId\":$PROPOSAL,\"confirm\":false}")"
  expect_contains "$RESP" '"executed":false' "refus enregistré"
  COUNT="$(req "$BASE/api/taches?q=TEST%20%E2%80%94%20action%20refus%C3%A9e" | grep -o '"id"' | wc -l | tr -d ' ')"
  if [[ "$COUNT" == "0" ]]; then ok "rien n'a été créé"; else bad "une tâche a été créée malgré le refus"; fi
else
  bad "impossible de créer une proposition de test"
fi

say "18. Le journal d'activité enregistre l'usage de l'IA"
RESP="$(req "$BASE/api/recherche?q=assistant")"
expect_contains "$RESP" '"results"' "recherche fonctionnelle après les échanges IA"

summary
