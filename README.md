# Modop

Application web de création, publication et consultation de **modes opératoires** — pensée atelier : une étape, une photo, un pictogramme. Auto-hébergée (LXC Proxmox), consultable sur PC et mobile (PWA).

## Ce que ça fait

- **Éditeur** : étapes avec canevas libre — photos (galerie ou appareil photo), flèches/zones/textes, pictogrammes (attention, EPI…), autosave, barre d'outils toujours accessible (sticky).
- **Publication versionnée** : V1, V2… — snapshots immuables (canevas et mise en page inclus), changelog, restauration, duplication.
- **Lecture** : PC (sommaire, versions publiées) et mobile (lecture guidée une étape par écran, zoom plein écran, QR imprimable), mode sombre.
- **Accueil** : regroupement Publié/Brouillon puis par famille, groupes repliables, recherche et filtres (dont « à revoir »).
- **Terrain** : signalement d'un problème par étape (lecteur) → page dédiée « à traiter / traitées » (auteur).
- **GED** : date de revue, responsable (parmi les comptes actifs), badge « à revoir », garde-fou automatique si le responsable part.
- **Rôles** : lecteur / auteur / admin — la suppression définitive d'un MO est réservée aux admins.
- **Export `.docx`** des versions publiées (Word/LibreOffice).
- **Mise à jour depuis l'interface** (admin) : bouton « Mettre à jour depuis GitHub », retour arrière, journal en direct — sans shell.

## Installation (conteneur LXC Proxmox)

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

L'app écoute sur `http://<IP-du-conteneur>:3000`. Détails : [docs/guide-test-proxmox.md](docs/guide-test-proxmox.md).

## Documentation

| Document | Contenu |
|---|---|
| [docs/cahier-des-charges.md](docs/cahier-des-charges.md) | Exigences RF/RNF et leur statut (implémenté / restant) |
| [docs/roadmap.md](docs/roadmap.md) | **État actuel** : implémenté, restant (vagues 7-10) |
| [docs/correctifs.md](docs/correctifs.md) | Journal des correctifs C-01 → C-54 |
| [docs/guide-utilisateur.md](docs/guide-utilisateur.md) | Guide utilisateur : consulter, créer, publier, administrer |
| [docs/guide-test-proxmox.md](docs/guide-test-proxmox.md) | Installation conteneur LXC + parcours de validation |
| [docs/durcissement-securite.md](docs/durcissement-securite.md) | Production : SSO OIDC, TLS, variables d'environnement |
| [docs/processus-vagues.md](docs/processus-vagues.md) | Processus de développement (vagues IA supervisées) |
| [docs/archives/](docs/archives/) | Historique des vagues v0 → v6bis (roadmap archivée) |

## Pour développer

```bash
cd server && npm ci && npm run dev   # API sur :3000
cd web    && npm ci && npm run dev   # front Vite
cd server && npm test                # tests runtime (~9 s)
cd web    && npm test                # tests front (~16 s, parallèles)
```

## Pour les agents IA

Tout le contexte de travail (stack, commandes, arborescence annotée, conventions, env, routage documentaire) est concentré dans [AGENTS.md](AGENTS.md), lu automatiquement par la plupart des agents IA. `docs/correctifs.md` (~800 lignes) se consulte par mot-clé (`grep -n "<mot-clé>" docs/correctifs.md`), jamais en entier.
