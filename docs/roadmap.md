# Modop — Roadmap

*Dernière mise à jour : 2026-10-12 — après C-51 (barre d'outils sticky).*

L'historique complet des vagues livrées (v0 → v6bis) est archivé dans [archives/roadmap-v1-a-v6bis.md](archives/roadmap-v1-a-v6bis.md). La série de correctifs UI/UX (C-01 → C-51) est journalisée dans [correctifs.md](correctifs.md).

## ✅ Implémenté (v0 → v6bis + correctifs C-01..C-51)

- **Éditeur complet** : canevas par étape (photos libres, flèches/zones/textes clic-clic, corbeille de drag), étape active dynamique, autosave des métadonnées, uploads galerie **ou appareil photo**, barre d'outils sticky avec labels, pictos couleur+texte, familles/types.
- **Publication versionnée** : V1 → Vn immuable (snapshot complet : canevas + mise en page), changelog à la publication, restauration de version, duplication.
- **Lecture** : PC (sommaire, sélecteur d'étape ▶, versions publiées), mobile (lecture guidée une-étape-par-écran, boutons fixes en bas), lightbox plein écran (RF-31), QR imprimable, mode sombre.
- **Accueil** : regroupement Publié/Brouillon puis par famille, groupes repliables persistés, recherche debouncée, filtres (état, famille, à revoir), tri.
- **Terrain** : signalement par étape (lecteur), page dédiée « ⚑ Terrain » (à traiter / traitées, Résoudre, Corriger l'étape).
- **GED** : date de revue, responsable (sélecteur à recherche, comptes actifs), badge+filtre « à revoir », garde-fou à la désactivation du responsable.
- **Comptes** : rôles reader/author/admin, Prénom/Nom, modale d'édition complète, SSO OIDC optionnel, sessions révocables.
- **Statistiques (admin)** : usage, top consultés/exportés (libellés lisibles), activité récente, journal d'audit (200 lignes).
- **Suppression MO** : admin uniquement, double confirmation, case décochée par défaut.
- **Sécurité** : anti-CSRF (+ allowlist `MODOP_ALLOWED_HOSTS`), magic numbers, rate limits (login, feedback), révocation au changement de rôle, en-têtes durcis, audit.
- **Ops** : mise à jour/retour arrière depuis l'interface (admin), journal en direct, tests rationalisés (~9 s serveur + ~16 s front).

## 🚧 Restant à implémenter

### Vague 7 (proposition — reprise de l'ancienne vague 6)

| # | Fonctionnalité | Notes |
|---|---------------|-------|
| 1 | **Workflow de validation** | brouillon → relecture → publié, commentaires par relecteur (les stats et l'UI admin existent déjà côté API) |
| 2 | **Comparaison de versions** | diff Vn/Vn+1 (titres, étapes ajoutées/supprimées) — l'historique existe déjà |
| 3 | **SSO réel** | brancher l'IdP de l'entreprise (l'OIDC est prêt : variables d'env, bouton de connexion déjà branché) |
| 4 | **PWA : cache amélioré** | pré-cache des MO publiés pour lecture hors-ligne complète |

### Vague 8 — Gestion documentaire avancée (proposition, à spécifier)

| # | Fonctionnalité | Pistes |
|---|---------------|-------|
| 1 | **Arborescence documentaire paramétrable** | types de documents + regroupements multi-niveaux (Famille > Sous-famille > Type) |
| 2 | **Page de menu** | navigation par arborescence ou tuiles (la liste groupée actuelle peut servir de base) |
| 3 | **Nouvelle image : drag & drop / presse-papiers** | Ctrl+V dans l'étape + glisser-déposer sur le canevas ; compression conservée |
| 4 | **Documents parents** | rattachement parent/enfants (notice machine > MO associés), navigation |
| 5 | **Gestion de statut éditorial** | brouillon / en relecture / validé / obsolète (distinct de publié), filtrage, badges |

### Vision long terme

- Multi-langue (interface + contenus)
- API publique (intégrations GMAO)
- Statistiques d'usage fines par MO

## 🧭 Principes de développement

Vagues IA supervisées : contrat figé avant chaque vague, missions bornées, portes qualité (typecheck + build + tests d'exécution réels), fusion séquentielle sur `beta`, validation humaine sur le CT — voir [processus-vagues.md](processus-vagues.md).
