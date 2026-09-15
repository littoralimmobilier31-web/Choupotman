# Architecture

Comment l’application est construite, et pourquoi chaque choix a été fait. Les
décisions qui paraissent inhabituelles sont expliquées ici plutôt que laissées à
deviner.

---

## Vue d’ensemble

Une seule application Next.js sert quatre surfaces distinctes :

```
/                  site public          statique, mis en cache, référençable
/espace-admin      administration       session requise, permissions par écran
/client            espace client        session client, tout filtré par client_id
/api               interface programmable
```

Elles partagent la base de données, les composants d’interface et les règles
métier. Elles ne partagent **pas** leur authentification : une session
d’administration et une session client utilisent des cookies différents, des
tables différentes et des gardes différentes. Un client connecté n’est pas un
utilisateur faiblement autorisé — c’est un type d’accès sans rapport.

---

## Couches

```
app/            routes et pages (composants serveur par défaut)
components/     interface ; « use client » seulement là où c’est nécessaire
lib/
  api/          l’enveloppe partagée des routes admin
  auth/         mots de passe, sessions, CSRF, limitation de débit, permissions
  db/           connexion, migrations, dépôts, types
  ai/           client Anthropic, base de connaissances, assistant, repli
  automation/   moteur SI…ALORS et catalogue des règles
  mail/         client SMTP et modèles
  pdf/          devis, factures, contrats
  i18n/         dictionnaires, formatage, direction du texte
```

La règle est simple : **une route ne contient pas de SQL, un dépôt ne contient
pas de HTTP.** Une route valide, vérifie les droits, appelle un dépôt, journalise
et répond. Un dépôt connaît les tables et rien d’autre. Cette séparation est ce
qui rend le passage éventuel à PostgreSQL réaliste (voir
[DATABASE.md](DATABASE.md)).

---

## L’enveloppe des routes

`lib/api/handler.ts` porte cinq choses que chaque route mutante doit faire, et
dont l’oubli est une faille :

1. vérifier la permission ;
2. vérifier le jeton CSRF ;
3. appliquer la limitation de débit ;
4. valider le corps avec un schéma Zod ;
5. journaliser l’action.

```ts
export const POST = createHandler(
  { permission: 'invoices.create', schema: invoiceSchema },
  async ({ body, user, log }) => { … },
);
```

La fonction n’est appelée que sur une requête entièrement autorisée et validée.
Une nouvelle route est donc un schéma et un corps de fonction, et ne peut pas
sauter une étape par distraction.

Les routes multipart reçoivent le `FormData` déjà analysé : le corps d’une
requête ne se lit qu’une fois, et l’enveloppe le lit déjà pour y trouver le jeton
CSRF. Sans cela, une route d’envoi de fichier devrait sortir du chemin partagé —
exactement là où il ne faut pas.

---

## `patchOf` — pourquoi `.partial()` ne suffit pas

Zod conserve le `.default()` d’un champ à l’intérieur de l’enveloppe optionnelle.
Parser `{ status: 'sent' }` contre un schéma `.partial()` produit donc :

```ts
{ status: 'sent', items: [], tax_rate: 0, discount_type: 'none' }
```

Un dépôt qui applique fidèlement ce patch efface les lignes de la facture et
remet la TVA à zéro — à partir d’une requête qui ne voulait changer que le
statut. `patchOf` retire les valeurs par défaut avant de rendre les champs
optionnels, pour qu’une clé absente reste réellement absente.

Le pendant de cette règle : une route de mise à jour passe `body.champ`
directement au dépôt, sans `?? undefined`. Les dépôts distinguent les deux —
`undefined` ne touche pas à la colonne, `null` y écrit `NULL` — et convertir l’un
en l’autre rend impossible le fait de **vider** un champ une fois rempli. Les
deux moitiés sont testées ensemble, parce qu’elles tirent en sens opposé.

---

## Base de données

SQLite en mode WAL, une connexion par processus, mise en cache sur `globalThis`
pour survivre au rechargement de modules en développement. Les clés étrangères
sont activées ; la plupart des suppressions sont en cascade.

Le choix de SQLite est délibéré : l’application sert une personne et ses clients,
les écritures sont rares comparées aux lectures, et une base qui tient dans un
fichier se sauvegarde, se copie et s’inspecte sans infrastructure. Les requêtes
sont écrites à la main, sans ORM — elles restent lisibles, et le plan d’exécution
n’a pas d’intermédiaire.

