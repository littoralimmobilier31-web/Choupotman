# API

103 routes. Toutes répondent en JSON, toutes exigent une permission sauf celles
listées comme publiques.

---

## Conventions

### Enveloppes

```jsonc
// Succès
{ "ok": true, "id": 42 }

// Liste
{ "ok": true, "items": [ … ], "total": 128, "page": 1, "pageSize": 30 }

// Échec de validation
{ "error": "Données invalides.", "fields": { "email": "Adresse email invalide." } }

// Refus expliqué
{ "error": "Ce contrat est signé…", "reason": "Créez un avenant…" }
```

Un refus porte un `reason` quand il y a quelque chose à faire ensuite. Une erreur
qui ne dit pas quoi faire est une erreur à moitié écrite.

### Codes

| Code | Signification |
| --- | --- |
| `200` | Fait |
| `201` | Créé |
| `400` | Corps invalide, ou une règle métier non respectée |
| `401` | Pas de session |
| `403` | Jeton CSRF absent ou invalide |
| `404` | Introuvable — **ou hors de votre périmètre**, volontairement indiscernable |
| `409` | Refus délibéré : l’état actuel interdit l’opération |
| `410` | La ligne existe, le fichier a disparu |
| `429` | Limite de débit atteinte ; `Retry-After` indique l’attente |
| `500` | Défaut du serveur — le message interne n’est jamais renvoyé |

Le `404` pour « appartient à quelqu’un d’autre » est une décision de sécurité :
un `403` confirmerait l’existence de la ressource et permettrait d’énumérer les
identifiants.

### Mutations

Toute requête `POST`, `PATCH` ou `DELETE` doit porter le jeton CSRF, à la fois en
en-tête et dans le corps :

```bash
CSRF=$(curl -s -c jar http://localhost:3000/api/auth/csrf | jq -r .token)

curl -b jar -X POST http://localhost:3000/api/clients \
  -H 'Content-Type: application/json' \
  -H "x-csrf-token: $CSRF" \
  -d "{\"name\":\"Boulangerie Amine\",\"csrf\":\"$CSRF\"}"
```

### Suppressions

Beaucoup de routes `DELETE` **n’effacent pas** au premier appel : elles archivent,
dépublient, désactivent ou annulent, et répondent `{ "archived": true, "reason": … }`.
`?force=1` efface réellement. Les cas où un enregistrement n’est jamais effaçable
sont notés plus bas.

---

## Routes publiques

Sans session. Chacune est limitée en débit selon une politique dédiée.

| Route | Méthode | Rôle |
| --- | --- | --- |
| `/api/auth/csrf` | GET | Jeton CSRF (pré-session ou lié à la session) |
| `/api/auth/connexion` | POST | Connexion administration |
| `/api/auth/deconnexion` | POST | Déconnexion |
| `/api/auth/reinitialiser` | POST | Demande et validation de réinitialisation |
| `/api/contact` | POST | Formulaire de contact |
| `/api/demande-de-projet` | POST | Formulaire en 9 étapes |
| `/api/chat` | POST | Chatbot public |
| `/api/brief/[token]` | GET, POST | Brief client, par jeton |
| `/api/capture` | POST, OPTIONS | Capture vers un moodboard, par jeton |
| `/api/moodboard-public/[token]/[fileId]` | GET | Image d’une planche partagée |

`/api/capture` est la seule route mutante sans session **ni CSRF** : l’appelant
n’est pas un onglet sur cette origine. Sa sûreté vient de la forme du droit — un
jeton ajoute un élément à une seule planche et ne peut rien d’autre. Voir
[SECURITY.md](SECURITY.md).

---

## Espace client

Session client (cookie distinct de l’administration). **Chaque requête est filtrée
par `client_id`** ; une ressource d’un autre client répond `404`.

