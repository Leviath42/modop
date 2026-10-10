# Guide de test — conteneur Proxmox

## Prérequis

- Un conteneur LXC Proxmox avec **Debian 12 ou Ubuntu 22.04+**.
- Droits root (ou sudo).
- **Node.js 20 ou 22** — c'est le seul prérequis. Rien d'autre (pas de Visual Studio, pas de base de données externe : SQLite est embarqué).

> **Visual Studio (Code) ?** Non nécessaire. Une seule ligne de commande suffit. VS Code n'est utile que si vous voulez lire/modifier le code, pas pour tester. Si vous l'installez un jour, ce sera VS **Code** (l'éditeur), pas Visual Studio — mais encore une fois, inutile pour tester.

## 1. Préparer le conteneur (une seule fois)

Dans le shell du conteneur Proxmox (`pct enter <id>` depuis l'hôte, ou console directe) :

```bash
# Node.js 22 (Debian/Ubuntu) — en root
apt update && apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version   # doit afficher v22.x
```

## 2. Récupérer l'application

```bash
apt install -y git
git clone -b beta https://github.com/Leviath42/modop.git
cd modop
```

## 3. Installer et créer le premier compte

```bash
# Dépendances du serveur et de l'interface
cd server && npm install
cd ../web && npm install

# Premier compte administrateur (remplacez l'email et le mot de passe)
cd ../server
npm run seed -- modop.db votre.email@entreprise.fr VotreMotDePasse123 admin
```

## 4. Construire l'interface puis démarrer

```bash
# Build du front (une seule fois, ~5 s)
cd ../web && npm run build

# Démarrage : un seul processus sert l'API ET l'interface
cd ../server
npm start
# → « Modop prêt sur http://127.0.0.1:3000 »
```

## 5. Tester

Depuis le conteneur : `http://127.0.0.1:3000`.
Depuis votre PC : `http://<IP-du-conteneur>:3000` (voir « Accès depuis le navigateur » ci-dessous).

Parcours de validation recommandé (10 minutes) :

1. **Connexion** avec l'email/mot de passe créés en étape 3.
2. **Créer** : bouton « + Créer » → titre, référence (ex. `MO-001`), catégorie → « Créer ».
3. **Éditer** : « + Ajouter une étape », décrire l'opération, ajouter une photo (prise avec l'appareil photo si vous testez depuis un mobile), glisser-déposer pour réordonner, activer un pictogramme.
4. **Publier** : « Publier V1 » — le badge passe à V1.
5. **Consulter** : retour à la liste, cliquer le mode opératoire → vue lecture (sur mobile : une étape par écran, boutons Précédent/Suivant ; sur PC : sommaire cliquable).
6. **Modifier + republier** : changer une étape, republier → V2.
7. **Exporter** : lien « ⬇ Exporter en .docx » → ouvrir le fichier dans Word/LibreOffice.

### Test mobile
Sur votre téléphone, ouvrez `http://<IP-du-conteneur>:3000` (même réseau Wi-Fi). Tout est responsive.

## Accès depuis le navigateur (hors du conteneur)

Le serveur n'écoute que sur `127.0.0.1` par défaut. Pour y accéder depuis votre PC :

```bash
# option A : écouter sur toutes les interfaces (réseau local de confiance)
HOST=0.0.0.0 npm start

# option B : rester en 127.0.0.1 et faire une redirection depuis l'hôte Proxmox
# (sur l'hôte, vers le conteneur) :
iptables -t nat -A PREROUTING -p tcp --dport 3000 -j DNAT --to-destination <IP-conteneur>:3000
```

⚠️ Pas d'exposition Internet sans HTTPS + reverse proxy (Caddy/Nginx). En réseau local de test, l'option A suffit.

## Test automatique (portes qualité)

Pour vérifier l'installation sans parcourir l'interface :

```bash
cd server
npm test          # 40 tests d'exécution réels (base en mémoire)
```

## Arrêt / relance

```bash
# arrêter : Ctrl+C dans le shell où tourne npm start
# relancer plus tard : tout est conservé (modop.db + data/photos/)
cd server && npm start
```

## Données

- `server/modop.db` : comptes, modes opératoires, versions.
- `server/data/photos/` : fichiers photos.
- Sauvegarde : copier ces deux emplacements.

## Dépannage rapide

| Symptôme | Cause probable | Solution |
|---|---|---|
| `EADDRINUSE` | port 3000 occupé | `PORT=3001 npm start` |
| « Identifiants invalides » | compte non créé | relancer l'étape 3 (seed) |
| Page blanche sur `:3000` | front non buildé | `cd ../web && npm run build` puis relancer |
| `git clone` refuse | branche beta protégée ? | vérifier `git clone -b beta` |
| Photos non affichées | `data/photos/` non inscriptible | vérifier les droits du dossier `server/data` |
