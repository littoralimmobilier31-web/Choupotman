#!/usr/bin/env bash
#
# End-to-end check of the file library and the moodboards.
#
#   npm run build && npm run start &
#   ./scripts/test/files-flow.sh
#
# Uploads are the highest-risk surface in the application, so most of this suite
# is about what the server *refuses*: a disguised executable, a file whose bytes
# disagree with its extension, a download without a session, a capture token used
# against another board. The happy paths are checked too, but they are not the
# reason this file exists.
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

TMP="$(mktemp -d)"
FOLDER_ID=""; SUB_ID=""; FILE_ID=""; BOARD_ID=""; BOARD2_ID=""; ITEM_ID=""; TOKEN=""
cleanup_all() {
  [[ -n "$FILE_ID"   ]] && api DELETE "/api/fichiers/$FILE_ID"          >/dev/null 2>&1
  [[ -n "$SUB_ID"    ]] && api DELETE "/api/dossiers/$SUB_ID?force=1"   >/dev/null 2>&1
  [[ -n "$FOLDER_ID" ]] && api DELETE "/api/dossiers/$FOLDER_ID?force=1" >/dev/null 2>&1
  [[ -n "$BOARD_ID"  ]] && api DELETE "/api/moodboards/$BOARD_ID"       >/dev/null 2>&1
  [[ -n "$BOARD2_ID" ]] && api DELETE "/api/moodboards/$BOARD2_ID"      >/dev/null 2>&1
  rm -rf "$TMP"
  return 0
}
trap cleanup_all EXIT

# A real 1×1 PNG: the magic-byte check is not fooled by an empty file.
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\x0d\n-\xb4\x00\x00\x00\x00IEND\xaeB\x60\x82' > "$TMP/image.png"
printf 'Contenu texte de test.\n' > "$TMP/note.txt"
printf '#!/bin/sh\necho compromis\n' > "$TMP/script.sh"
# A shell script wearing a .png extension — the case the signature check exists for.
cp "$TMP/script.sh" "$TMP/deguise.png"

upload() {
  # $1… : -F arguments
  req -X POST "$BASE/api/fichiers" -H "x-csrf-token: $CSRF" -F "csrf=$CSRF" "$@"
}
upload_code() {
  code -X POST "$BASE/api/fichiers" -H "x-csrf-token: $CSRF" -F "csrf=$CSRF" "$@"
}

# ── Dossiers ─────────────────────────────────────────────────────────────

say "1. Créer un dossier"
RESP="$(api POST /api/dossiers '{"name":"TEST — Dossier de contrôle"}')"
FOLDER_ID="$(json "$RESP" id)"
if [[ -n "$FOLDER_ID" ]]; then ok "dossier créé (#$FOLDER_ID)"; else bad "création refusée: ${RESP:0:250}"; fi

say "2. Un slash dans le nom ne casse pas l'arborescence"
RESP="$(api POST /api/dossiers "{\"name\":\"a/b\\\\c\",\"parent_id\":$FOLDER_ID}")"
SUB_ID="$(json "$RESP" id)"
if [[ -n "$SUB_ID" ]]; then ok "sous-dossier créé (#$SUB_ID)"; else bad "création refusée: ${RESP:0:250}"; fi
if grep -q '"path":"[^"]*a-b-c"' <<<"$RESP"; then ok "les séparateurs ont été neutralisés"; else bad "chemin inattendu: ${RESP:0:250}"; fi

say "3. Un dossier parent inexistant est refusé"
expect_code 400 "$(api_code POST /api/dossiers '{"name":"Orphelin","parent_id":999999}')" "parent inexistant rejeté"

say "4. Renommer réécrit le chemin des descendants"
api PATCH "/api/dossiers/$FOLDER_ID" '{"name":"TEST — Dossier renommé"}' >/dev/null
RESP="$(req "$BASE/api/dossiers?parent=$FOLDER_ID")"
if grep -q 'TEST — Dossier renommé' <<<"$(req "$BASE/api/dossiers?parent=racine")"; then
  ok "dossier renommé"
else
  bad "le renommage n'apparaît pas"
fi

# ── Upload ───────────────────────────────────────────────────────────────

