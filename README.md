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
| [docs/roadmap.md](docs/roadmap.md) | **État actuel** : implémenté, restant (vagues 7-8) |
| [docs/correctifs.md](docs/correctifs.md) | Journal des correctifs C-01 → C-51 |
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

## Pour les agents IA (contexte de travail)

**Répertoire de travail** : tout se fait sur la branche `beta` (pousser dessus est autorisé). `main` = validation humaine uniquement.

**Stack** : serveur Express + better-sqlite3 (sert aussi le front buildé), front React + Vite (PWA), tests `node:test` (serveur, runtime réel) + scripts jsdom (front, exécutés par `web/scripts/run-tests.sh`).

**Structure** : `server/` (routes `src/routes/`, auth `src/auth/`, schéma `src/db/schema.ts` avec migrations idempotentes) · `web/` (pages `src/pages/`, canevas `src/step-canvas.tsx`) · `shared/` (contrat figé) · `docs/` · `scripts/` · `update.sh` (déploiement).

**Conventions** :
- Correctifs numérotés **C-xx** : chaque modification non triviale = une entrée dans `docs/correctifs.md` (problème → correctif → tests → fichiers), et les docs associées sont mises à jour dans le même commit (guide utilisateur, roadmap, durcissement selon le cas).
- Portes qualité avant tout commit : `npm run build` (tsc) + `npm test` des deux côtés. Tout ce qui écrit en base est testé **en runtime** (tsc ne détecte pas, par ex., les transactions async refusées par better-sqlite3).
- Tests front : chaque fichier est un script jsdom autonome avec `process.exit(0)` ; l'échec = exit non-zéro ; le runner parallélise (xargs).
- Le formatage des fichiers existants peut être « compacté » (des blocs entiers sur une seule ligne) : **lire le texte réel avant tout remplacement** et vérifier chaque pattern (`assert count==1`).

**Env (durcissement)** : `MODOP_SESSION_TTL_HOURS`, `MODOP_ALLOWED_HOSTS` (allowlist anti-CSRF derrière proxy), `MODOP_SECURE_COOKIES`, `MODOP_DEPLOY=off`, variables `MODOP_OIDC_*` — voir [docs/durcissement-securite.md](docs/durcissement-securite.md).

**Historique** : v0-v6bis archivées dans `docs/archives/roadmap-v1-a-v6bis.md` ; chaque correctif C-xx raconté dans `docs/correctifs.md` — **lire ces deux documents avant de retravailler une zone** (le pourquoi y est tracé).
