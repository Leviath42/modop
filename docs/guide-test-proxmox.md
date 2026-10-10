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

## Mise à jour depuis le front

Page **/deploy** (admin uniquement) :
- version chargée (commit, auteur, date) et historique des 5 derniers commits ;
- **« Mettre à jour depuis GitHub »** : sauvegarde de la base → `git reset --hard origin/beta` → `npm ci` si besoin → build → relance pm2 → healthcheck HTTP (l'app revient seule ; pendant le redémarrage la page affiche « serveur momentanément injoignable », puis le journal) ;
- **« Retour arrière »** : restaure la dernière sauvegarde de la base (10 conservées) ;
- échec de healthcheck ⇒ tentative de relance de la version précédente et code d'erreur affiché.

Le tout sans jamais ouvrir le shell Proxmox. Équivalent CLI : `bash /opt/modop/update.sh [rollback]`.

## Test automatique

```bash
pct exec modop -- bash -c "cd /opt/modop/server && npm test"   # 47 tests runtime
```

## Données & sauvegarde

- `/opt/modop/server/modop.db` — base SQLite
- `/opt/modop/server/data/photos/` — photos
- Sauvegarde du conteneur entier : snapshot Proxmox habituel.

## Dépannage

| Symptôme | Solution |
|---|---|
| Port 3000 occupé | `PORT=3001 bash scripts/proxmox-install.sh` |
| « Identifiants invalides » | le seed ne s'exécute que si aucune base n'existe ; `cd /opt/modop/server && npm run seed -- modop.db email pass1234 admin` |
| Page blanche | `cd /opt/modop/web && npm run build` puis `pm2 restart modop` |
| Logs | `pm2 logs modop` |
| Après update ratée | `bash /opt/modop/update.sh rollback` |
