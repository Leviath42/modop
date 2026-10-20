# Guide utilisateur — Modop

*Comment utiliser Modop au quotidien : consulter, créer, publier, administrer. Le guide d'installation est dans [guide-test-proxmox.md](guide-test-proxmox.md).*

---

## Accueil

Les modes opératoires sont regroupés : **Publié** (avec compteur) puis **Brouillon**, et à l'intérieur de chaque état **par famille** (ordre alphabétique, « Sans famille » pour les autres). La recherche, les filtres et le tri s'appliquent avant le regroupement.

**Cliquez un en-tête d'état ou de famille pour le replier/déplier** (chevron ▸, compteur conservé) — vos replis sont mémorisés entre les visites.

**Filtres** (bouton « Filtres ») : par état, famille, tri, et **« À revoir »** (documents dont la date de revue est dépassée — ou sans date de revue, selon les paramètres).

**Rechercher** : la loupe de la barre du haut ouvre l'accueil avec le champ de recherche prêt à saisir ; le champ cherche dans les titres, les références **et le texte des étapes**.

## Se connecter

1. Ouvrez l'URL de votre Modop (ex. `http://192.168.1.56:3000` ou l'adresse du tunnel).
2. Saisissez votre email et mot de passe → **Se connecter**.
3. Sur mobile : « Ajouter à l'écran d'accueil » installe l'application (PWA).

**Mot de passe oublié ?** Contactez votre administrateur : il génère un mot de passe temporaire (voir Comptes).

**Changer son mot de passe** : page Profil, ancien + nouveau (8 caractères min.).

## Thème clair / sombre

Bouton **icône soleil / lune** dans la barre du haut (et sur la page de connexion). Votre choix est mémorisé sur l'appareil, et la barre du navigateur mobile suit le thème.

## Consulter (tous les rôles)

### La liste

- **Rechercher** : le champ cherche dans les titres, les références **et le texte des étapes**.
- Chaque carte : titre, référence, ✎ (édition, auteurs/admins).

### Lire un mode opératoire

