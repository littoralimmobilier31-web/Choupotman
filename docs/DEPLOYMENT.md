# Mise en ligne

Mettre CHOUPOTMAN OS en production sur `choupotman.com`.

---

## Ce qu’il faut

- Un serveur Linux — 1 vCPU et 1 Go de RAM suffisent pour cet usage
- Node.js 20 ou plus récent
- Un nom de domaine pointant vers le serveur
- Un certificat TLS (Let’s Encrypt convient)

Pas de serveur de base de données : SQLite est un fichier.

---

## 1. Le domaine

`choupotman.com` n’est pas encore enregistré au moment où ceci est écrit.

1. **Enregistrer le domaine** chez un bureau d’enregistrement.
2. **Pointer les DNS** vers le serveur :

```
A      choupotman.com       → <adresse IPv4 du serveur>
AAAA   choupotman.com       → <adresse IPv6, si disponible>
CNAME  www.choupotman.com   → choupotman.com
```

3. **Attendre la propagation** — de quelques minutes à quelques heures.

```bash
dig +short choupotman.com
```

Avant de disposer du domaine, tout se teste sur l’adresse IP ou sur un
sous-domaine provisoire : rien dans l’application ne dépend du nom choisi, à
l’exception de `NEXT_PUBLIC_SITE_URL`.

---

## 2. L’application

```bash
sudo adduser --system --group --home /srv/choupotman choupotman
sudo -u choupotman git clone <dépôt> /srv/choupotman
cd /srv/choupotman
sudo -u choupotman npm ci
sudo -u choupotman cp .env.example .env.production
sudo -u choupotman chmod 600 .env.production
```

Dans `.env.production` :

```dotenv
APP_ENV=production
NEXT_PUBLIC_SITE_URL=https://choupotman.com
COOKIE_SECURE=1
SESSION_SECRET=<64 caractères hexadécimaux générés>
BOOTSTRAP_ADMIN_USERNAME=Choupotman
BOOTSTRAP_ADMIN_EMAIL=contact@choupotman.com
BOOTSTRAP_ADMIN_PASSWORD=<provisoire, à changer à la première connexion>
```

```bash
sudo -u choupotman npm run build
sudo -u choupotman npm run db:migrate
sudo -u choupotman npm run db:seed

sudo chown -R choupotman:choupotman /srv/choupotman/data
sudo chmod 700 /srv/choupotman/data
```

Une fois la première connexion faite et le mot de passe changé, retirez
`BOOTSTRAP_ADMIN_PASSWORD` du fichier.

---

## 3. Le service

`/etc/systemd/system/choupotman.service` :

```ini
[Unit]
Description=CHOUPOTMAN OS
After=network.target

[Service]
Type=simple
User=choupotman
Group=choupotman
WorkingDirectory=/srv/choupotman
Environment=NODE_ENV=production
EnvironmentFile=/srv/choupotman/.env.production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

# Le processus n'a besoin d'écrire que dans son propre répertoire de données.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/choupotman/data /srv/choupotman/.next

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now choupotman
sudo systemctl status choupotman
```

---

## 4. Le reverse proxy

L’application écoute sur le port 3000 et ne termine pas TLS.

`/etc/nginx/sites-available/choupotman` :

```nginx
server {
    listen 80;
    server_name choupotman.com www.choupotman.com;
    return 301 https://choupotman.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.choupotman.com;
    ssl_certificate     /etc/letsencrypt/live/choupotman.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/choupotman.com/privkey.pem;
    return 301 https://choupotman.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name choupotman.com;

    ssl_certificate     /etc/letsencrypt/live/choupotman.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/choupotman.com/privkey.pem;

    # Doit dépasser MAX_UPLOAD_MB, sinon nginx refuse avant l'application
    # et l'utilisateur voit une erreur qui ne dit rien.
    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        'upgrade';
    }
}
```

`X-Forwarded-For` compte : sans lui, la limitation de débit voit toutes les
requêtes venir de l’adresse du proxy et bloque tout le monde ensemble.

```bash
sudo ln -s /etc/nginx/sites-available/choupotman /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d choupotman.com -d www.choupotman.com
```

---

## 5. Les tâches planifiées

Deux travaux réguliers. Sans eux, l’application marche, mais les rappels
n’arrivent pas et les sauvegardes n’existent pas.

```bash
sudo -u choupotman crontab -e
```

```cron
# Sauvegarde quotidienne, 3 h du matin
0 3 * * * cd /srv/choupotman && /usr/bin/npm run backup >> /srv/choupotman/data/backup.log 2>&1

# Balayage des automatisations, 7 h du matin
0 7 * * * cd /srv/choupotman && /usr/bin/npm run daily >> /srv/choupotman/data/automation.log 2>&1
```