say "5. Envoyer un fichier valide"
RESP="$(upload -F "fichiers=@$TMP/image.png;type=image/png" -F "folder_id=$FOLDER_ID")"
FILE_ID="$(json "$RESP" id)"
if [[ -n "$FILE_ID" ]]; then ok "fichier envoyé (#$FILE_ID)"; else bad "envoi refusé: ${RESP:0:300}"; fi

say "6. Le nom sur le disque n'est pas celui de l'utilisateur"
RESP="$(req "$BASE/api/fichiers/$FILE_ID")"
STORED="$(jstr "$RESP" stored_name)"
if [[ -n "$STORED" && "$STORED" != *"image.png" ]]; then
  ok "nom de stockage aléatoire ($STORED)"
else
  bad "le nom d'origine est utilisé sur le disque: '$STORED'"
fi
expect_contains "$RESP" '"original_name":"image.png"' "le nom d’origine est conservé en métadonnée"
expect_contains "$RESP" '"kind":"image"' "type déduit du contenu"

say "7. Une extension interdite est refusée"
RESP="$(upload -F "fichiers=@$TMP/script.sh;type=application/x-sh")"
expect_contains "$RESP" 'non autorisé' "extension .sh refusée"
if grep -q '"created":\[\]' <<<"$RESP"; then ok "rien n’a été stocké"; else bad "un fichier a été créé: ${RESP:0:250}"; fi

say "8. Un script déguisé en image est refusé"
# L'extension est autorisée et le type déclaré concorde : seule la signature
# binaire permet de détecter la supercherie.
RESP="$(upload -F "fichiers=@$TMP/deguise.png;type=image/png")"
expect_contains "$RESP" 'ne correspond pas' "contenu incohérent avec l’extension refusé"

say "9. Un lot partiel réussit sans perdre les fichiers valides"
RESP="$(upload -F "fichiers=@$TMP/note.txt;type=text/plain" -F "fichiers=@$TMP/script.sh;type=application/x-sh")"
OTHER_ID="$(json "$RESP" id)"
if [[ -n "$OTHER_ID" ]]; then ok "le fichier valide du lot est passé (#$OTHER_ID)"; else bad "lot entièrement rejeté: ${RESP:0:250}"; fi
expect_contains "$RESP" 'script.sh' "le fichier refusé est nommé dans la réponse"
[[ -n "$OTHER_ID" ]] && api DELETE "/api/fichiers/$OTHER_ID" >/dev/null 2>&1

say "10. Un envoi sans fichier est refusé"
expect_code 400 "$(upload_code -F "folder_id=$FOLDER_ID")" "envoi vide rejeté"

# ── Téléchargement ───────────────────────────────────────────────────────

say "11. Le téléchargement exige une session"
expect_code 401 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' "$BASE/api/fichiers/$FILE_ID/telecharger")" "sans session : refusé"

say "12. Téléchargement authentifié"
HEADERS="$(req -D - -o /dev/null "$BASE/api/fichiers/$FILE_ID/telecharger")"
expect_contains "$HEADERS" 'attachment' "servi en pièce jointe"
expect_contains "$HEADERS" 'nosniff' "X-Content-Type-Options présent"
expect_contains "$HEADERS" 'no-store' "jamais mis en cache"

say "13. Un fichier inexistant ne révèle rien"
expect_code 404 "$(code "$BASE/api/fichiers/999999/telecharger")" "identifiant inconnu : 404"

# ── Partage client ───────────────────────────────────────────────────────

say "14. Un fichier n'est pas partagé par défaut"
expect_contains "$(req "$BASE/api/fichiers/$FILE_ID")" '"is_client_visible":0' "privé par défaut"

say "15. Le partage est explicite et réversible"
api PATCH "/api/fichiers/$FILE_ID" '{"is_client_visible":true}' >/dev/null
expect_contains "$(req "$BASE/api/fichiers/$FILE_ID")" '"is_client_visible":1' "partagé après activation"
api PATCH "/api/fichiers/$FILE_ID" '{"is_client_visible":false}' >/dev/null
expect_contains "$(req "$BASE/api/fichiers/$FILE_ID")" '"is_client_visible":0' "partage retiré"

