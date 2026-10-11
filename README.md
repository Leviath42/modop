# modop

Application web de création, publication et consultation de modes opératoires et instructions.
Pensée atelier : une étape, une photo, un pictogramme — consultable au PC comme sur mobile.

## Fonctionnalités

- **Éditeur** : étapes réordonnables (glisser-déposer), descriptions, pictogrammes d'indication (attention, EPI, outillage…), photos compressées côté client avant envoi.
- **Publication versionnée** : « Publier V1, V2… » crée un snapshot immuable de chaque version (canevas et mise en page des photos inclus, conservés aussi par la restauration et la duplication) ; les modifications continuent sur le brouillon. Confirmation demandée avant publication et avant suppression d'une étape.
- **Lecteur** : PC avec sommaire cliquable, mobile avec une étape par écran ; zoom sur les photos ; consultation de n'importe quelle version publiée (sélecteur Vn) — le snapshot reste immuable.
- **Export `.docx`** d'une version publiée, ouvrable dans Word/LibreOffice.
- **Comptes et rôles** : reader / author / admin, SSO OIDC optionnel (off par défaut, bouton dédié sur la page de connexion quand actif), sessions expirantes, journal d'audit.
- **Sécurité renforcée** : vérification d'origine anti-CSRF sur toutes les requêtes mutantes, photos accessibles uniquement aux utilisateurs connectés, contrôle du contenu réel des images uploadées (magic numbers), en-têtes COOP/CORP.
- **Gestion des comptes (admin)** : création, changement de rôle, désactivation (sessions révoquées immédiatement), réinitialisation de mot de passe (temporaire affiché une seule fois).
- **Suppression de mode opératoire** : confirmation explicite, cascade (étapes, photos, versions).
- **Pictogrammes enrichis** : par étape, pictos avec **couleur** (sélecteur) et **texte libre** — rendus en édition, lecture et export.
- **Classement famille / type** : filtre par famille dans la liste, badges en lecture.
- **Mise à jour depuis l'interface** (admin) : « Mettre à jour depuis GitHub », « Retour arrière » (sauvegarde de la base), journal en direct — sans ouvrir le shell.

Stack : Express + better-sqlite3 (serveur), React + Vite (front), tests `node:test`.

## Installation

Modop s'installe entièrement dans un conteneur LXC Proxmox, rien sur l'hôte :

```bash
pct create local-lvm:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
  --hostname modop --cores 2 --memory 2048 --swap 0 \
  --rootfs local-lvm:8 --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1 --start 1
pct enter modop
git clone -b beta https://github.com/Leviath42/modop.git /opt/modop
cd /opt/modop
BRANCH=beta ADMIN_EMAIL=vous@entreprise.fr ADMIN_PASSWORD=VotreMotDePasse123 bash scripts/proxmox-install.sh
```

L'app écoute ensuite sur `http://<IP-du-conteneur>:3000`. Détails et parcours de validation : [docs/guide-test-proxmox.md](docs/guide-test-proxmox.md).

## Développement

```bash
cd server && npm ci && npm run dev   # API sur :3000 (tsx watch)
cd web    && npm ci && npm run dev   # front Vite
cd server && npm test                # suite de tests runtime
```

Le front de production est servi par l'API (build via `npm run build` dans `web/`, voir `update.sh`).

## Structure

```
├── server/    API Express + SQLite (routes, auth, export .docx, tests)
├── web/       Front React/Vite (liste, lecteur, éditeur, page déploiement)
├── shared/    Contrat figé API/types (waves 0+)
├── docs/      Cahier des charges, guide de test Proxmox, sécurité, processus
├── ops/       Caddyfile
├── scripts/   Installateur LXC
└── update.sh  Mise à jour / retour arrière (piloté par la page /deploy)
```

## Documentation

| Document | Contenu |
|---|---|
| [docs/cahier-des-charges.md](docs/cahier-des-charges.md) | Exigences RF/RNF, périmètre, historique des versions |
| [docs/roadmap.md](docs/roadmap.md) | État des vagues, validation, prochaines étapes |
| [docs/guide-utilisateur.md](docs/guide-utilisateur.md) | **Guide utilisateur** : consulter, créer, publier, administrer |
| [docs/guide-test-proxmox.md](docs/guide-test-proxmox.md) | Installation conteneur LXC + tests |
| [docs/durcissement-securite.md](docs/durcissement-securite.md) | Mode production : SSO OIDC, TLS, sauvegardes chiffrées |
| [docs/processus-vagues.md](docs/processus-vagues.md) | Processus de développement (vagues IA supervisées) |

## Rôles

| Rôle | Accès |
|---|---|
| **Admin** | Tout + comptes, déploiement, statistiques |
| **Auteur** | Créer, publier, versionner, exporter |
| **Lecteur** | Consulter, rechercher, exporter |

## Thème

Clair / sombre — bouton dans la barre de navigation, choix mémorisé par appareil.