Les deux scripts appellent le moteur directement plutôt que de passer par
l’interface HTTP. Une tâche planifiée n’a ni session ni jeton CSRF, et lui en
donner un — durable, posé sur le disque, valable indéfiniment — serait un mauvais
échange pour appeler un travail de nuit. Le planificateur reste ainsi entièrement
hors de la surface d’authentification.

Le balayage est aussi déclenchable depuis l’écran des automatisations, et il est
rejouable sans effet de bord : chaque notification porte une empreinte dérivée du
fait et du jour, donc un second passage n’insère rien. Sans `--force`, il
s’arrête de lui-même s’il a déjà tourné dans la journée.

`npm run daily` sort en code 1 si une règle a échoué, pour que l’échec remonte
dans le rapport du planificateur au lieu de finir dans un journal que personne ne
lit.

---

## 6. Les sauvegardes

```bash
npm run backup                 # conserve les 14 plus récentes
npm run backup -- --keep 30
```

La sauvegarde utilise l’API de sauvegarde en ligne de SQLite : elle est cohérente
même si l’application sert des requêtes pendant l’opération.

**Deux choses à sauvegarder, pas une :**

| Quoi | Où | Comment |
| --- | --- | --- |
| La base | `data/backups/*.db` | `npm run backup` |
| Les fichiers envoyés | `data/uploads/` | `rsync`, au niveau du système |

Une sauvegarde de base sans les fichiers restaure des factures dont les
justificatifs ont disparu. L’écran des sauvegardes l’annonce en avertissement
plutôt que de laisser le découvrir au mauvais moment.

### Hors site

`npm run backup` écrit sur le même disque. Si ce disque meurt, il n’y a plus rien.
Ajoutez une copie ailleurs :

```cron
30 3 * * * rsync -az --delete /srv/choupotman/data/backups/ /srv/choupotman/data/uploads/ \
  sauvegarde@ailleurs:/srv/choupotman-backups/
```

### Restaurer

Application arrêtée, toujours :

```bash
sudo systemctl stop choupotman

sudo -u choupotman mv /srv/choupotman/data/choupotman.db \
                      /srv/choupotman/data/choupotman.db.avant-restauration
sudo -u choupotman rm -f /srv/choupotman/data/choupotman.db-wal \
                         /srv/choupotman/data/choupotman.db-shm
sudo -u choupotman cp /srv/choupotman/data/backups/<fichier>.db \
                      /srv/choupotman/data/choupotman.db

sudo systemctl start choupotman
```

Gardez le fichier `.avant-restauration` jusqu’à ce que vous soyez certain du
résultat : la restauration écrase aussi tout ce qui a été enregistré depuis la
sauvegarde.

---

## 7. Mettre à jour

```bash
cd /srv/choupotman
sudo -u choupotman npm run backup        # d'abord, toujours
sudo -u choupotman git pull
sudo -u choupotman npm ci
sudo -u choupotman npm run build
sudo -u choupotman npm run db:migrate
sudo systemctl restart choupotman
```

La sauvegarde vient en premier parce qu’une migration ne se défait pas
automatiquement.

---

## 8. Vérifier

```bash
curl -sI https://choupotman.com | head -1
curl -sI https://choupotman.com | grep -i strict-transport
curl -s https://choupotman.com/robots.txt
curl -s https://choupotman.com/sitemap.xml | head -5
```

Puis, à la main :

- [ ] La page d’accueil s’affiche, en français
- [ ] `/espace-admin` redirige vers la connexion
- [ ] La connexion fonctionne et impose le changement de mot de passe
- [ ] Un envoi de fichier aboutit, et le téléchargement fonctionne
- [ ] Un PDF de facture se génère
- [ ] Le basculement clair/sombre fonctionne
- [ ] L’arabe s’affiche de droite à gauche
- [ ] Le site s’installe comme application (PWA)
- [ ] `npm run backup` produit un fichier

---

## 9. Supervision

```bash
sudo journalctl -u choupotman -f          # journaux de l'application
sudo journalctl -u choupotman -p err      # uniquement les erreurs
du -sh /srv/choupotman/data/*             # occupation disque
```

Dans l’application :

- `/espace-admin/journal` — qui a fait quoi
- `/espace-admin/automatisations` — ce que les règles ont exécuté
- `/espace-admin/statistiques` — activité et fréquentation

---

## Avant de disposer du domaine

Pour montrer le site sans domaine enregistré, deux options :

**Sur la machine** — `npm run build && npm start`, puis `http://localhost:3000`.
Tout fonctionne, y compris les envois de fichiers et les PDF.

**Sur un serveur, en accès temporaire** — déployez avec
`NEXT_PUBLIC_SITE_URL=http://<ip>:3000` et `COOKIE_SECURE=0`. Le site est
utilisable ; seuls les liens absolus des emails et les métadonnées de partage
porteront l’adresse provisoire. Le jour où le domaine est actif, changez ces deux
variables et relancez le service : aucune donnée n’est concernée.