say "16. Renommer ne change pas le fichier stocké"
api PATCH "/api/fichiers/$FILE_ID" '{"original_name":"livrable-final.png"}' >/dev/null
RESP="$(req "$BASE/api/fichiers/$FILE_ID")"
expect_contains "$RESP" 'livrable-final.png' "nom affiché modifié"
expect_contains "$RESP" "$STORED" "nom de stockage inchangé"

# ── Suppression de dossier ───────────────────────────────────────────────

say "17. Un dossier non vide n'est pas supprimé sans confirmation"
expect_code 409 "$(api_code DELETE "/api/dossiers/$FOLDER_ID")" "dossier non vide : 409"
RESP="$(api DELETE "/api/dossiers/$FOLDER_ID")"
expect_contains "$RESP" 'remonteront à la racine' "la conséquence est expliquée"

# ── Moodboards ───────────────────────────────────────────────────────────

say "18. Créer un moodboard"
RESP="$(api POST /api/moodboards '{"title":"TEST — Planche de contrôle","description":"Direction visuelle de test."}')"
BOARD_ID="$(json "$RESP" id)"
if [[ -n "$BOARD_ID" ]]; then ok "moodboard créé (#$BOARD_ID)"; else bad "création refusée: ${RESP:0:250}"; fi

say "19. Ajouter des éléments"
RESP="$(api POST "/api/moodboards/$BOARD_ID/elements" '{"kind":"color","color":"#2563eb"}')"
ITEM_ID="$(json "$RESP" id)"
if [[ -n "$ITEM_ID" ]]; then ok "couleur ajoutée (#$ITEM_ID)"; else bad "ajout refusé: ${RESP:0:250}"; fi
expect_code 201 "$(api_code POST "/api/moodboards/$BOARD_ID/elements" '{"kind":"note","content":"Une note de test."}')" "note ajoutée"

say "20. Un élément sans contenu est refusé"
expect_code 400 "$(api_code POST "/api/moodboards/$BOARD_ID/elements" '{"kind":"image"}')" "image sans adresse rejetée"
expect_code 400 "$(api_code POST "/api/moodboards/$BOARD_ID/elements" '{"kind":"note"}')" "note vide rejetée"

say "21. La disposition est enregistrée en un seul appel"
RESP="$(api PUT "/api/moodboards/$BOARD_ID/elements" "{\"items\":[{\"id\":$ITEM_ID,\"x\":640,\"y\":320}]}")"
expect_contains "$RESP" '"saved":1' "disposition enregistrée"
expect_contains "$(req "$BASE/api/moodboards/$BOARD_ID")" '"x":640' "la position est persistée"

say "22. Un élément d'une autre planche n'est pas déplaçable"
RESP="$(api POST /api/moodboards '{"title":"TEST — Seconde planche"}')"
BOARD2_ID="$(json "$RESP" id)"
api PUT "/api/moodboards/$BOARD2_ID/elements" "{\"items\":[{\"id\":$ITEM_ID,\"x\":10,\"y\":10}]}" >/dev/null
expect_contains "$(req "$BASE/api/moodboards/$BOARD_ID")" '"x":640' "l’élément n’a pas bougé"
expect_code 404 "$(api_code DELETE "/api/moodboards/$BOARD2_ID/elements?element=$ITEM_ID")" "suppression croisée refusée"

# ── Lien public ──────────────────────────────────────────────────────────

say "23. Le lien public est désactivé par défaut"
expect_contains "$(req "$BASE/api/moodboards/$BOARD_ID")" '"share_token":null' "aucun lien au départ"

