# Guide de test — conteneur Proxmox

Modop est **entièrement encapsulé dans un conteneur LXC** : rien n'est installé sur l'hôte Proxmox. Pas besoin de Visual Studio ni d'aucun outil sur votre poste.

## 1. Créer le conteneur (sur l'hôte Proxmox)

```bash
pct create local-lvm:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
  --hostname modop --cores 2 --memory 2048 --swap 0 \
  --rootfs local-lvm:8 --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1 --start 1
pct enter modop
```

> `nesting=1` est requis pour pm2/systemd dans le conteneur.

## 2. Installer Modop (dans le conteneur, en root)

```bash
apt update && apt install -y curl git
git clone -b beta https://github.com/Leviath42/modop.git /opt/modop
cd /opt/modop
BRANCH=beta ADMIN_EMAIL=vous@entreprise.fr ADMIN_PASSWORD=VotreMotDePasse123 bash scripts/proxmox-install.sh
```

Le script installe Node.js 22 + pm2, installe les dépendances, build, crée votre compte admin, lance l'app sous pm2 (redémarrage automatique au boot) et vérifie le healthcheck. Durée : 2-3 minutes.

## 3. Tester

Ouvrez `http://<IP-du-conteneur>:3000` depuis votre PC ou mobile (même réseau).

Parcours de validation (10 min) :

1. **Connexion** avec l'email/mot de passe choisis.
2. **Créer** : « + Créer » → titre, référence (`MO-001`), catégorie → « Créer ».
3. **Éditer** : ajouter des étapes, décrire, ajouter une photo (appareil photo mobile), glisser-déposer pour réordonner, pictogrammes.
4. **Publier** : « Publier V1 ».
5. **Consulter** : liste → vue lecture (mobile : une étape/écran ; PC : sommaire).
6. **Republier** : modifier une étape → « Publier V2 ».
7. **Exporter** : « ⬇ Exporter en .docx » → ouvrir dans Word/LibreOffice.
8. **Mettre à jour** : bouton « Déploiement » dans la barre de navigation (admin) → version chargée, « Mettre à jour depuis GitHub », « Retour arrière », journal en direct.

## Gestion des comptes (admin)

Page **/admin** (lien « Comptes » dans la barre de navigation) :
- **créer** un compte (email + mot de passe 8+ caractères + rôle) ;
- **changer le rôle** (lecteur/auteur/admin) ;
- **désactiver/réactiver** — les sessions actives sont révoquées immédiatement, le login est refusé ;
- **réinitialiser un mot de passe** — un mot de passe temporaire est généré et affiché une seule fois ; toutes les sessions du compte sont révoquées.

Protection intégrée : impossible de se rétrograder ou se désactiver soi-même.

## Familles, types, suppression

- Chaque mode opératoire porte une **famille** (ex. Mécanique) et un **type** (ex. Maintenance) — définis à la création ou en édition.
- La liste filtre par **famille** (menu déroulant alimenté automatiquement) et affiche des badges.
- Les **pictogrammes** acceptent une couleur (sélecteur) et un texte libre par étape.
- La **suppression** d'un mode opératoire (bouton dans la liste) demande une confirmation explicite et supprime en cascade étapes, photos et versions.

## Mise à jour depuis le front

Page **/deploy** (admin uniquement) :
- version chargée (commit, auteur, date) et historique des 5 derniers commits ;
- **« Mettre à jour depuis GitHub »** : sauvegarde cohérente de la base (**VACUUM INTO** + `integrity_check`) → `git reset --hard origin/<branche>` (`MODOP_DEPLOY_BRANCH`, défaut `beta`) → `npm ci` racine si besoin → build → relance pm2 → healthcheck HTTP (l'app revient seule ; pendant le redémarrage la page affiche « serveur momentanément injoignable », puis le journal) ;
- **« Retour arrière »** : restaure la dernière sauvegarde de la base (10 conservées) ;
- échec de healthcheck ⇒ tentative de relance de la version précédente et code d'erreur affiché.

Le tout sans jamais ouvrir le shell Proxmox. Équivalent CLI : `bash /opt/modop/update.sh [rollback]`.

## Test automatique

```bash
pct exec modop -- bash -c "cd /opt/modop/server && npm test"   # 117 tests runtime
```

## Données & sauvegarde

- `/opt/modop/server/modop.db` — base SQLite
- `/opt/modop/server/data/photos/` — photos
- `/opt/modop/server/data/backups/` — sauvegardes horodatées prises par `update.sh` (**VACUUM INTO** : snapshot cohérent en un seul fichier, WAL inclus, vérifié par `PRAGMA integrity_check` ; 10 conservées)
- Sauvegarde du conteneur entier : snapshot Proxmox habituel.

Sauvegarde/vérification manuelles (mêmes outils que `update.sh`) :

```bash
cd /opt/modop && pm2 stop modop
node server/scripts/backup-db.mjs backup server/modop.db server/data/backups/db-manuel.db
node server/scripts/backup-db.mjs check  server/modop.db
pm2 restart modop
```

## Supervision du healthcheck (Uptime Kuma)

Observabilité minimale (vague 9) : le healthcheck `GET /api/health` est supervisé en continu avec alerte. Le plus simple sur Proxmox : un second conteneur LXC avec **Uptime Kuma** (image Docker `louislam/uptime-kuma`, ou LXC Debian + Node).

1. Créer le moniteur : type **HTTP(s)**, URL `http://<ip-du-ct-modop>:3000/api/health`, intervalle 60 s (le healthcheck est quasi gratuit).
2. **Notification** : brancher au moins un canal (e-mail SMTP, Gotify, ntfy…) — un monitoring sans notification ne prévient de rien.
3. Option utile : un second moniteur sur `/` (code attendu 200) pour distinguer « API en vrac » et « front injoignable ».

En cas d'alerte : `pm2 logs modop` sur le CT, puis si besoin `bash /opt/modop/update.sh rollback` (la dernière sauvegarde vérifiée est restaurée).

## Dépannage

| Symptôme | Solution |
|---|---|
| Mise à jour : serveur resté à l'arrêt | `tail -40 /opt/modop/server/data/deploy.log` puis `pm2 restart modop`. Si l'app crash en boucle (node_modules endommagé) : `cd /opt/modop && npm ci` puis `(cd server && npm run build) && pm2 restart modop`. Depuis C-58, update.sh relance seul l'application en cas d'échec. |
| Port 3000 occupé | `PORT=3001 bash scripts/proxmox-install.sh` |
| « Identifiants invalides » | le seed ne s'exécute que si aucune base n'existe ; `cd /opt/modop/server && npm run seed -- modop.db email pass1234 admin` |
| Page blanche | `cd /opt/modop/web && npm run build` puis `pm2 restart modop` |
| Logs | `pm2 logs modop` |
| Après update ratée | `bash /opt/modop/update.sh rollback` |

## Accès extérieur (beta) — tunnel Cloudflare

```bash
bash scripts/hardening-tunnel.sh            # durcissement + tunnel
bash scripts/hardening-tunnel.sh --tunnel-only   # tunnel seul
```

Le script : pare-feu local (entrant SSH uniquement), cookies sécurisés, sessions 12 h, cloudflared en service systemd, route DNS, healthcheck public. **À faire manuellement ensuite** : Cloudflare Access sur l'hôte + SSL/TLS « Full ». Voir `docs/durcissement-securite.md`.
