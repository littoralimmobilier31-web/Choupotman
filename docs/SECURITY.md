# Sécurité

Ce que l’application protège, comment, et ce qu’elle ne protège pas.

---

## Mots de passe

**scrypt**, depuis le module `crypto` de Node. Aucune dépendance dans le chemin
d’authentification, aucune compilation native à maintenir.

```
scrypt$N$r$p$<sel-base64>$<empreinte-base64>
```

Les paramètres sont inscrits dans l’empreinte. Ils peuvent donc être augmentés
plus tard : les anciennes empreintes restent vérifiables, et `needsRehash()`
signale celles à régénérer à la prochaine connexion.

La vérification est à temps constant et renvoie `false` sur une valeur mal formée
au lieu de lever une exception — une ligne corrompue ne doit pas faire tomber la
route de connexion.

### La politique

Dix caractères minimum, avec une minuscule, une majuscule, un chiffre et un
caractère spécial ; refus des mots de passe courants et de ceux contenant
l’identifiant ou l’adresse email. Appliquée **côté serveur**, à chaque écriture.
Le client affiche le même retour, mais n’est pas l’autorité.

### Les mots de passe provisoires

`generateTemporaryPassword()` garantit un caractère de chaque classe **par
construction**, exclut les glyphes ambigus (`O`/`0`, `l`/`1`/`I`) puisqu’ils sont
recopiés à la main, et mélange avec un générateur cryptographique.

Un jeton aléatoire ordinaire ne conviendrait pas : une sortie base64url ne
satisfait la politique que par hasard, ce qui faisait échouer environ un tiers des
réinitialisations — et réussir au deuxième essai, la pire forme d’intermittence.

Un mot de passe provisoire est affiché **une seule fois**. Seule son empreinte est
enregistrée ; il n’apparaît ni dans le journal d’activité, ni dans une réponse
ultérieure.

---

## Sessions

Le cookie contient trois parties :

```
sessionId . token . HMAC(sessionId.token, SESSION_SECRET)
```

- Le **HMAC** est vérifié avant toute lecture en base : un cookie fabriqué est
  rejeté sans requête SQL.
- Seul un **SHA-256 du jeton** est enregistré. Une fuite de la base ne fournit
  aucune session utilisable.
- Cookie `HttpOnly`, `SameSite=Lax`, et `Secure` dès que `COOKIE_SECURE=1`.

Les sessions administration et client utilisent des cookies, des tables et des
gardes **différents**. Un client connecté n’est pas un utilisateur peu autorisé :
c’est un type d’accès sans rapport, vérifié dans les tests dans les deux sens.

Les sessions sont révoquées à la désactivation d’un compte, à la réinitialisation
de son mot de passe, et sur demande depuis « Mon compte » — auquel cas la session
courante est conservée, pour que l’action soit cliquable depuis l’appareil qu’on
tient en main.

---

## CSRF

Double soumission : un jeton dans un en-tête **et** dans le corps, dérivé du
secret de la session par HMAC.

Un jeton pré-session existe pour le formulaire de connexion, qui n’a pas encore
de session à lier. `isSameOrigin()` complète la vérification.

Toute route mutante passe par `createHandler`, qui vérifie le jeton avant
d’appeler quoi que ce soit. Il n’y a pas de route d’écriture en dehors de ce
chemin, à une exception documentée : `/api/capture`.

---

## Permissions

Une seule source de vérité : `src/lib/auth/permissions.ts`. 33 ressources × 5
actions.

```ts
requirePermission('invoices.create')   // dans une page serveur
createHandler({ permission: 'invoices.create' }, …)   // dans une route
```

`super_admin` court-circuite la vérification. Les cinq rôles fournis — Super
Admin, Manager, Finance, Editor, Viewer — ne sont pas modifiables : ils servent
de référence et de filet. Les rôles sur mesure se créent en dupliquant l’un
d’eux.

Trois protections encadrent le dernier Super Admin actif — il ne peut être ni
rétrogradé, ni désactivé, ni supprimé. Les trois passent par une même fonction,
parce qu’elles produisent le même résultat : plus personne n’atteint les
paramètres, et rien dans l’application ne permet d’y revenir.

---

## Envois de fichiers

C’est la surface la plus risquée, donc les règles sont strictes et centralisées
dans `src/lib/storage.ts` :

1. **Le nom sur le disque est aléatoire.** Le nom d’origine n’est qu’une
   métadonnée. Traversée de chemin et fichiers du type `shell.php` disparaissent
   par construction.
2. **Extension sur liste blanche**, et le type MIME déclaré doit concorder. SVG
   est exclu : il peut porter du script et s’exécuterait à l’affichage.
