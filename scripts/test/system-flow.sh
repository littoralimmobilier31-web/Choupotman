#!/usr/bin/env bash
#
# End-to-end check of the system modules: users, roles, automations, activity
# journal, backups, and the signed-in person's own account.
#
#   npm run build && npm run start &
#   ./scripts/test/system-flow.sh
#
# The point of this suite is that these modules can lock you out or lose your
# data if they are wrong, so it tests the refusals as much as the actions:
#
#   - the last active Super Admin cannot be demoted, deactivated or deleted;
#   - a built-in role's permissions cannot be edited;
#   - a temporary password is shown once and never readable afterwards;
#   - a backup file is a full copy of the database, so it needs its own
#     permission, and its name cannot be used to reach outside the directory.
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login
printf '\033[2mSession admin établie (%s)\033[0m\n' "$ADMIN_LOGIN"

USER_ID=""; ROLE_ID=""; BACKUP_NAME=""
cleanup_all() {
  [[ -n "$USER_ID" ]] && api DELETE "/api/utilisateurs/$USER_ID?force=1" >/dev/null 2>&1
  [[ -n "$ROLE_ID" ]] && api DELETE "/api/roles/$ROLE_ID"                >/dev/null 2>&1
  [[ -n "$BACKUP_NAME" ]] && api DELETE "/api/sauvegardes?fichier=$BACKUP_NAME" >/dev/null 2>&1
  return 0
}
trap cleanup_all EXIT

# A previous run that failed part-way leaves its account and role behind, and
# every subsequent run would then fail on "already exists". Clearing them first
# makes the suite repeatable, which is the only way a failure means something.
preflight() {
  local users roles stale
  users="$(req "$BASE/api/utilisateurs")"
  stale="$(tr '{' '\n' <<<"$users" | grep '"username":"test_controle"' | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)"
  [[ -n "$stale" ]] && api DELETE "/api/utilisateurs/$stale?force=1" >/dev/null 2>&1

  roles="$(req "$BASE/api/roles")"
  stale="$(tr '{' '\n' <<<"$roles" | grep '"name":"TEST — Assistant"' | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)"
  [[ -n "$stale" ]] && api DELETE "/api/roles/$stale" >/dev/null 2>&1
  return 0
}
preflight

# ── Rôles ────────────────────────────────────────────────────────────────

say "1. Les rôles fournis existent"
RESP="$(req "$BASE/api/roles")"
for role in super_admin manager finance editor viewer; do
  expect_contains "$RESP" "\"slug\":\"$role\"" "rôle $role présent"
done

say "2. Les permissions d'un rôle fourni ne sont pas modifiables"
SUPER_ID="$(sed -n 's/.*"id":\([0-9]*\),"slug":"super_admin".*/\1/p' <<<"$RESP" | head -1)"
if [[ -z "$SUPER_ID" ]]; then
  SUPER_ID="$(tr '{' '\n' <<<"$RESP" | grep '"slug":"super_admin"' | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)"
fi
expect_code 409 "$(api_code PATCH "/api/roles/$SUPER_ID" '{"permissions":["dashboard.view"]}')" "édition des permissions refusée"

say "3. Un rôle fourni ne peut pas être supprimé"
expect_code 409 "$(api_code DELETE "/api/roles/$SUPER_ID")" "suppression refusée"

say "4. Créer un rôle sur mesure"
RESP="$(api POST /api/roles '{"name":"TEST — Assistant","description":"Rôle de contrôle.","permissions":["dashboard.view","clients.view","projects.view"]}')"
ROLE_ID="$(json "$RESP" id)"
if [[ -n "$ROLE_ID" ]]; then ok "rôle créé (#$ROLE_ID)"; else bad "création refusée: ${RESP:0:250}"; fi
expect_contains "$RESP" 'clients.view' "les permissions demandées sont accordées"

say "5. Une permission inventée est ignorée, pas acceptée"
RESP="$(api PATCH "/api/roles/$ROLE_ID" '{"permissions":["dashboard.view","licornes.voler"]}')"
if grep -q 'licornes' <<<"$RESP"; then bad "la permission inventée a été enregistrée"; else ok "permission hors catalogue ignorée"; fi
expect_contains "$RESP" 'dashboard.view' "les permissions valides sont conservées"

# ── Utilisateurs ─────────────────────────────────────────────────────────

