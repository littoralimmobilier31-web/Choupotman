# Base de données

SQLite, mode WAL, une connexion par processus. 68 tables métier (plus les tables
internes de FTS5 et la table des migrations).

---

## Pourquoi SQLite

L’application sert une personne et ses clients. Les lectures dominent largement
les écritures, et les écritures sont courtes. Dans ce régime, SQLite est plus
rapide qu’un serveur de base de données sur le réseau, parce qu’il n’y a pas de
réseau.

Le reste suit : une base qui tient dans un fichier se sauvegarde en une commande,
se copie sur un portable pour investiguer, et n’ajoute ni service à superviser ni
identifiants à gérer. Le mode WAL permet aux lectures de continuer pendant une
écriture, ce qui suffit à cet usage.

La limite est réelle et il vaut mieux la connaître : une seule écriture à la fois,
et un seul serveur. Voir « Passer à PostgreSQL » plus bas.

---

## Migrations

Des fichiers SQL numérotés dans `src/lib/db/migrations/`, appliqués dans l’ordre
et enregistrés dans `_migrations`.

| Fichier | Contenu |
| --- | --- |
| `001_core.sql` | Utilisateurs, rôles, permissions, sessions, paramètres, journal, limitation de débit |
| `002_business.sql` | Clients, prospects, projets, étapes, tâches, fichiers, dossiers |
| `003_finance.sql` | Devis, factures, paiements, contrats, dépenses, abonnements |
| `004_content_ops.sql` | Portfolio, études de cas, blog, services, moodboards, briefs, messages, automatisations |
| `005_search.sql` | Index de recherche et table FTS5 |

```bash
npm run db:migrate
```

Une migration déjà appliquée n’est jamais rejouée. **Il n’y a pas de retour
arrière automatique**, volontairement : un `down` écrit à l’avance et jamais
testé donne une fausse confiance. Une migration passée en production se corrige
par une migration suivante.

---

## Principes du schéma

### L’argent

Colonnes `REAL`, arrondies au centime par `money()` (arrondi supérieur à la
moitié). Les totaux calculés sont **enregistrés**, pas recalculés à la lecture :
un devis émis en mars doit continuer à afficher les montants de mars, même si le
taux de TVA change en avril.

L’ordre de calcul est fixé dans `computeTotals` et vaut partout :

1. remise par ligne ;
2. remise sur le document ;
3. TVA sur la base après remises.

### Le temps

Tout est en UTC, au format ISO 8601. Les dates seules (`due_date`,
`delivery_date`) sont des chaînes `YYYY-MM-DD` — un rendez-vous fixé au 3 mars
est le 3 mars, indépendamment du fuseau de celui qui le regarde.

### Les booléens

`INTEGER` valant 0 ou 1, typés `Bool` en TypeScript. Les comparaisons dans le
code sont explicites (`=== 1`) plutôt que véridiques, pour qu’une colonne
manquante ne passe pas pour un `false`.

### Les données de démonstration

Les tables peuplées par le seed portent `is_demo`. L’interface affiche une
étiquette « DÉMO » sur ces lignes, et `npm run db:reset -- --demo` les retire
toutes. Une donnée d’exemple ne doit jamais pouvoir être prise pour une vraie.

### Les suppressions

La plupart des clés étrangères sont en `ON DELETE CASCADE` : supprimer un client
retire ses projets, ses documents et ses fichiers. Deux exceptions délibérées :

- `files.folder_id` est en `SET NULL` — supprimer un dossier ne détruit pas les
  fichiers, ils remontent à la racine. L’API prévient et exige `?force=1` ;
- `users` référencé par `created_by` est en `SET NULL` — supprimer un compte ne
  doit pas effacer les documents qu’il a créés.

---

## Recherche

Deux niveaux :

- **`search_index`** — une table dénormalisée (type, identifiant, titre,
  sous-titre, corps, URL) alimentée à chaque écriture par les dépôts. C’est ce
  qui alimente la palette de commandes.
- **FTS5** — quand la compilation de SQLite l’inclut, une table virtuelle indexe
  le même contenu et permet la recherche par pertinence. `hasFts()` le détecte au
  démarrage, et le code retombe sur `LIKE` sinon.

Cette double voie évite de dépendre d’une option de compilation qui n’est pas
garantie sur tous les hébergements.

---

## Sauvegarder

```bash
npm run backup                 # conserve les 14 plus récentes
npm run backup -- --keep 30
```

La sauvegarde utilise **l’API de sauvegarde en ligne de SQLite**, pas une copie
de fichier. En mode WAL, une copie prise pendant une écriture peut s’ouvrir sans
erreur et être privée des dernières transactions — la pire sorte de sauvegarde,
celle qui paraît correcte jusqu’au jour où l’on en a besoin.

**Les fichiers envoyés ne sont pas inclus.** Ils vivent dans `data/uploads`,
pèsent bien plus que la base, et doivent être sauvegardés au niveau du serveur.
L’écran des sauvegardes le dit en avertissement plutôt que de laisser le
découvrir au mauvais moment.

Restaurer se fait application arrêtée ; la procédure exacte est affichée dans
`/espace-admin/sauvegardes` et rappelée dans [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Inspecter

```bash
sqlite3 data/choupotman.db

.tables
.schema invoices
SELECT number, total, balance_due FROM invoices WHERE status != 'paid';
```

En lecture seule, pendant que l’application tourne :

```bash
sqlite3 'file:data/choupotman.db?mode=ro' 'SELECT COUNT(*) FROM projects;'
```

---

## Passer à PostgreSQL

Si l’activité impose plusieurs serveurs ou des écritures concurrentes soutenues,
la migration est faisable sans réécrire l’application — c’est la raison pour
laquelle aucune route ne contient de SQL.

Ce qu’il y aurait à faire :

1. **`src/lib/db/client.ts`** — remplacer le pilote. Les dépôts appellent quatre
   fonctions : `all`, `one`, `run`, `scalar`, plus `transaction`.
2. **Les migrations** — traduire le SQL. Les différences à traiter :
   `INTEGER PRIMARY KEY` devient `SERIAL`/`IDENTITY`, `datetime('now')` devient
   `now()`, `julianday()` devient de l’arithmétique sur `timestamp`.
3. **L’argent** — passer de `REAL` à `NUMERIC(14,2)`, ce qui est un gain :
   `money()` existe parce que `REAL` ne représente pas exactement les centimes.
4. **La recherche** — remplacer FTS5 par `tsvector`. Le repli `LIKE` reste
   valable pendant la transition.
5. **Les dépôts** — passer les requêtes en paramètres numérotés (`$1`) au lieu de
   `?`, et adapter la poignée de requêtes utilisant des fonctions propres à
   SQLite.

L’interface, les routes, les permissions, les validations et les tests ne
changent pas. Les suites end-to-end servent alors exactement à ce pour quoi elles
ont été écrites : vérifier que le comportement observable est identique après un
changement d’infrastructure.