Points à connaître :

- **L’argent** est stocké en `REAL` et arrondi au centime supérieur par
  `money()`. Les totaux calculés sont enregistrés : un document émis conserve les
  montants qu’il portait, même si un taux de TVA change ensuite.
- **La recherche** utilise FTS5 quand la compilation de SQLite l’inclut, et
  retombe sur `LIKE` sinon. Une table `search_index` dénormalisée alimente la
  palette de commandes (Ctrl+K).
- **Les migrations** sont des fichiers SQL numérotés, appliqués une fois et
  enregistrés. Il n’y a pas de retour arrière automatique : une migration qui a
  tourné en production se corrige par une migration suivante.

---

## Authentification

Trois mécanismes, chacun documenté dans [SECURITY.md](SECURITY.md) :

- **Mots de passe** — scrypt du module `crypto` de Node. Pas de dépendance dans
  le chemin d’authentification, pas d’étape de compilation native. Les paramètres
  sont inscrits dans le hachage, donc ils peuvent être augmentés plus tard sans
  invalider les hachages existants.
- **Sessions** — le cookie contient `sessionId.token.HMAC`. Seul un SHA-256 du
  jeton est enregistré : une fuite de la base ne donne pas de session utilisable.
- **CSRF** — double soumission, le jeton étant lié au secret de la session. Un
  jeton pré-session existe pour le formulaire de connexion, qui n’a pas encore de
  session à lier.

---

## Le moteur d’automatisation

Deux points d’entrée : `emit(événement, charge)` depuis le code métier, et
`runDaily()` depuis une tâche planifiée.

Les règles vivent dans le code, pas dans une table que l’on peut compléter :
chaque règle a un gestionnaire, et une ligne sans gestionnaire serait une
promesse que l’application ne peut pas tenir. La table stocke uniquement l’état
(activée ou non) et les réglages.

Le balayage quotidien est rejouable sans effet de bord : chaque notification
porte une empreinte dérivée du fait et du jour, donc un second passage le même
jour n’insère rien. C’est ce qui permet de le relancer à la main sans crainte —
et c’est vérifié par les tests.

---

## La couche IA

Trois surfaces, un seul principe : le modèle ne décide de rien d’irréversible.

- **Chatbot public** — répond à partir d’une base de connaissances construite
  uniquement depuis la base de données.
- **Assistant privé** — peut lire ; ses outils d’écriture terminent le tour sous
  forme de proposition à confirmer.
- **Analyse de projet** — résume des chiffres réels ; sans clé API, un moteur
  déterministe produit le même genre de résumé à partir des mêmes données.

Détails et garde-fous : [AI.md](AI.md).

---

## Rendu et cache

Les pages publiques sont régénérées à intervalle (`revalidate = 600`). Une
modification dans l’administration appelle `revalidatePublic(zone)`, qui invalide
les chemins concernés immédiatement — sans quoi une correction resterait
invisible dix minutes, ce qui ressemble à un bug et n’en est pas un.

Les écrans d’administration sont en `force-dynamic` : ils affichent l’état réel
et n’ont aucune raison d’être mis en cache.

---

## Internationalisation

Le français est la langue de référence. Les traductions vivent dans une table
`translations` et sont appliquées à la lecture par `localiseRows`. L’arabe
s’affiche de droite à gauche : `dirFor()` fixe la direction, et les classes
logiques de Tailwind (`ms-`, `me-`, `start-`, `end-`) font le reste sans écrire
de feuille de style miroir.

Ajouter une langue est une entrée dans la configuration et un dictionnaire, pas
une modification de composants.

---

## Ce qui n’a pas été fait, et pourquoi

- **Pas d’ORM.** Les requêtes sont assez simples pour être lues, et assez
  spécifiques pour qu’une abstraction coûte plus qu’elle ne rapporte.
- **Pas de bibliothèque de graphiques.** Les composants de `components/charts`
  produisent du SVG : quelques centaines de lignes contre plusieurs centaines de
  kilo-octets, et un contrôle exact de la palette et de l’accessibilité.
- **Pas de gestion d’état globale.** L’état vit dans l’URL quand il doit être
  partageable, dans le serveur sinon. Aucun magasin client à synchroniser.
- **Pas de restauration depuis l’interface.** Le processus garde la base ouverte
  et écraser le fichier sous une connexion active produit une base à moitié
  restaurée. La procédure est imprimée, à exécuter application arrêtée.