say "6. Créer un compte avec mot de passe généré"
RESP="$(api POST /api/utilisateurs "{\"username\":\"test_controle\",\"email\":\"test_controle@test.invalid\",\"full_name\":\"Compte de contrôle\",\"role_id\":$ROLE_ID}")"
USER_ID="$(json "$RESP" id)"
TEMP_PASSWORD="$(jstr "$RESP" temporaryPassword)"
if [[ -n "$USER_ID" ]]; then ok "compte créé (#$USER_ID)"; else bad "création refusée: ${RESP:0:250}"; fi
if [[ ${#TEMP_PASSWORD} -ge 12 ]]; then ok "mot de passe provisoire retourné une fois"; else bad "aucun mot de passe retourné"; fi
expect_contains "$RESP" '"mustChangePassword":true' "changement obligatoire à la première connexion"

say "7. Le mot de passe n'est jamais relisible"
RESP="$(req "$BASE/api/utilisateurs/$USER_ID")"
if grep -q "$TEMP_PASSWORD" <<<"$RESP"; then bad "le mot de passe est relisible"; else ok "mot de passe non relisible"; fi
if grep -q 'password_hash' <<<"$RESP"; then bad "l'empreinte du mot de passe est exposée"; else ok "l’empreinte n’est pas exposée"; fi
RESP="$(req "$BASE/api/utilisateurs")"
if grep -q 'password_hash' <<<"$RESP"; then bad "l'empreinte apparaît dans la liste"; else ok "liste sans empreinte"; fi

say "8. Le nouveau compte doit changer son mot de passe"
JAR2="$(mktemp)"
NONCE="$(curl -sS --noproxy '*' -c "$JAR2" -H "Origin: $BASE" "$BASE/api/auth/csrf" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
RESP="$(curl -sS --noproxy '*' -b "$JAR2" -c "$JAR2" -H "Origin: $BASE" -X POST "$BASE/api/auth/connexion" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"test_controle\",\"password\":\"$TEMP_PASSWORD\",\"csrf\":\"$NONCE\"}")"
expect_contains "$RESP" '"ok":true' "connexion avec le mot de passe provisoire"
expect_contains "$RESP" 'mustChangePassword\|must_change_password\|changer' "changement de mot de passe signalé"
rm -f "$JAR2"

say "9. Un identifiant ou un email en doublon est refusé"
expect_code 400 "$(api_code POST /api/utilisateurs "{\"username\":\"test_controle\",\"email\":\"autre@test.invalid\",\"role_id\":$ROLE_ID}")" "identifiant en doublon rejeté"
expect_code 400 "$(api_code POST /api/utilisateurs "{\"username\":\"test_autre\",\"email\":\"test_controle@test.invalid\",\"role_id\":$ROLE_ID}")" "email en doublon rejeté"

say "10. Un mot de passe faible est refusé"
expect_code 400 "$(api_code POST /api/utilisateurs "{\"username\":\"test_faible\",\"email\":\"faible@test.invalid\",\"role_id\":$ROLE_ID,\"password\":\"motdepasse\"}")" "mot de passe trop faible rejeté"

say "11. Réinitialiser émet un nouveau mot de passe et ferme les sessions"
RESP="$(api PATCH "/api/utilisateurs/$USER_ID" '{"reset_password":true}')"
NEW_PASSWORD="$(jstr "$RESP" temporaryPassword)"
if [[ ${#NEW_PASSWORD} -ge 12 && "$NEW_PASSWORD" != "$TEMP_PASSWORD" ]]; then
  ok "nouveau mot de passe émis"
else
  bad "mot de passe inchangé ou absent"
fi
expect_contains "$RESP" '"sessionsRevoked":true' "sessions fermées"

say "12. L'ancien mot de passe ne fonctionne plus"
JAR3="$(mktemp)"
NONCE="$(curl -sS --noproxy '*' -c "$JAR3" -H "Origin: $BASE" "$BASE/api/auth/csrf" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
CODE="$(curl -sS --noproxy '*' -b "$JAR3" -c "$JAR3" -H "Origin: $BASE" -o /dev/null -w '%{http_code}' \
  -X POST "$BASE/api/auth/connexion" -H 'Content-Type: application/json' \
  -d "{\"login\":\"test_controle\",\"password\":\"$TEMP_PASSWORD\",\"csrf\":\"$NONCE\"}")"
if [[ "$CODE" != "200" ]]; then ok "ancien mot de passe refusé ($CODE)"; else bad "l'ancien mot de passe fonctionne encore"; fi
rm -f "$JAR3"

say "13. Le dernier Super Admin est protégé"
RESP="$(req "$BASE/api/utilisateurs")"
ADMIN_UID="$(tr '{' '\n' <<<"$RESP" | grep '"role_slug":"super_admin"' | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)"
if [[ -n "$ADMIN_UID" ]]; then
  expect_code 409 "$(api_code PATCH "/api/utilisateurs/$ADMIN_UID" "{\"role_id\":$ROLE_ID}")" "rétrogradation refusée"
  expect_code 409 "$(api_code PATCH "/api/utilisateurs/$ADMIN_UID" '{"is_active":false}')" "désactivation refusée"
  expect_code 409 "$(api_code DELETE "/api/utilisateurs/$ADMIN_UID")" "suppression refusée"
else
  bad "aucun Super Admin trouvé dans la liste"
fi

say "14. Un rôle encore attribué n'est pas supprimable"
expect_code 409 "$(api_code DELETE "/api/roles/$ROLE_ID")" "rôle attribué : 409"

say "15. Désactiver conserve le compte"
RESP="$(api DELETE "/api/utilisateurs/$USER_ID")"
expect_contains "$RESP" '"archived":true' "désactivé plutôt que supprimé"
expect_contains "$(req "$BASE/api/utilisateurs/$USER_ID")" '"is_active":0' "compte toujours présent, inactif"

# ── Mon compte ───────────────────────────────────────────────────────────

say "16. Consulter son propre compte"
RESP="$(req "$BASE/api/mon-compte")"
expect_contains "$RESP" "\"username\":\"$ADMIN_LOGIN\"" "compte courant retourné"
expect_contains "$RESP" '"current":true' "la session actuelle est identifiée"
if grep -q 'token_hash' <<<"$RESP"; then bad "l'empreinte de session est exposée"; else ok "aucune empreinte de session exposée"; fi

say "17. Modifier son profil"
api PATCH /api/mon-compte '{"full_name":"Boubaker Choupotman"}' >/dev/null
expect_contains "$(req "$BASE/api/mon-compte")" 'Boubaker Choupotman' "nom enregistré"

say "18. On ne peut pas se donner un rôle"
# Le champ n'existe pas dans ce schéma : la valeur doit être ignorée, pas appliquée.
api PATCH /api/mon-compte "{\"role_id\":$ROLE_ID}" >/dev/null 2>&1
RESP="$(req "$BASE/api/utilisateurs/$ADMIN_UID")"
if grep -q "\"role_id\":$ROLE_ID" <<<"$RESP"; then
  bad "le rôle a été modifié depuis la page personnelle"
else
  ok "le rôle n’est pas modifiable depuis son propre compte"
fi

# ── Automatisations ──────────────────────────────────────────────────────

say "19. Les règles sont listées avec leur condition et leurs effets"
RESP="$(req "$BASE/api/automatisations")"
expect_contains "$RESP" '"condition"' "condition exposée"
expect_contains "$RESP" '"effects"' "effets exposés"
expect_contains "$RESP" 'project_scaffold' "la règle de structuration est présente"

say "20. Activer et désactiver une règle"
api POST /api/automatisations '{"key":"project_scaffold","enabled":false}' >/dev/null
RESP="$(req "$BASE/api/automatisations")"
if tr '{' '\n' <<<"$RESP" | grep '"key":"project_scaffold"' | grep -q '"is_enabled":0'; then
  ok "règle désactivée"
else
  bad "la règle est toujours active"
fi
api POST /api/automatisations '{"key":"project_scaffold","enabled":true}' >/dev/null
RESP="$(req "$BASE/api/automatisations")"
if tr '{' '\n' <<<"$RESP" | grep '"key":"project_scaffold"' | grep -q '"is_enabled":1'; then
  ok "règle réactivée"
else
  bad "la règle n'a pas été réactivée"
fi

say "21. Une règle inconnue est refusée"
expect_code 400 "$(api_code POST /api/automatisations '{"key":"regle_inventee","enabled":true}')" "clé inconnue rejetée"

say "22. Le balayage quotidien est rejouable sans effet de bord"
RESP="$(api POST /api/automatisations '{"action":"run_daily","force":true}')"
expect_contains "$RESP" '"report"' "rapport retourné"
BEFORE="$(req "$BASE/api/notifications?limite=200" | grep -o '"id":' | wc -l)"
api POST /api/automatisations '{"action":"run_daily","force":true}' >/dev/null
AFTER="$(req "$BASE/api/notifications?limite=200" | grep -o '"id":' | wc -l)"
if [[ "$BEFORE" == "$AFTER" ]]; then
  ok "aucun doublon de notification ($BEFORE inchangé)"
else
  bad "le second passage a créé des notifications ($BEFORE → $AFTER)"
fi

# ── Journal ──────────────────────────────────────────────────────────────

say "23. Le journal enregistre ce qui précède"
PAGE="$(req "$BASE/espace-admin/journal")"
expect_contains "$PAGE" 'Journal d’activité' "la page se rend"
expect_contains "$PAGE" 'test_controle\|Compte créé\|Rôle créé' "les actions de ce test sont tracées"

say "24. Le journal n'expose aucune route d'écriture"
for method in POST PATCH DELETE; do
  got="$(api_code "$method" /api/journal '{}')"
  if [[ "$got" == "404" || "$got" == "405" ]]; then
    ok "$method /api/journal indisponible ($got)"
  else
    bad "$method /api/journal répond $got — le journal doit être en lecture seule"
  fi
done

# ── Sauvegardes ──────────────────────────────────────────────────────────

say "25. Créer une sauvegarde"
RESP="$(api POST /api/sauvegardes)"
BACKUP_NAME="$(jstr "$RESP" name)"
if [[ -n "$BACKUP_NAME" ]]; then ok "sauvegarde créée ($BACKUP_NAME)"; else bad "création refusée: ${RESP:0:250}"; fi
expect_contains "$RESP" '"checksum"' "empreinte calculée"

say "26. La sauvegarde est un vrai fichier SQLite"
HEADERS="$(req -D - -o /dev/null "$BASE/api/sauvegardes/telecharger?fichier=$BACKUP_NAME")"
expect_contains "$HEADERS" 'sqlite' "type de contenu SQLite"
expect_contains "$HEADERS" 'attachment' "servi en pièce jointe"
expect_contains "$HEADERS" 'no-store' "jamais mis en cache"
TMPDB="$(mktemp).db"
req -o "$TMPDB" "$BASE/api/sauvegardes/telecharger?fichier=$BACKUP_NAME" >/dev/null
COUNT="$(npx tsx -e "
import Database from 'better-sqlite3';
const db = new Database('$TMPDB', { readonly: true });
const row = db.prepare(\"SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'\").get();
console.log(row.c);
" 2>/dev/null | tail -1)"
if [[ -n "$COUNT" && "$COUNT" -gt 30 ]]; then
  ok "la sauvegarde s’ouvre et contient $COUNT tables"
else
  bad "la sauvegarde n’est pas exploitable (tables: '${COUNT:-?}')"
fi
rm -f "$TMPDB"

say "27. Un nom de fichier hors périmètre est refusé"
for evil in '../../../etc/passwd' 'choupotman-00000000-000000.db/../../secret' 'quelconque.db'; do
  got="$(code "$BASE/api/sauvegardes/telecharger?fichier=$(printf '%s' "$evil" | sed 's:/:%2F:g')")"
  expect_code 404 "$got" "nom refusé : $evil"
done

say "28. Le téléchargement exige la permission d'export"
expect_code 401 "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' "$BASE/api/sauvegardes/telecharger?fichier=$BACKUP_NAME")" "sans session : refusé"

say "29. La page annonce ce que la sauvegarde ne contient pas"
PAGE="$(req "$BASE/espace-admin/sauvegardes")"
expect_contains "$PAGE" 'fichiers envoyés ne sont pas inclus' "l’exclusion des fichiers est annoncée"
expect_contains "$PAGE" 'Restaurer' "la procédure de restauration est indiquée"

# ── Permissions ──────────────────────────────────────────────────────────

say "30. Les permissions sont exigées"
for path in /api/utilisateurs /api/roles /api/automatisations /api/sauvegardes; do
  got="$(curl -sS --noproxy '*' -H "Origin: $BASE" -o /dev/null -w '%{http_code}' \
    -X POST "$BASE$path" -H 'Content-Type: application/json' -d '{"name":"x","username":"x","email":"x@y.zz","role_id":1,"key":"x","enabled":true}')"
  expect_code 401 "$got" "sans session : $path refusé"
done

say "31. Nettoyage"
expect_code 200 "$(api_code DELETE "/api/utilisateurs/$USER_ID?force=1")" "compte supprimé"
USER_ID=""
expect_code 200 "$(api_code DELETE "/api/roles/$ROLE_ID")" "rôle supprimé"
ROLE_ID=""
expect_code 200 "$(api_code DELETE "/api/sauvegardes?fichier=$BACKUP_NAME")" "sauvegarde supprimée"
BACKUP_NAME=""

summary