| Route | Méthode |
| --- | --- |
| `/api/client/connexion` · `/api/client/deconnexion` | POST |
| `/api/client/mot-de-passe` | POST |
| `/api/client/feedback` | POST |
| `/api/client/fichiers/[id]` | GET |
| `/api/client/devis/[id]/pdf` · `/api/client/factures/[id]/pdf` | GET |

---

## Administration

Chaque route exige une permission `ressource.action`. Le tableau donne la
ressource ; l’action suit le verbe HTTP (`GET`→`view`, `POST`→`create`,
`PATCH`→`update`, `DELETE`→`delete`).

### Commercial

| Route | Ressource | Notes |
| --- | --- | --- |
| `/api/prospects`, `/api/prospects/[id]` | `leads` | |
| `/api/prospects/[id]/convertir` | `leads` + `clients` | Crée un client, et un projet si demandé |
| `/api/clients`, `/api/clients/[id]` | `clients` | |
| `/api/clients/[id]/acces` | `clients` | Ouvre ou ferme l’accès au portail |
| `/api/demandes/[id]` | `leads` | Demandes reçues |
| `/api/briefs`, `/api/briefs/[id]` | `briefs` | |

### Production

| Route | Ressource | Notes |
| --- | --- | --- |
| `/api/projets`, `/api/projets/[id]` | `projects` | |
| `/api/etapes`, `/api/etapes/[id]` | `projects` | |
| `/api/taches`, `/api/taches/[id]` | `tasks` | |
| `/api/checklist`, `/api/checklist/[id]` | `tasks` | |
| `/api/commentaires` | `tasks` | |
| `/api/revisions`, `/api/revisions/[id]` | `revisions` | |
| `/api/revisions/[id]/facturer` | `invoices` | Facture une révision hors quota |
| `/api/feedback`, `/api/feedback/[id]` | `feedback` | |
| `/api/fichiers`, `/api/fichiers/[id]` | `files` | POST en `multipart/form-data` |
| `/api/fichiers/[id]/telecharger` | `files` | `?apercu=1` pour un affichage en ligne |
| `/api/dossiers`, `/api/dossiers/[id]` | `files` | Dossier non vide → `409` |
| `/api/dossiers/modeles` | `files` | `PUT` applique un modèle à un projet |
| `/api/moodboards`, `/api/moodboards/[id]` | `moodboards` | |
| `/api/moodboards/[id]/elements` | `moodboards` | `PUT` enregistre toute la disposition |
| `/api/moodboards/[id]/jetons` | `moodboards` | Le jeton n’est affiché qu’à sa création |

### Finances

| Route | Ressource | Notes |
| --- | --- | --- |
| `/api/devis`, `/api/devis/[id]` | `quotes` | |
| `/api/devis/[id]/facturer` | `invoices` | Idempotent : un devis déjà facturé renvoie la facture existante |
| `/api/factures`, `/api/factures/[id]` | `invoices` | Une facture émise verrouille ses montants → `409` |
| `/api/paiements`, `/api/paiements/[id]` | `payments` | Paiement sur brouillon → `409` ; sur-paiement refusé |
| `/api/contrats`, `/api/contrats/[id]` | `contracts` | Un contrat signé est figé → `409` |
| `/api/contrats/modeles` | `contracts` | Modifier un modèle ne réécrit aucun contrat |
| `/api/depenses`, `/api/depenses/[id]` | `expenses` | |
| `/api/abonnements`, `/api/abonnements/[id]` | `subscriptions` | `PATCH {"roll":true}` enregistre un renouvellement |
| `*/pdf` | la ressource concernée | `?inline=1` pour l’aperçu |

### Contenu public

| Route | Ressource |
| --- | --- |
| `/api/portfolio`, `/api/portfolio/[id]`, `/api/portfolio/[id]/medias` | `portfolio` |
| `/api/etudes-de-cas`, `/api/etudes-de-cas/[id]` | `case_studies` |
| `/api/blog`, `/api/blog/[id]` | `blog` |
| `/api/services`, `/api/services/[id]` | `services` |
| `/api/faq`, `/api/faq/[id]` | `services` |
| `/api/profil`, `/api/profil/[id]` | `profile` |
| `/api/temoignages`, `/api/temoignages/[id]` | `testimonials` |

