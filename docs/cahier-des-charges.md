# Cahier des charges — Modop

**Projet :** Application web de création et consultation de modes opératoires, auto-hébergée.

**Statut :** **v1.5** — vagues 0→6bis **et correctifs C-01→C-51** livrés sur `beta` : socle GED (RF-70 à RF-77), lecture guidée terrain, QR d'accès, remontées terrain, Prénom/Nom des comptes, responsable à sélectionner, barre d'outils sticky, sécurité durcie. Historique des vagues : [docs/archives/roadmap-v1-a-v6bis.md](archives/roadmap-v1-a-v6bis.md) ; journal des correctifs : [correctifs.md](correctifs.md). Versions précédentes : v1.4 (socle GED), v1.3 (layout photos), v1.2 (comptes, pictos, familles), v1.1 (sécurité), v1.0 (MVP).

## 1. Présentation du projet

### 1.1 Contexte

Les équipes industrielles (fabrication, assemblage, maintenance) ont besoin de modes opératoires clairs, illustrés et à jour, consultables aussi bien sur PC (bureau, atelier) que sur mobile (terrain). Aujourd'hui, ces documents sont souvent produits dans des outils bureautiques génériques, difficiles à maintenir, peu lisibles sur mobile et sans historique de versions.

### 1.2 Objectif

Développer **Modop**, une application web progressive (PWA) permettant de :

- créer facilement des modes opératoires structurés (étapes, descriptions, photos, indications visuelles) ;
- les consulter confortablement sur mobile et PC ;
- gérer des versions successives avec une numérotation simple ;
- les exporter au format `.docx` (ou compatible Word) ;
- les partager au sein d'une équipe interne avec des rôles (auteur / lecteur).

### 1.3 Périmètre

Un mode opératoire se compose de :

- des **informations générales** : titre, référence, description, domaine/catégorie ;
- une **liste ordonnée d'étapes**, chacune comportant :
  - un titre,
  - une description textuelle de l'opération,
  - une ou plusieurs **photos** (photo principale + photos complémentaires),
  - des **indications visuelles** : annotations sur les photos (flèches, encadrés, zones mises en évidence) et pictogrammes d'avertissement (attention, EPI obligatoire, outillage spécifique…) ;
- un état : **brouillon** ou **publié** ;
- un **numéro de version** (V1, V2, V3…) incrémenté automatiquement à chaque publication d'une modification.

### 1.3 bis Fonctionnalités ajoutées (suivi de projet)

- **RF-57 — Layout des photos** : taille (S/M/L/Plein) et alignement (gauche/centre/droite) par photo, persistés, appliqués en édition et lecture.
- **RF-58 — Annotations photo** : flèches, zones, textes colorés posés par **clic-clic** (départ/arrivée), déplaçables et supprimables ; rendu en lecture.
- **RF-59 — Ergonomie éditeur** : étapes repliées par défaut, Tout ouvrir/replier, menu « Aller à… », bandeau d'actions sticky.
- **RF-60 — Lecteur continu** : toutes les étapes à la suite, menu déroulant de navigation, bandeau sticky.
- **RF-61 — Thème clair/sombre** : bascule dans la barre de navigation, persistée, appliquée partout (variables CSS).

