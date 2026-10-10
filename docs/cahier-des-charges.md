# Cahier des charges — Modop

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
- **RF-13** — Importer des photos depuis l'appareil (appareil photo mobile ou fichiers) ; redimensionnement/compression côté client.
- **RF-14** — Annoter les photos : flèches, rectangles, zones surlignées, texte ; dessin réalisé dans le navigateur.
- **RF-15** — Ajouter des pictogrammes d'indication par étape (attention, EPI, outil spécifique, etc.).
- **RF-16** — Enregistrement automatique en brouillon pendant l'édition.
- **RF-17** — Aperçu en temps réel de la mise en page pendant l'édition.

### 3.3 Publication et versions

- **RF-20** — Publier un mode opératoire : il passe de « brouillon » à « publié » et reçoit le numéro **V1**.
- **RF-21** — Toute modification puis publication crée **Vn+1** (V2, V3…). La numérotation est automatique.
- **RF-22** — L'historique des versions est visible (numéro, auteur, date) ; les versions publiées restent consultables.
- **RF-23** — Seule la dernière version publiée est proposée par défaut à la consultation.

### 3.4 Consultation

- **RF-30** — Liste des modes opératoires avec recherche (titre, référence) et filtres (catégorie, état).
- **RF-31** — Vue de lecture optimisée mobile : une étape par écran, navigation simple, photos plein écran avec zoom.
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
| RNF-5 | **Accessibilité** : bonnes pratiques WCAG de base (contrastes, navigation clavier, textes alternatifs des photos). |
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

## 8. Critères d'acceptation (lot 1)

- Un auteur peut créer un mode opératoire de 10 étapes avec photos depuis un smartphone, sans blocage.
- Un lecteur peut le consulter sur mobile et PC, et l'exporter en `.docx`.
- Deux publications successives produisent V1 puis V2, visibles dans l'historique.
- L'application est installable comme app sur mobile (PWA).