3. **Octets de signature** vérifiés là où le format en possède une. Un script
   renommé en `.png` avec un type déclaré `image/png` est refusé à ce stade —
   c’est le cas que les tests couvrent explicitement.
4. **Taille plafonnée** (`MAX_UPLOAD_MB`).
5. **Chemin vérifié** : toute résolution sortant du répertoire d’envoi est
   refusée.
6. **Jamais servi en statique.** Chaque téléchargement passe par une route
   authentifiée, en pièce jointe, avec `X-Content-Type-Options: nosniff`.

Un lot d’envois n’est pas atomique, délibérément : un fichier refusé ne doit pas
faire perdre les quatre autres. Chaque refus est rapporté avec sa raison.

---

## Jetons de capture

`/api/capture` est la seule route mutante sans session ni jeton CSRF, parce que
l’appelant — une extension de navigateur, un partage depuis un téléphone — n’est
pas un onglet sur cette origine.

Sa sûreté tient à la **forme du droit**, pas à l’appelant :

- un jeton autorise **une seule action** : ajouter un élément à **une seule**
  planche. Il ne peut pas la lire, ni lister quoi que ce soit, ni toucher une
  autre planche ;
- seule l’empreinte du jeton est enregistrée ;
- il expire et se révoque, avec effet immédiat ;
- il est limité en débit **par jeton**, pas par IP ;
- une image envoyée passe par la même validation que tout autre envoi, restreinte
  aux images.

Chaque capture est journalisée avec l’identifiant du jeton et la page d’origine.
Cette traçabilité est la raison d’émettre des jetons révocables plutôt qu’un
secret partagé.

---

## Limitation de débit

Adossée à la base, avec des politiques nommées plutôt que des valeurs dispersées
dans le code. Le tableau complet est dans [API.md](API.md).

Un compte se verrouille temporairement après plusieurs échecs de connexion. Les
compteurs de réinitialisation sont indexés sur l’identifiant du compte, pas sur
l’adresse IP : changer de réseau ne libère pas la limite.

---

## Journal d’activité

Chaque opération qui change un état écrit une entrée : qui, quoi, quand, depuis
quelle adresse. `actor_label` est dénormalisé, donc une entrée reste lisible
après la suppression du compte qui l’a produite.

**Le journal n’a aucune route d’écriture.** `POST`, `PATCH` et `DELETE` sur
`/api/journal` répondent `404`, et c’est vérifié par les tests : un journal que
l’on peut ranger ne prouve rien.

Les échecs de connexion y figurent et s’affichent en rouge — une série d’échecs
est l’information la plus utile que cet écran puisse montrer, et elle est
invisible si toutes les lignes se ressemblent.

---

## En-têtes

Appliqués par `next.config.ts` :

```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

Les surfaces privées ne sont jamais mises en cache : `Cache-Control: private,
no-store` sur les téléchargements et les réponses d’administration. Le service
worker de la PWA ne met en cache aucune adresse commençant par `/espace-admin`,
`/client` ou `/api`.

---

## Ce qui n’est pas couvert

À traiter au niveau de l’hébergement, et documenté dans
[DEPLOYMENT.md](DEPLOYMENT.md) :

- **HTTPS** — l’application définit `Strict-Transport-Security` mais ne termine
  pas TLS. Un reverse proxy s’en charge.
- **Chiffrement au repos** — la base est un fichier ; si le disque doit être
  chiffré, cela relève du système.
- **Double facteur** — non implémenté. La politique de mot de passe, le
  verrouillage après échecs et les sessions courtes sont les protections en
  place.
- **Protection réseau** (DDoS, pare-feu applicatif) — la limitation de débit
  protège la base, pas la bande passante.
- **Sauvegardes hors site** — `npm run backup` écrit sur le même disque. Copier
  ailleurs est une étape à part, décrite dans le guide de déploiement.

---

## Si un secret a fuité

| Secret | Conséquence | Réaction |
| --- | --- | --- |
| `SESSION_SECRET` | Des sessions peuvent être forgées | Le remplacer : tout le monde est déconnecté immédiatement |
| `ANTHROPIC_API_KEY` | Consommation facturée | La révoquer chez Anthropic, en émettre une nouvelle |
| `SMTP_PASSWORD` | Envoi d’emails en votre nom | Le changer chez le fournisseur |
| Un jeton de capture | Ajout d’éléments à une planche | Le révoquer dans `/espace-admin/moodboards` |
| Un mot de passe de compte | Accès selon le rôle | Réinitialiser depuis `/espace-admin/utilisateurs` — les sessions du compte sont fermées |
| Le fichier de sauvegarde | **Toutes les données** | Changer `SESSION_SECRET`, réinitialiser tous les mots de passe, prévenir les personnes concernées |