- Toutes les étapes s'affichent **à la suite** — on défile naturellement.
- Le **sélecteur d'étape** (en haut, toujours visible) suit la même logique que l'éditeur : l'étape affichée est marquée **▶**, choisir une étape y défile en douceur.
- **Versions** : la lecture ouvre par défaut la **dernière version PUBLIÉE** — le brouillon en cours n'est jamais montré au poste. Le sélecteur de version (V1, V2…) consulte n'importe quelle version publiée avec son **changelog** ; l'option **« Brouillon en cours »** (auteurs/admins uniquement) affiche le brouillon de travail avec un bandeau d'avertissement.
- Les pictogrammes d'avertissement apparaissent en couleur sous le titre de l'étape ; un document en retard de revue est signalé par une **alerte « à revoir » qui explique la raison** (date dépassée, avec la date, ou absence de date de revue) et propose aux auteurs le bouton **« Mettre à jour la revue »** (l'éditeur s'ouvre directement sur le champ).
- La ligne d'information sous le titre affiche la **date de revue** (« À revoir le jj/mm/aaaa ») et le **responsable** (Prénom Nom) de la version publiée consultée.
- Les photos s'affichent à la taille et la position choisies par l'auteur ; les annotations (flèches, zones, textes) sont dessinées dessus.
- **Cliquez/touchez une photo** : elle s'ouvre **plein écran** (Échap ou toucher le fond pour fermer, pincez pour zoomer).
- **Signaler un problème** : bouton « Signaler un problème sur cette étape » sous chaque étape — votre message va aux auteurs.
- **« ⬇ Exporter en .docx »** (auteurs/admins, dans l'entête avec les autres outils) télécharge la version affichée (ouvrable dans Word/LibreOffice) — le canevas composé (photos positionnées + formes + textes) reproduit fidèlement la lecture.
- **« Éditer »** (auteurs/admins) ouvre directement l'éditeur depuis la lecture.
- Le bouton **↑** flottant en bas à droite ramène au **début du document**, visible en toute position.
- **⇥ Guidé** : lecture **une étape par écran** (mobile au poste) — boutons Précédent / Suivant / Terminé accrochés en bas de l'écran, progression n/N.
- **QR** : vignette imprimable (titre + référence + QR vers la page de lecture) à afficher au poste.

### Hors-ligne

Un mode opératoire déjà consulté reste **lisible sans réseau** (PWA) — utile en atelier.

### Remontées terrain (auteurs/admins)

Le lien **« ⚑ Terrain »** du lecteur ouvre la page dédiée : **À traiter** (avec « Corriger l'étape » et « ✓ Résoudre ») et l'**historique des signalements traités** (résolveur, date). La page de lecture reste épurée : elle n'affiche pas cet historique.

## Créer / modifier (rôle auteur ou admin)

### Créer

1. **« + »** dans la liste.
2. Titre, **référence unique** (vérifiée pendant la frappe — deux documents ne peuvent pas partager le même numéro, majuscules/minuscules ignorées), **famille** (liste de recherche parmi les familles existantes, saisie libre possible) et **type** (ex. Maintenance), description → **Créer**.
3. Dès la création, la **date « À revoir le » est préremplie** (J+30 par défaut, voir Paramètres) et le **responsable se choisit par recherche** (Prénom, Nom ou email) — les deux valeurs sont enregistrées avec le document, et restent affichées au passage en édition.

### L'interface d'édition

Le **bandeau** (toujours visible en haut) affiche : titre + référence, badge « Enregistrement… », bouton **Détails** (métadonnées : titre, famille, type, description, **À revoir le**, **Responsable**), **Publier**, ▸/▾ (tout ouvrir/replier), et le **sélecteur d'étape active**.

La **barre d'outils** est **fixée en bas de l'écran** (zone pouce, mobile comme PC) :

**+ Étape** | **Photos** | **Formes** (flèche / zone / texte) | **Style** | **⚠ Indications** — *actions contextuelles à droite*

- Tout s'applique à l'**étape active** — la sélection suit automatiquement vos actions (cliquer dans le canevas d'une étape ou taper dans ses champs la rend active, marqueur ▶ dans le sélecteur).
- Le bouton **Formes** affiche l'outil en cours ; après chaque pose, l'outil se désarme. **Raccourcis clavier** (PC) : E étape, P photos, F formes, A flèche, R zone, T texte, S style, I indications.
- À droite apparaissent, selon le contexte : **Supprimer l'étape**, **🗑 Objets (n)**, **Recadrer** (photo sélectionnée) et **Annuler rognage**.

### Les étapes

- **« + Étape »** ajoute une étape ; les étapes apparaissent **repliées** (titre seul).
- Ouvrir une étape : **cliquer sur son titre** ou le bouton ▸/▾.
- **Réordonner** : glissez la poignée **⠿** à gauche du titre (au doigt aussi).
- Chaque étape : titre, description, pictogrammes, photos. **Autosave** : titre/description/famille… enregistrés ~1 s après la dernière frappe.

### Photos

1. **« Photos »** : au choix **« Depuis la galerie »** (plusieurs images d'un coup) ou **« Prendre une photo »** (appareil photo du téléphone, capture directe). Le bandeau « Cette étape n'a pas de photo » offre aussi ces deux actions.
2. Envoi **parallèle** avec compteur de progression ; une photo en échec n'interrompt pas les autres.
3. Supprimer une photo : sélectionnez-la puis 🗑, ou glissez-la vers la corbeille.

### Annoter (canevas d'étape)

Le canevas regroupe photos et formes dans le même espace :

- **Poser une forme** : outil **Flèche** ou **Zone** → **cliquez-glissez** du départ à l'arrivée (un clic sans glisser n'insère rien).
- **Outil Texte** → cliquez l'emplacement : un champ **fidèle au résultat** apparaît (même cadre, couleur et taille ; vide = simple barre clignotante, la largeur suit la saisie). **Entrée valide, Échap annule** ; cliquer ailleurs valide aussi ; cliquer un texte posé **l'édite** (le vider le supprime).
- **Style** : pastille de la couleur en cours → 8 couleurs et **épaisseur du trait** (1–10, défaut réglable par l'admin).
- **Sélectionner** : cliquez un objet (Maj-clic pour ajouter) ; glissez pour un rectangle de sélection — il démarre **même au-dessus d'une photo**. Les rectangles se saisissent **par leur contour** (la surface laisse passer le clic vers ce qui est derrière). **Clic ou tap ailleurs** désélectionne.
- **Déplacer** : glissez l'objet — un clic simple ne le déplace pas (seuil de 6 px), et la flèche suit exactement le geste.
- **Supprimer** : glissez la sélection vers la **corbeille** (carré en haut à gauche, apparaît pendant le drag), ou bouton **🗑 Objets (n)** de la barre.
- **Redimensionner une photo** : poignée en bas à droite de l'image.
- **Recadrer une photo** : sélectionnez-la (double-clic) → bouton **Recadrer** dans la barre → cadretez (glissez le rectangle, poignée en bas à droite pour redimensionner) → **Recadrer**. La photo rognée **reste au même endroit, à la même taille** ; **Annuler rognage** la restaure (l'original n'est jamais perdu pendant la session d'édition).
- Les positions sont enregistrées dans un repère fixe : vos objets restent exactement où vous les posez.

### Indications (pictogrammes)

Bouton **⚠ Indications** : Attention, Danger, EPI, Risque électrique, Point chaud, Outillage, Information — cliquez pour activer/désactiver (compteur sur le bouton).

### Publier et versions

- **« Publier »** exige au moins une étape ; la première publication crée **V1**, chaque republication **V2, V3…** (snapshot immuable). Un **changelog** des modifications vous est demandé. **Publication refusée si la date de revue est dépassée** — mettez-la à jour dans les détails.
- **« Abandonner le brouillon »** (bandeau) : remplace le brouillon en cours par la dernière version publiée — le recours après un brouillon raté, sans rien retaper (confirmation demandée).
- L'historique des versions (numéro, auteur, date, changelog) est consultable dans le lecteur ; une version peut être **restaurée** (l'état d'alors remplace le brouillon, l'historique reste intact).
- **Dupliquer** : copie complète en brouillon (référence `-COPIE`), photos indépendantes.
- **Revue périodique** : champ **« À revoir le »** dans les détails — vide à l'ouverture d'un MO sans date, il est **prérempli à J+30** (délai paramétrable, voir Paramètres) ; passé l'échéance, l'alerte « à revoir » apparaît en liste (avec la raison par document) et en lecture, et le filtre « À revoir » le remonte.
- **Responsable** : champ à recherche dans les détails — tapez quelques lettres du **Prénom, du Nom ou de l'email**, choisissez parmi les comptes actifs (Prénom Nom) ; la recherche fonctionne pour tous les auteurs. Si le compte responsable est désactivé, ses MO passent automatiquement **à revoir** pour réattribution.

### Supprimer un mode opératoire (admin uniquement)

Section en bas de l'éditeur, double confirmation avec **case à cocher décochée par défaut** — tout est définitivement supprimé (étapes, photos, versions).

## Administrer (rôle admin)

### Comptes (nav « Comptes »)

- **Créer** : Prénom, Nom, email + mot de passe (8 caractères min.) + rôle.
- **✎ Modifier un compte** : fenêtre d'édition complète — Prénom, Nom, rôle et activation.
- **Rôle** : Lecteur (consulte) / Auteur (crée) / Admin (gère tout).
- **Désactiver** : sessions révoquées immédiatement, login refusé ; réactivation possible. Les MO dont il est responsable passent « à revoir ».
- **Réinitialiser le mot de passe** : un mot de passe temporaire est affiché **une seule fois** — communiquez-le de façon sécurisée.
- Protection : impossible de modifier son propre rôle ou statut.

### Paramètres (nav « Paramètres »)

Options appliquées **immédiatement** à toute l'application :

- **Sans date de revue = à revoir** (activé par défaut) ;
- **Délai de revue par défaut** en jours (défaut 30) — préremplit « À revoir le » d'un MO sans date, à J+délai ;
- **Brouillons visibles par les lecteurs** (désactivé par défaut) ;
- **Épaisseur de trait par défaut** des formes (1–10, défaut 5).

La page **Comptes** affiche aussi une alerte avec le nombre de modes opératoires **sans responsable**.

### Statistiques (nav « Statistiques »)

Chiffres clés (MO, publiés, comptes actifs, consultations, exports, connexions), **les plus consultés / exportés** (titre + référence), auteurs les plus actifs, activité récente, et le **journal d'audit** (200 dernières actions).

### Déploiement (nav « Déploiement »)

- Version chargée (commit, auteur, date) + 5 derniers commits.
- **« Mettre à jour depuis GitHub »** : sauvegarde de la base → récupération du code → build → relance. Le site est **indisponible 1-2 minutes**, puis revient seul — le journal défile en direct.
- **« Retour arrière »** : restaure la dernière sauvegarde de la base (10 conservées).
- En cas d'échec, le message indique la marche à suivre.

## Dépannage rapide

| Problème | Solution |
|---|---|
| Identifiants invalides | Vérifiez la saisie ; 10 essais ratés = 15 min de blocage |
| « Serveur momentanément injoignable » | Mise à jour en cours : patientez 1-2 min |
| Photo qui ne s'affiche pas | Rechargez (Ctrl+F5) ; sinon contactez l'admin |
| Annotation qui ne reste pas | Un bandeau d'erreur rouge s'affiche : signalez son message à l'admin |
