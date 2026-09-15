# CHOUPOTMAN OS

**My Work. My Clients. My Projects. My Business.**

Le système de gestion d’activité de Boubaker Choupotman : un site public et une
plateforme privée dans une seule application. Le site présente le travail ; la
plateforme le gère — prospects, projets, devis, factures, paiements, contrats,
fichiers, contenus, automatisations.

Ce n’est pas un portfolio avec une page d’administration. C’est un outil de
travail quotidien qui publie aussi un site.

---

## Démarrer

```bash
cp .env.example .env.local     # puis remplir SESSION_SECRET et BOOTSTRAP_ADMIN_*
npm install
npm run setup                  # migrations + peuplement initial
npm run dev                    # http://localhost:3000
```

Le site public est sur `/`, l’administration sur `/espace-admin`, l’espace
client sur `/client`.

**À la première connexion, l’application exige un changement de mot de passe.**
Le mot de passe du fichier `.env` ne sert qu’une fois : il n’ouvre aucune autre
page tant qu’il n’a pas été remplacé.

---

## Ce que contient l’application

### Site public

| Page | Adresse | Contenu |
| --- | --- | --- |
| Accueil | `/` | Présentation, services, réalisations mises en avant, témoignages |
| À propos | `/a-propos` | Parcours, formations, certifications, compétences |
| Services | `/services` | Catalogue par famille, FAQ |
| Réalisations | `/projets` | Portfolio filtrable par technologie, catégorie, année |
| Études de cas | `/etudes-de-cas` | Le détail d’une mission : problème, démarche, résultat |
| Blog | `/blog` | Articles, filtrables par catégorie et mot-clé |
| Contact | `/contact` | Formulaire, coordonnées |
| Demande de projet | `/demande-de-projet` | Questionnaire en 9 étapes |

Trois langues : français (par défaut), arabe (droite à gauche), anglais. Le site
est une PWA, référençable, et compte ses visites lui-même sans service tiers.

### Administration — `/espace-admin`

34 écrans, groupés par usage :

- **Pilotage** — tableau de bord, statistiques, calendrier unifié, assistant IA
- **Commercial** — prospects (pipeline), clients, demandes reçues, briefs
- **Production** — projets, tâches (Kanban), révisions, feedback, fichiers, moodboards
- **Finances** — devis, factures, paiements, contrats, dépenses, abonnements
- **Contenu public** — portfolio, études de cas, blog, services, profil, témoignages
- **Communication** — messagerie et modèles, notifications
- **Système** — automatisations, paramètres, utilisateurs, rôles, journal, sauvegardes

### Espace client — `/client`

Chaque client voit ses projets, ses devis, ses factures, les fichiers qu’on lui
a partagés, et peut donner son avis sur une livraison. Rien d’autre : chaque
requête est filtrée par son identifiant client, et une ressource d’un autre
client répond « introuvable », exactement comme une ressource inexistante.

---

## Deux règles structurantes

Le reste du code en découle.

### 1. Le site n’invente jamais rien

Aucune information sur Boubaker n’est générée, déduite ou complétée. Le parcours,
les certifications, les chiffres, les témoignages viennent uniquement de ce qui a
été saisi dans l’administration.

Ce n’est pas une consigne donnée à un modèle, c’est une propriété du code :

- un champ laissé vide est enregistré `NULL`, et la section correspondante
  **disparaît** de la page publique au lieu d’afficher un texte de remplissage ;
- la base de connaissances du chatbot est construite exclusivement à partir des
  lignes de la base — il ne peut pas citer ce qui n’y est pas ;
- sans clé API, un moteur déterministe répond à partir de la même base, et
  renvoie vers le formulaire de contact quand il ne sait pas.

### 2. L’IA ne fait rien sans confirmation

L’assistant privé peut lire et proposer. Il ne peut pas agir.

Les outils de lecture s’exécutent immédiatement. Les outils d’écriture — créer
une facture, envoyer un message, supprimer quelque chose — **terminent le tour
sous forme de proposition**. Rien n’est exécuté tant que la personne n’a pas
confirmé, et l’exécution passe par une seule route (`/api/ia/confirmer`) qui
utilise la charge enregistrée au moment de la proposition, pas celle envoyée par
le navigateur. Une confirmation ne vaut qu’une fois.

---

## Commandes

```bash
npm run dev          # développement
npm run build        # compilation de production
npm start            # serveur de production

npm run typecheck    # TypeScript, sans émettre
npm run lint         # ESLint
npm test             # 11 suites end-to-end (serveur de production requis)
npm run verify       # typecheck + tests

npm run db:migrate   # applique les migrations
npm run db:seed      # crée le compte initial et les données de démonstration
npm run db:reset     # remet la base à zéro (voir --help)
npm run backup       # sauvegarde la base ; à appeler depuis une tâche planifiée
npm run daily        # balayage des automatisations ; idem
```

Les tests sont des scripts shell qui parlent à un vrai serveur : ils vérifient le
comportement observable, pas des fonctions isolées. Voir
[docs/TESTING.md](docs/TESTING.md).

---

## Documentation

| Document | Sujet |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Comment l’application est construite, et pourquoi |
| [INSTALLATION.md](docs/INSTALLATION.md) | Installation pas à pas, en développement et sur un serveur |
| [CONFIGURATION.md](docs/CONFIGURATION.md) | Chaque variable d’environnement et son effet |
| [DATABASE.md](docs/DATABASE.md) | Schéma, migrations, et le passage éventuel à PostgreSQL |
| [API.md](docs/API.md) | Toutes les routes, leurs permissions et leurs codes de réponse |
| [SECURITY.md](docs/SECURITY.md) | Authentification, sessions, CSRF, uploads, limitation de débit |
| [AI.md](docs/AI.md) | Le chatbot, l’assistant, le garde-fou de confirmation |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Mise en ligne sur choupotman.com, sauvegardes, supervision |
| [TESTING.md](docs/TESTING.md) | Ce que les suites vérifient et comment les lancer |

---

## Pile technique

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 ·
SQLite (better-sqlite3, mode WAL) · Zod · pdf-lib · SDK Anthropic.

Aucune dépendance dans le chemin d’authentification : le hachage utilise scrypt
du module `crypto` de Node. Le client SMTP est écrit à la main et tient en un
fichier. Les graphiques sont des SVG produits par l’application, sans
bibliothèque de visualisation.

---

## État

11 suites de tests · 435 assertions · toutes au vert.
`npm run typecheck` et `npm run lint` ne remontent rien.
