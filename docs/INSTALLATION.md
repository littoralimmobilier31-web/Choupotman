# Installation

## Prérequis

- **Node.js 20 ou plus récent** (`node --version`)
- npm 10 ou plus récent
- Un compilateur C, requis par `better-sqlite3` :
  - Debian/Ubuntu : `sudo apt install build-essential python3`
  - macOS : `xcode-select --install`
  - Windows : utilisez WSL2 ; la compilation native y est nettement plus simple

Aucune base de données à installer : SQLite est un fichier.

---

## En développement

```bash
git clone <dépôt> choupotman
cd choupotman
npm install
```

### 1. Les variables d’environnement

```bash
cp .env.example .env.local
```

Deux valeurs sont à remplir avant tout :

```bash
# Un secret de 64 caractères hexadécimaux. Générez-le, ne l'inventez pas :
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```dotenv
SESSION_SECRET=<la valeur générée ci-dessus>
BOOTSTRAP_ADMIN_PASSWORD=<un mot de passe temporaire, utilisé une seule fois>
```

`BOOTSTRAP_ADMIN_PASSWORD` ne sert qu’à la création du premier compte. Le compte
est marqué « doit changer son mot de passe » : ce mot de passe n’ouvre aucune
page de l’administration tant qu’il n’a pas été remplacé.

Le détail de chaque variable : [CONFIGURATION.md](CONFIGURATION.md).

### 2. La base

```bash
npm run setup     # = db:migrate puis db:seed
```

`db:seed` crée le compte Super Admin, le catalogue de permissions, les cinq rôles
fournis, les paramètres du site et un jeu de données de démonstration. **Toutes
les lignes de démonstration portent un marqueur `is_demo`** et s’affichent avec
une étiquette « DÉMO » dans l’administration : elles ne peuvent pas être prises
pour de vraies données, et se suppriment d’un coup.

```bash
npm run db:reset -- --demo     # retire uniquement les données de démonstration
npm run db:reset -- --all      # remet tout à zéro, y compris le compte admin
```

### 3. Lancer

```bash
npm run dev
```

- Site public : http://localhost:3000
- Administration : http://localhost:3000/espace-admin
- Espace client : http://localhost:3000/client

Connectez-vous avec `BOOTSTRAP_ADMIN_USERNAME` et le mot de passe temporaire.
L’application vous demandera immédiatement d’en choisir un autre.

---

## Vérifier l’installation

```bash
npm run typecheck     # TypeScript
npm run lint          # ESLint
```

Pour les tests, un serveur de production doit tourner — ils parlent à une vraie
application, pas à des fonctions isolées :

```bash
npm run build
npm start &
npm test
```

Résultat attendu : `11 suites · 435 assertions réussies · 0 échouées`.

Voir [TESTING.md](TESTING.md) pour ce que chaque suite vérifie.

---

## Sur un serveur

### 1. Préparer

```bash
sudo adduser --system --group --home /srv/choupotman choupotman
sudo -u choupotman git clone <dépôt> /srv/choupotman
cd /srv/choupotman
sudo -u choupotman npm ci
```

### 2. Configurer

```bash
sudo -u choupotman cp .env.example .env.production
sudo -u choupotman chmod 600 .env.production
```

En production, trois valeurs changent par rapport au développement :

```dotenv
APP_ENV=production
NEXT_PUBLIC_SITE_URL=https://choupotman.com
COOKIE_SECURE=1
```

`COOKIE_SECURE=1` est indispensable derrière HTTPS : sans lui, le cookie de
session peut voyager en clair.

### 3. Construire et peupler

```bash
sudo -u choupotman npm run build
sudo -u choupotman npm run db:migrate
sudo -u choupotman npm run db:seed
```

Sur une installation destinée à la production, supprimez les données de
démonstration une fois la prise en main terminée :

```bash
sudo -u choupotman npm run db:reset -- --demo
```

### 4. Droits sur les fichiers

Le processus écrit dans trois répertoires. Personne d’autre n’a besoin d’y
accéder :

```bash
sudo chown -R choupotman:choupotman /srv/choupotman/data
sudo chmod 700 /srv/choupotman/data
```

`data/` contient la base, les fichiers envoyés et les sauvegardes — c’est-à-dire
l’intégralité des données de l’activité.

### 5. Lancer en service

La mise en ligne complète — service systemd, reverse proxy, HTTPS, sauvegardes
planifiées — est décrite dans [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Problèmes fréquents

**`better-sqlite3` ne compile pas**
Le compilateur C est absent. Installez `build-essential` et `python3`, puis
`npm rebuild better-sqlite3`.

**« Le serveur ne répond pas » au lancement des tests**
Les tests exigent un serveur de production en cours d’exécution :
`npm run build && npm start &` avant `npm test`.

**« Trop de requêtes » pendant une session de test**
La limitation de débit fonctionne comme prévu. `scripts/test/run.sh` vide les
compteurs entre les suites ; si vous lancez une suite à la main plusieurs fois de
suite, attendez quelques minutes ou passez par le script.

**Impossible de se connecter après un `db:reset -- --all`**
La base ne contient plus de compte. Relancez `npm run db:seed`.

**L’envoi d’emails ne part pas**
Sans configuration SMTP, les messages sont mis en file et restent visibles dans
`/espace-admin/messages`. C’est le comportement prévu, pas une erreur : renseignez
`SMTP_*` puis utilisez « Traiter la file » pour envoyer ce qui attend.
