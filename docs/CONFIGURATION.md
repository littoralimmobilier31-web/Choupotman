# Configuration

Toutes les valeurs se lisent depuis l’environnement. Aucune clé, aucun mot de
passe et aucun secret n’est écrit dans le code ou dans le dépôt.

`.env.local` en développement, `.env.production` sur un serveur. Les deux sont
ignorés par Git ; ils doivent l’être aussi par toute sauvegarde envoyée ailleurs
que sur la machine.

---

## Application

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `APP_ENV` | `development` | `development`, `staging` ou `production`. En production, des vérifications supplémentaires refusent les valeurs par défaut dangereuses. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | L’adresse canonique. Sert aux URL absolues, au plan du site, aux métadonnées de partage et aux liens des emails. |
| `NEXT_PUBLIC_SITE_NAME` | `CHOUPOTMAN OS` | Nom affiché dans l’onglet et les partages. |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `fr` | Langue servie quand le navigateur n’en demande aucune connue. |

`NEXT_PUBLIC_SITE_URL` doit être exacte en production : une valeur fausse produit
des liens d’email qui ne mènent nulle part et des métadonnées de partage
incorrectes.

---

## Sécurité

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `SESSION_SECRET` | — | **Obligatoire.** 64 caractères hexadécimaux. Signe les sessions et les jetons CSRF. |
| `SESSION_TTL_HOURS` | `12` | Durée d’une session. Au-delà, il faut se reconnecter. |
| `COOKIE_SECURE` | `0` | `1` derrière HTTPS. Toujours `1` en production. |
| `RATE_LIMIT_LOGIN_ATTEMPTS` | `5` | Tentatives de connexion avant blocage temporaire. |
| `RATE_LIMIT_WINDOW_MINUTES` | `15` | Fenêtre de comptage. |

Générer le secret :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Changer `SESSION_SECRET` déconnecte tout le monde immédiatement.** C’est la
bonne réaction si vous pensez qu’il a fuité — et la raison de ne pas le changer
par habitude.

`COOKIE_SECURE=0` en production laisse le cookie de session voyager en clair.
L’application refuse de démarrer avec `APP_ENV=production` et un
`SESSION_SECRET` laissé à sa valeur d’exemple.

---

## Compte initial

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `BOOTSTRAP_ADMIN_USERNAME` | `Choupotman` | Identifiant du premier Super Admin. |
| `BOOTSTRAP_ADMIN_EMAIL` | `contact@choupotman.com` | Son adresse. |
| `BOOTSTRAP_ADMIN_PASSWORD` | — | **Obligatoire au premier `db:seed`.** |

Ces valeurs ne sont lues qu’une fois, par `npm run db:seed`, et uniquement si
aucun compte n’existe. Le compte créé porte `must_change_password` : toute route
d’administration redirige vers le changement de mot de passe tant qu’il n’a pas
été fait, donc le mot de passe du fichier `.env` n’ouvre littéralement rien
d’autre.

Une fois la première connexion effectuée, retirez `BOOTSTRAP_ADMIN_PASSWORD` du
fichier : il ne sert plus à rien et n’a aucune raison de rester sur le disque.

---

## Base de données

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DATABASE_PATH` | `./data/choupotman.db` | Emplacement du fichier SQLite. |

Le mode WAL crée deux fichiers voisins, `-wal` et `-shm`. Ils font partie de la
base : une copie qui les oublie peut s’ouvrir et être incomplète. Utilisez
`npm run backup`, qui passe par l’API de sauvegarde de SQLite.

---

## Stockage

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `UPLOAD_DIR` | `./data/uploads` | Fichiers envoyés. **Hors de `public/`, volontairement.** |
| `MAX_UPLOAD_MB` | `25` | Taille maximale par fichier. |
| `BACKUP_DIR` | `./data/backups` | Sauvegardes de la base. |

Le répertoire d’envoi n’est jamais servi en statique. Chaque téléchargement passe
par une route authentifiée qui répond en pièce jointe avec `nosniff` : un fichier
HTML envoyé par un client ne peut donc pas s’exécuter dans l’origine de
l’application. Déplacer `UPLOAD_DIR` dans `public/` annulerait cette protection.

---

## IA (Anthropic)

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | vide | Optionnelle. |
| `AI_MODEL` | `claude-opus-5` | Modèle utilisé. |
| `AI_MAX_TOKENS` | `1600` | Longueur maximale d’une réponse. |

**Sans clé, l’application fonctionne.** Le chatbot et l’analyse de projet
basculent sur un moteur déterministe qui répond à partir de la même base de
données ; l’assistant privé indique que la clé n’est pas configurée plutôt que de
prétendre réfléchir.

La clé est lue côté serveur uniquement. Elle n’apparaît dans aucune réponse,
aucun journal et aucun bundle client.

---

## Email (SMTP)

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `SMTP_HOST` | vide | Sans valeur, l’envoi est désactivé. |
| `SMTP_PORT` | `587` | `587` pour STARTTLS, `465` pour TLS implicite. |
| `SMTP_USER` | vide | Identifiant. |
| `SMTP_PASSWORD` | vide | Mot de passe ou mot de passe d’application. |
| `SMTP_FROM` | — | Expéditeur, au format `Nom <adresse>`. |

**Sans SMTP, rien n’est perdu.** Les messages sont enregistrés avec le statut
« en attente » et restent visibles dans `/espace-admin/messages`. Une fois les
paramètres renseignés, « Traiter la file » envoie ce qui attendait — aucun texte
n’est à ressaisir.

Chaque réponse d’API concernée renvoie `mailConfigured`, pour que l’interface
puisse expliquer pourquoi un message n’est pas parti au lieu de paraître cassée.

---

## Vérifier la configuration

```bash
npm run typecheck    # les variables sont lues via un module typé
npm run build        # échoue si une valeur obligatoire manque en production
```

Les valeurs se lisent toutes à travers `src/lib/config.ts`, jamais par
`process.env` dispersé dans le code : les valeurs par défaut, les conversions et
les vérifications sont au même endroit.
