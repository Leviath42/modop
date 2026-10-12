# Guide utilisateur — Modop

*Comment utiliser Modop au quotidien : consulter, créer, publier, administrer. Le guide d'installation est dans [guide-test-proxmox.md](guide-test-proxmox.md).*

---

## Accueil

Les modes opératoires sont regroupés : **Publié** (avec compteur) puis **Brouillon**, et à l'intérieur de chaque état **par famille** (ordre alphabétique, « Sans famille » pour les autres). La recherche, les filtres et le tri s'appliquent avant le regroupement.

**Cliquez un en-tête d'état ou de famille pour le replier/déplier** (chevron ▸, compteur conservé) — vos replis sont mémorisés entre les visites.

**Filtres** (bouton « Filtres ») : par état, famille, tri, et **« À revoir »** (documents dont la date de revue est dépassée).

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
- **Versions** : le sélecteur de version (V1, V2…) consulte n'importe quelle version publiée, avec son **changelog** ; la dernière publiée est proposée par défaut.
- Les pictogrammes d'avertissement apparaissent en couleur sous le titre de l'étape ; un badge **« à revoir »** signale un document en retard de revue.
- Les photos s'affichent à la taille et la position choisies par l'auteur ; les annotations (flèches, zones, textes) sont dessinées dessus.
- **Cliquez/touchez une photo** : elle s'ouvre **plein écran** (Échap ou toucher le fond pour fermer, pincez pour zoomer).
- **Signaler un problème** : bouton « Signaler un problème sur cette étape » sous chaque étape — votre message va aux auteurs.
- **« ⬇ Exporter en .docx »** télécharge la version publiée (ouvrable dans Word/LibreOffice).
- **⇥ Guidé** : lecture **une étape par écran** (mobile au poste) — boutons Précédent / Suivant / Terminé accrochés en bas de l'écran, progression n/N.
- **QR** : vignette imprimable (titre + référence + QR vers la page de lecture) à afficher au poste.

### Hors-ligne

Un mode opératoire déjà consulté reste **lisible sans réseau** (PWA) — utile en atelier.

### Remontées terrain (auteurs/admins)

Le lien **« ⚑ Terrain »** du lecteur ouvre la page dédiée : **À traiter** (avec « Corriger l'étape » et « ✓ Résoudre ») et l'**historique des signalements traités** (résolveur, date). La page de lecture reste épurée : elle n'affiche pas cet historique.

## Créer / modifier (rôle auteur ou admin)

### Créer

1. **« + »** dans la liste.
2. Titre, référence (unique, ex. `MO-001`), **famille** (ex. Mécanique) et **type** (ex. Maintenance), description → **Créer**.

### L'interface d'édition

Le **bandeau** (toujours visible en haut) affiche : titre + référence, badge « Enregistrement… », bouton **Détails** (métadonnées : titre, famille, type, description, **À revoir le**, **Responsable**), **Publier**, ▸/▾ (tout ouvrir/replier), et le **sélecteur d'étape active**.

Juste dessous, la **barre d'outils** (elle aussi toujours visible, collée sous le bandeau) :

**+ Étape** | **Photos** · **Flèche** · **Zone** · **Texte** · **Couleur** | **⚠ Indications** | *Actions*

- Tout s'applique à l'**étape active** — la sélection suit automatiquement vos actions (cliquer dans le canevas d'une étape ou taper dans ses champs la rend active, marqueur ▶ dans le sélecteur).
- L'outil en cours est surligné ; après chaque pose de forme, l'outil se désactive.

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

- **Poser une forme** : outil **Flèche** ou **Zone** → cliquez le départ puis l'arrivée ; outil **Texte** → cliquez, **tapez sur place** (l'input apparaît à l'endroit cliqué), Entrée valide, Échap annule.
- **Couleur** : le bouton pastille affiche la couleur courante → cliquez pour choisir parmi 4.
- **Sélectionner** : cliquez un objet (Maj-clic pour ajouter à la sélection) ; glissez sur le fond pour un rectangle de sélection. **Clic ou tap ailleurs** désélectionne.
- **Déplacer** : glissez l'objet — un clic simple ne le déplace pas (seuil de 6 px), et la flèche suit exactement le geste.
- **Supprimer** : glissez la sélection vers la **corbeille** (carré en haut à gauche, apparaît pendant le drag), ou bouton **🗑 Objets (n)** de la barre.
- **Redimensionner une photo** : poignée en bas à droite de l'image.
- Les positions sont enregistrées dans un repère fixe : vos objets restent exactement où vous les posez.

### Indications (pictogrammes)

Bouton **⚠ Indications** : Attention, Danger, EPI, Risque électrique, Point chaud, Outillage, Information — cliquez pour activer/désactiver (compteur sur le bouton).

### Publier et versions

- **« Publier »** exige au moins une étape ; la première publication crée **V1**, chaque republication **V2, V3…** (snapshot immuable). Un **changelog** des modifications vous est demandé.
- L'historique des versions (numéro, auteur, date, changelog) est consultable dans le lecteur ; une version peut être **restaurée** (l'état d'alors remplace le brouillon, l'historique reste intact).
- **Dupliquer** : copie complète en brouillon (référence `-COPIE`), photos indépendantes.
- **Revue périodique** : champ **« À revoir le »** dans les détails — passé l'échéance, le badge « à revoir » apparaît en liste et en lecture, et le filtre « À revoir » le remonte.
- **Responsable** : champ à recherche dans les détails — tapez quelques lettres, choisissez parmi les comptes actifs (Prénom Nom). Si le compte responsable est désactivé, ses MO passent automatiquement **à revoir** pour réattribution.

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