Chaque mutation appelle `revalidatePublic(zone)` : la page publique reflète le
changement immédiatement, malgré la régénération périodique.

### Communication

| Route | Ressource | Notes |
| --- | --- | --- |
| `/api/messages`, `/api/messages/[id]` | `messages` | Un message envoyé n’est ni modifiable ni supprimable → `409` |
| `/api/messages/file` | `messages` | Traite la file d’attente |
| `/api/messages/modeles` | `messages` | Signale les variables inconnues |
| `/api/notifications` | `notifications` | Limitée à l’appelant |
| `/api/notifications/tout-lu` | `notifications` | |
| `/api/evenements`, `/api/evenements/[id]` | `calendar` | `GET` renvoie les six sources réunies |

### IA

| Route | Ressource | Notes |
| --- | --- | --- |
| `/api/ia/chat` | `ai` | Assistant privé ; les outils d’écriture renvoient des propositions |
| `/api/ia/confirmer` | `ai` + la permission de l’outil | **Le seul endroit où une action proposée s’exécute** |
| `/api/ia/generer` | `ai` | Analyse d’un projet, rédaction assistée |

### Système

| Route | Ressource | Notes |
| --- | --- | --- |
| `/api/parametres` | `settings` | Clés hors catalogue rejetées |
| `/api/utilisateurs`, `/api/utilisateurs/[id]` | `users` | Dernier Super Admin protégé → `409` |
| `/api/roles`, `/api/roles/[id]` | `roles` | Rôles fournis non modifiables → `409` |
| `/api/automatisations` | `automations` | Activation, réglages, balayage quotidien |
| `/api/sauvegardes` | `backups` | |
| `/api/sauvegardes/telecharger` | `backups.export` | Copie complète de la base |
| `/api/mon-compte` | `dashboard.view` | Son propre profil et ses sessions |
| `/api/recherche` | selon la ressource | Recherche globale |

---

## Refus délibérés

Ces `409` ne sont pas des limites techniques ; ce sont les garanties du système.

| Situation | Raison |
| --- | --- |
| Modifier une facture émise | Le client détient un document ; le sien et le vôtre doivent dire la même chose |
| Enregistrer un paiement sur un brouillon | Un règlement se rapporte à une facture qui existe |
| Encaisser plus que le solde | Un trop-perçu est une erreur de saisie, pas une opération |
| Réécrire un contrat signé | Un engagement se modifie par un avenant, pas en silence |
| Modifier ou supprimer un message envoyé | L’historique doit dire ce que le client a reçu |
| Rétrograder le dernier Super Admin | Plus personne n’atteindrait les paramètres |
| Modifier les permissions d’un rôle fourni | Ils servent de référence et de filet de sécurité |
| Supprimer un rôle encore attribué | Les comptes pointeraient vers rien |
| Supprimer un dossier non vide | Les fichiers remonteraient à la racine sans prévenir |

---

## Limitation de débit

| Politique | Limite | Fenêtre | Portée |
| --- | --- | --- | --- |
| `login` | 5 | 15 min | identifiant + IP |
| `contact` | 5 | 30 min | IP |
| `projectRequest` | 4 | 60 min | IP |
| `chatbot` | 40 | 30 min | IP |
| `aiAdmin` | 120 | 60 min | utilisateur |
| `passwordReset` | 4 | 60 min | compte |
| `upload` | 60 | 10 min | utilisateur |
| `capture` | 120 | 60 min | **jeton**, pas IP |
| `api` | 300 | 5 min | utilisateur + IP |

`capture` est compté par jeton : une extension utilisée depuis un réseau partagé
ne doit pas être bloquée par les captures d’un tiers, et un jeton qui fuit ne doit
pas se libérer en changeant d’adresse.
