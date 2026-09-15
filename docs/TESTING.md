# Tests

11 suites, 435 assertions. Ce sont des scripts shell qui parlent à un vrai
serveur : ils vérifient le comportement observable, pas des fonctions isolées.

---

## Lancer

```bash
npm run build
npm start &
npm test
```

Une partie seulement :

```bash
./scripts/test/run.sh cms files
```

Une suite isolée :

```bash
./scripts/test/cms-flow.sh
```

Résultat attendu :

```
11 suites · 435 assertions réussies · 0 échouées · 27s
Toutes les suites passent.
```

---

## Pourquoi des scripts shell

Chaque assertion traverse toute la pile : HTTP, middleware, garde de permission,
vérification CSRF, limitation de débit, validation, dépôt, SQLite, et retour. Un
test unitaire sur un dépôt n’aurait rien dit sur les bugs que ces suites ont
réellement trouvés — `.partial()` de Zod qui applique des valeurs par défaut,
`?? undefined` qui empêche de vider un champ, un nom de fichier de sauvegarde
malformé, un mot de passe généré qui échoue à la politique une fois sur trois.

Ces bugs vivent tous **entre** les couches. C’est là qu’il faut regarder.

---

## Les suites

| Suite | Assertions | Ce qu’elle établit |
| --- | --- | --- |
| `projects-flow` | 25 | Création d’un projet, étapes, tâches, Kanban, quota de révisions |
| `crm-flow` | 29 | Prospects, conversion, clients, accès au portail |
| `finance-flow` | 30 | Devis → facture, paiements partiels, verrouillage à l’émission |
| `content-flow` | 20 | Paramètres, profil, services — et qu’un champ vide n’invente rien |
| `cms-flow` | 51 | Portfolio, études de cas, blog, témoignages, FAQ |
| `files-flow` | 59 | Envois de fichiers, dossiers, moodboards, jetons de capture |
| `comms-flow` | 42 | Calendrier unifié, messagerie, notifications |
| `accounting-flow` | 53 | Contrats, dépenses, abonnements, statistiques |
| `system-flow` | 68 | Utilisateurs, rôles, automatisations, journal, sauvegardes |
| `ai-flow` | 29 | Base de connaissances, garde-fou de confirmation |
| `portal-flow` | 29 | Espace client et isolation entre clients |

`auth-flow` (19 assertions) n’est pas dans la liste par défaut : il change le mot
de passe administrateur et exige une base fraîchement peuplée. Lancez-le seul,
contre une base réinitialisée.

---

## Ce que les tests cherchent

Surtout des **refus**. Un chemin nominal qui fonctionne est rassurant ; une
garantie qui tient sous pression est utile.

### Isolation

Deux clients sont créés, puis le premier tente d’atteindre le projet, la facture,
les fichiers et le feedback du second. Chaque tentative répond `404` — la même
réponse que pour une ressource inexistante, donc rien ne se laisse énumérer.

### Intégrité comptable

Une facture émise verrouille ses montants (`409`). Un sur-paiement est refusé. Un
paiement sur brouillon est refusé. Un devis déjà facturé renvoie la facture
existante au lieu d’en créer une seconde. Une facture s’annule, ne se supprime
pas.

### Documents figés

Un contrat est créé depuis un modèle, puis le modèle est réécrit entièrement. Le
contrat conserve son texte : la substitution a lieu une fois, à la rédaction.
Après signature, toute modification du texte ou du montant répond `409`.

### Envois de fichiers

Un script shell renommé en `.png`, avec un type MIME déclaré `image/png`, est
refusé : seule la vérification des octets de signature attrape ce cas. Une
extension hors liste est refusée. Un lot partiellement invalide conserve les
fichiers valides et nomme les refus.

### Jetons de capture

Un jeton valide ajoute un élément. **Le même jeton ne peut pas lire la planche**
à laquelle il écrit. Une révocation coupe l’accès immédiatement. Un jeton inventé
et un jeton révoqué répondent tous deux `401`.

### Le garde-fou de l’IA

Une proposition est insérée directement en base. Le test vérifie que rien n’a été
créé avant confirmation, que l’action s’exécute après, et qu’une seconde
confirmation est refusée.

### Ne jamais inventer

Le chatbot est interrogé sur des diplômes inexistants : il décline. Sur le chiffre
d’affaires d’un client : il ne produit aucun montant. Une page dont le champ est
vide ne contient aucun texte de remplissage.

### Verrouillage administratif

Le dernier Super Admin actif ne peut être ni rétrogradé, ni désactivé, ni
supprimé — trois `409` distincts. Les permissions d’un rôle fourni ne sont pas
modifiables. Un rôle encore attribué ne se supprime pas.

### Sauvegardes

Une sauvegarde est créée, téléchargée, **ouverte avec SQLite** et comptée : 75
tables. Trois noms de fichier malveillants sont refusés, dont une traversée de
chemin.

---

## Les suites doivent être rejouables

Un test qui ne passe que la première fois n’est pas un test.

Deux suites nettoient donc les résidus d’une exécution interrompue avant de
commencer — un compte, un rôle ou une tâche laissés derrière feraient échouer la
suivante sur « existe déjà », et ce serait interprété comme une régression.

`scripts/test/run.sh` vide aussi les compteurs de limitation de débit entre les
suites. La politique `api` — 300 requêtes par cinq minutes — est correcte pour un
usage réel et se trouve épuisée aux deux tiers d’une exécution complète ; passé ce
point, chaque assertion échoue en `429` et l’exécution mesure le limiteur au lieu
de l’application. Une suite seule reste très en dessous du plafond.

---

## Les helpers

`scripts/test/lib.sh` :

| Fonction | Rôle |
| --- | --- |
| `admin_login` | Connexion, ou réutilisation de la session en cache |
| `api METHOD chemin corps` | Requête JSON avec le jeton CSRF |
| `api_code` | Idem, renvoie le code HTTP |
| `req`, `code` | Requêtes brutes avec les cookies |
| `json`, `jstr` | Extraction d’un nombre ou d’une chaîne d’une réponse |
| `expect_code`, `expect_contains` | Assertions |
| `reset_auth_limits`, `reset_api_limits` | Vident les compteurs |
| `summary` | Total, et code de sortie |

La session est mise en cache dans `data/tmp/test-session.jar` : la connexion est
limitée en débit — et c’est voulu — donc onze suites qui se connecteraient chacune
se bloqueraient elles-mêmes.

---

## Ajouter une suite

```bash
#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."
source scripts/test/lib.sh

admin_login

ID=""
cleanup_all() { [[ -n "$ID" ]] && api DELETE "/api/ressource/$ID?force=1" >/dev/null 2>&1; return 0; }
trap cleanup_all EXIT

say "1. Ce que ce groupe établit"
RESP="$(api POST /api/ressource '{"name":"TEST — quelque chose"}')"
ID="$(json "$RESP" id)"
if [[ -n "$ID" ]]; then ok "créé (#$ID)"; else bad "refusé: ${RESP:0:200}"; fi

summary
```

Trois conventions :

- préfixer les données de test par `TEST — `, pour les repérer et les nettoyer ;
- nettoyer dans un `trap EXIT`, pour que même un échec ne laisse rien ;
- ajouter la suite au tableau `ALL` de `scripts/test/run.sh`.

---

## En intégration continue

```yaml
- run: npm ci
- run: npm run typecheck
- run: npm run lint
- run: npm run build
- run: npm run setup
- run: npm start &
- run: sleep 5 && npm test
```

`npm run verify` enchaîne le typecheck et les tests, en supposant un serveur déjà
lancé.