- **RF-50 à RF-53 — Gestion des comptes (admin)** : création (email/mot de passe/rôle), changement de rôle, désactivation/réactivation (sessions révoquées immédiatement), réinitialisation de mot de passe (temporaire affiché une fois).
- **RF-54 — Suppression de mode opératoire** : confirmation explicite, suppression en cascade (étapes, photos, versions).
- **RF-55 — Pictogrammes enrichis** : par étape, pictos avec **couleur** (sélecteur) et **texte libre** ; présents en édition, lecture (bandeau coloré) et export DOCX (texte coloré).
- **RF-56 — Classement famille/type** : chaque mode opératoire porte une *famille* (ex. Mécanique, Électrique) et un *type* (ex. Maintenance) ; filtre par famille dans la liste, badges en lecture.
- **RF-62 — Arborescence documentaire paramétrable** *(restant — vague 8)* : types de documents paramétrables et regroupement sur **plusieurs niveaux** (ex. Famille > Sous-famille > Type) ; l'arborescence structure la navigation et remplace/complète les filtres famille/type actuels. Détails à spécifier (modèle de données, admin des regroupements).
- **RF-63 — Page de menu** *(restant — vague 8)* : accueil organisé par arborescence (navigation par regroupements plutôt que liste plate) ; à spécifier (tuiles, recherche, profondeur affichée).
- **RF-64 — Insertion d'image par glisser-déposer ou presse-papiers** *(restant — vague 8)* : nouvelle image ajoutée à une étape par **drag & drop** d'un fichier sur le canevas ou **collage** d'une capture (Ctrl+V / presse-papiers) ; compression côté client conservée.
- **RF-68 — Import multiple d'images** : le sélecteur de fichiers accepte **plusieurs images à la fois** (téléversées séquentiellement avec la compression existante). Implémenté.
- **RF-65 — Gestion des versions enrichie** : en plus du numéro/auteur/date, chaque publication porte une **description des modifications apportées** (saisie à la publication, visible dans l'historique).
- **RF-66 — Documents parents** *(restant — vague 8)* : un mode opératoire peut être rattaché à un **document parent** (ex. notice machine > modes opératoires associés) ; navigation parent/enfants dans les deux sens.
- **RF-67 — Gestion de statut** *(partiel : « à revoir » automatique implémenté ; workflow relecture/validé restant — vague 7)* : statut éditorial paramétrable sur le document — valeurs normalisées *brouillon / en relecture / validé / à revoir / obsolète* ; transitions contrôlées par rôle (auteur : brouillon→relecture ; validateur : relecture→validé ; passage automatique à « à revoir » à l'échéance de revue). Filtrage et badge en liste/lecture.
- **RF-70 — Gabarit qualité étape** (revue v1.4) : aide contextuelle dans l'éditeur — conseil « une action par étape », limite indicative de longueur de description, rappel photo — informative, jamais bloquante.
- **RF-71 — QR code d'accès** (revue v1.4) : chaque mode opératoire publié expose une vignette imprimable (PDF : titre, référence, QR pointant vers la page de lecture) pour affichage au poste ; consignes d'impression (taille min., zone de silence).
- **RF-72 — Mode lecture guidée** (revue v1.4) : sur mobile, option de lecture « une étape par écran » avec boutons Suivant/Précédent en zone pouce et indicateur de progression (étape n/N).
- **RF-73 — Retour terrain** (revue v1.4) : bouton « Signaler un problème sur cette étape » en lecture → entrée d'audit + notification à l'auteur ; les signalements sont consultables par l'auteur et l'admin.
- **RF-74 — Date de revue périodique** (revue v1.4) : champ « à revoir le » par document ; alerte visuelle en liste et lecture quand l'échéance est dépassée ; filtre « à revoir ». Un document jamais relu devient silencieusement faux — c'est le cœur du socle GED.
- **RF-75 — Responsable éditorial** (revue v1.4) : champ propriétaire du document, distinct de l'auteur d'une version ; affiché dans l'historique. *Implémenté : sélecteur à recherche parmi les comptes actifs (Prénom Nom) ; désactivation du responsable → ses MO passent « à revoir ».*
- **RF-76 — Obsolescence tracée** *(partiel : badge « à revoir » et garde-fou responsable implémentés ; lien successeur restant)* (revue v1.4) : un mode opératoire remplacé pointe vers son successeur (badge + lien) ; jamais de suppression silencieuse tant que la politique de conservation ne l'archive pas.
- **RF-77 — Statistiques de consultation** (revue v1.4) : vues et exports par mode opératoire exposés à l'auteur (l'API `/api/stats` existe en partie) — aide à prioriser les mises à jour.

### 1.4 Hors périmètre (V1)

- Workflow de relecture/validation à plusieurs niveaux ;
- Comparaison côte à côte de deux versions ou restauration d'une version antérieure ;
- Publication publique / partage par lien externe ;
- Application mobile native.

## 2. Utilisateurs et rôles

| Rôle | Droits |
|---|---|
| **Lecteur** | Consulter les modes opératoires publiés, rechercher, exporter |
| **Auteur** | Droits lecteur + créer, modifier, publier, versionner |
| **Administrateur** | Droits auteur + gestion des comptes et des rôles |

Les utilisateurs se connectent avec des **comptes maison** (email + mot de passe gérés par l'application). Une procédure de réinitialisation de mot de passe par email est prévue.

L'application est destinée à une **équipe interne** : pas d'inscription libre, les comptes sont créés par l'administrateur.

## 3. Exigences fonctionnelles

### 3.1 Comptes et accès

- **RF-1** — Connexion par email/mot de passe ; sessions persistantes (« rester connecté »).
- **RF-2** — Réinitialisation de mot de passe par email.
- **RF-3** — L'administrateur crée, désactive et change le rôle des comptes.

### 3.2 Création / édition d'un mode opératoire

- **RF-10** — Créer un mode opératoire avec titre, référence, description, catégorie.
- **RF-11** — Ajouter, réordonner (glisser-déposer), modifier et supprimer des étapes.
- **RF-12** — Pour chaque étape : saisir un titre et une description riche (mise en forme simple : gras, listes).
- **RF-13** — Importer des photos depuis l'appareil (appareil photo mobile ou fichiers) ; redimensionnement/compression côté client. *Implémenté : galerie OU appareil photo au choix (capture natif), uploads parallèles avec progression.*
- **RF-14** — Annoter les photos : flèches, rectangles, zones surlignées, texte ; dessin réalisé dans le navigateur.
- **RF-15** — Ajouter des pictogrammes d'indication par étape (attention, EPI, outil spécifique, etc.).
- **RF-16** — Enregistrement automatique en brouillon pendant l'édition. *Implémenté (autosave des métadonnées ~1 s après la frappe, badge « Enregistrement… »).*
- **RF-17** — Aperçu en temps réel de la mise en page pendant l'édition.

### 3.3 Publication et versions

- **RF-20** — Publier un mode opératoire : il passe de « brouillon » à « publié » et reçoit le numéro **V1**.
- **RF-21** — Toute modification puis publication crée **Vn+1** (V2, V3…). La numérotation est automatique.
- **RF-22** — L'historique des versions est visible (numéro, auteur, date) ; les versions publiées restent consultables.
- **RF-23** — Seule la dernière version publiée est proposée par défaut à la consultation.

### 3.4 Consultation

- **RF-30** — Liste des modes opératoires avec recherche (titre, référence) et filtres (catégorie, état).
- **RF-31** — Vue de lecture optimisée mobile : une étape par écran, navigation simple, photos plein écran avec zoom. *Implémenté : lecture guidée (boutons fixes en bas) + lightbox plein écran au tap sur une photo.*
- **RF-32** — Vue de lecture PC : présentation complète, navigation par sommaire.
- **RF-33** — Consultation hors ligne des modes opératoires déjà consultés (PWA + cache) — souhaitable, non bloquante pour le lot 1.

### 3.5 Export

- **RF-40** — Export d'un mode opératoire au format **`.docx`** (ouvrable dans Word/LibreOffice) comprenant l'en-tête (titre, référence, version, date), les étapes, descriptions, photos annotées et pictogrammes.
- **RF-41** — L'export est réservé aux versions publiées (défaut : dernière version), version choisie parmi l'historique.

## 4. Exigences non fonctionnelles

| ID | Exigence |
|---|---|
| RNF-1 | **Responsive** : interface utilisable du smartphone (~360 px) au grand écran. |
| RNF-2 | **PWA** : installable sur mobile et PC (manifest + service worker). |
| RNF-3 | **Performance** : chargement initial < 3 s, photos optimisées (WebP, compression). |
| RNF-4 | **Sécurité** : mots de passe hachés (bcrypt/argon2), HTTPS obligatoire, contrôles d'accès côté serveur. |
| RNF-5 | **Accessibilité** : bonnes pratiques WCAG de base (contrastes, navigation clavier, textes alternatifs des photos) + **mode atelier** (v1.4) : contraste renforcé, cibles tactiles ≥ 48 px, lecture debout/gants. |
| RNF-6 | **Sauvegarde** : sauvegardes quotidiennes de la base et des fichiers. |
| RNF-7 | **Langue** : interface en français. |
| RNF-8 | **Scalabilité** : conçu pour une équipe type de 10 à 200 utilisateurs. |

## 5. Architecture technique envisagée

Application classique en trois tiers, dans un monorepo :

- **Frontend** : SPA React + TypeScript, framework CSS utilitaire (Tailwind), éditeur d'annotations photo en canvas. PWA via service worker.
- **Backend** : API REST Node.js avec **SQLite** (`better-sqlite3`) pour le lot 1 — adapté à un déploiement sur conteneur unique ; montée vers PostgreSQL possible dans un lot ultérieur.
- **Stockage** : métadonnées en base ; fichiers binaires (photos) en système de fichiers du conteneur, sauvegardés quotidiennement.
- **Export DOCX** : génération côté serveur à partir d'un gabarit (librairie `docx` pour Node).

> Le choix définitif des outils pourra être ajusté lors d'une étude technique, en gardant les exigences de ce document comme référence.

## 6. Livrables

1. Application web (PWA) déployée sur un environnement de recette puis de production ;
2. Code source versionné dans le dépôt GitHub du projet ;
3. Documentation : guide utilisateur et instructions de déploiement ;
4. Jeu de données d'exemple (quelques modes opératoires industriels type).

## 7. Découpage en lots

| Lot | Contenu |
|---|---|
| **Lot 1 — MVP** | Authentification, création/édition (étapes, descriptions, photos), publication et numérotation simple des versions, consultation mobile/PC, recherche, export DOCX |
| **Lot 2** | Annotations photos + pictogrammes, consultation hors ligne (PWA), prévisualisation temps réel |
| **Lot 3** | Historique de versions consultable, exports versionnés, ergonomie avancée (glisser-déposer, catégories personnalisées) |
| **Lot 4 (options)** | Statistiques d'usage, workflow de validation, API publique |
| **Lot 5 — socle GED** (v1.4) | RF-70 (gabarit qualité), RF-74 (revue périodique), RF-75 (responsable), RF-76 (obsolescence), RF-77 (stats de consultation) — le cycle de vie documentaire **avant** l'arborescence RF-62 |
| **Lot 6 — terrain** (v1.4) | RF-71 (QR d'accès), RF-72 (lecture guidée mobile), RF-73 (retour terrain), RNF-5 mode atelier |

## 8. Critères d'acceptation (lot 1)

> **État lot 1 : ✅ atteint sur beta** (création multi-étapes avec photos sur smartphone, consultation PC/mobile, export .docx, V1→V2 dans l'historique, PWA installable). Suites : voir [roadmap.md](roadmap.md).

- Un auteur peut créer un mode opératoire de 10 étapes avec photos depuis un smartphone, sans blocage.
- Un lecteur peut le consulter sur mobile et PC, et l'exporter en `.docx`.
- Deux publications successives produisent V1 puis V2, visibles dans l'historique.
- L'application est installable comme app sur mobile (PWA).