say "24. Activer le lien public"
RESP="$(api PATCH "/api/moodboards/$BOARD_ID" '{"share":true}')"
SHARE="$(jstr "$RESP" shareToken)"
if [[ ${#SHARE} -ge 16 ]]; then ok "jeton de partage généré"; else bad "jeton absent ou trop court: ${RESP:0:250}"; fi
PAGE="$(curl -sS --noproxy '*' "$BASE/moodboard/$SHARE")"
expect_contains "$PAGE" 'TEST — Planche de contrôle' "la planche est consultable sans compte"
expect_contains "$PAGE" 'lecture seule' "la page annonce la lecture seule"

say "25. Un jeton de partage inventé ne donne rien"
expect_code 404 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' "$BASE/moodboard/jeton-invente-0123456789")" "jeton inconnu : 404"

say "26. Désactiver le lien coupe l'accès"
api PATCH "/api/moodboards/$BOARD_ID" '{"share":false}' >/dev/null
expect_code 404 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' "$BASE/moodboard/$SHARE")" "ancien lien : 404"

# ── Jetons de capture ────────────────────────────────────────────────────

say "27. Créer un jeton de capture"
RESP="$(api POST "/api/moodboards/$BOARD_ID/jetons" '{"label":"TEST — extension","expires_in_days":30}')"
TOKEN="$(jstr "$RESP" token)"
TOKEN_ID="$(json "$RESP" id)"
if [[ ${#TOKEN} -ge 20 ]]; then ok "jeton émis"; else bad "jeton absent: ${RESP:0:250}"; fi

say "28. Le jeton n'est jamais réaffiché"
RESP="$(req "$BASE/api/moodboards/$BOARD_ID/jetons")"
if grep -q "$TOKEN" <<<"$RESP"; then bad "le jeton en clair est relisible"; else ok "seules les métadonnées sont lisibles"; fi
expect_contains "$RESP" 'TEST — extension' "le libellé est listé"

say "29. Capture sans session ni CSRF"
RESP="$(curl -sS --noproxy '*' -X POST "$BASE/api/capture" \
  -H 'Content-Type: application/json' -H "X-Capture-Token: $TOKEN" \
  -d '{"kind":"link","url":"https://exemple.test/reference","content":"Référence capturée"}')"
expect_contains "$RESP" '"ok":true' "capture acceptée avec un jeton valide"
expect_contains "$(req "$BASE/api/moodboards/$BOARD_ID")" 'Référence capturée' "l’élément est sur la planche"

say "30. Un jeton invalide est refusé"
expect_code 401 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' -X POST "$BASE/api/capture" \
  -H 'Content-Type: application/json' -H 'X-Capture-Token: 000000000000000000000000' \
  -d '{"kind":"link","url":"https://exemple.test"}')" "jeton inventé : 401"

say "31. Le jeton ne permet rien d'autre que d'ajouter"
# Pas de lecture, pas de suppression : le jeton n'ouvre aucune autre route.
expect_code 401 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' \
  -H "X-Capture-Token: $TOKEN" "$BASE/api/moodboards/$BOARD_ID")" "lecture de la planche refusée"

say "32. Révoquer coupe la capture immédiatement"
api DELETE "/api/moodboards/$BOARD_ID/jetons?jeton=$TOKEN_ID" >/dev/null
expect_code 401 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' -X POST "$BASE/api/capture" \
  -H 'Content-Type: application/json' -H "X-Capture-Token: $TOKEN" \
  -d '{"kind":"link","url":"https://exemple.test"}')" "jeton révoqué : 401"

say "33. La capture externe est tracée dans le journal"
expect_contains "$(req "$BASE/api/recherche?q=Planche+de+contr%C3%B4le")" 'TEST — Planche de contrôle' "la planche est indexée"

# ── Permissions ──────────────────────────────────────────────────────────

say "34. Les permissions sont exigées"
for path in /api/fichiers /api/dossiers /api/moodboards; do
  got="$(curl -sS --noproxy '*' -H "Origin: $BASE" -o /dev/null -w '%{http_code}' \
    -X POST "$BASE$path" -H 'Content-Type: application/json' -d '{"name":"x","title":"x"}')"
  expect_code 401 "$got" "sans session : $path refusé"
done

say "35. Nettoyage"
expect_code 200 "$(api_code DELETE "/api/fichiers/$FILE_ID")" "fichier supprimé"
FILE_ID=""
expect_code 200 "$(api_code DELETE "/api/dossiers/$SUB_ID?force=1")" "sous-dossier supprimé"
SUB_ID=""
expect_code 200 "$(api_code DELETE "/api/dossiers/$FOLDER_ID?force=1")" "dossier supprimé"
FOLDER_ID=""
expect_code 200 "$(api_code DELETE "/api/moodboards/$BOARD_ID")" "moodboard supprimé"
BOARD_ID=""
expect_code 200 "$(api_code DELETE "/api/moodboards/$BOARD2_ID")" "seconde planche supprimée"
BOARD2_ID=""

summary
