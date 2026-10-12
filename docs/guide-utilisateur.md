 Guide utilisateur — Modop

*Comment utiliser Modop au quotidien : consulter, créer, publier, administrer. Le guide d'installation est dans [guide-test-proxmox.md](guide-test-proxmox.md).*

---

## Se connecter

1. Ouvrez l'URL de votre Modop (ex. `http://192.168.1.56:3000` ou l'adresse du tunnel).
2. Saisissez votre email et mot de passe → **Se connecter**.
3. Sur mobile : « Ajouter à l'écran d'accueil » installe l'application (PWA).

**Mot de passe oublié ?** Contactez votre administrateur : il génère un mot de passe temporaire (voir Comptes).

## Thème clair / sombre

Bouton **icône soleil / lune** dans la barre du haut (et sur la page de connexion). Votre choix est mémorisé sur l'appareil, et la barre du navigateur mobile suit le thème.

## Consulter les modes opératoires

### La liste
- **Rechercher** : le champ cherche dans les titres, les références **et le texte des étapes**.
- **Filtres** : par famille (menu déroulant alimenté automatiquement) et par état (publiés / brouillons).
- Chaque carte affiche : titre, référence, badges famille/type, version (V1, V2…) ou « brouillon ».

### Lire un mode opératoire
- Toutes les étapes s'affichent **à la suite** — on défile naturellement.
- Le **menu « Aller à l'étape… »** (en haut, toujours visible) saute directement à une étape.
- Les pictogrammes d'avertissement apparaissent en couleur sous le titre de l'étape.
- Les photos s'affichent à la taille et la position choisies par l'auteur ; les annotations (flèches, zones, textes) sont dessinées dessus.
- **« ⬇ Exporter en .docx »** télécharge la version publiée (ouvrable dans Word/LibreOffice).

### Hors-ligne
Un mode opératoire déjà consulté reste **lisible sans réseau** (PWA) — utile en atelier.

## Créer / modifier (rôle auteur ou admin)

### Créer
1. **« + Créer »** dans la liste.
2. Titre, référence (unique, ex. `MO-001`), **famille** (ex. Mécanique) et **type** (ex. Maintenance), description → **Créer**.

### Éditer — les étapes
- **« + Ajouter une étape »** : les étapes apparaissent **repliées** (titre seul).
- Ouvrir une étape : **cliquer sur son titre** ou le bouton **▸/▾** (plus visible) ; le focus dans le titre ne l'ouvre plus.
- **« Tout ouvrir » / « Tout replier »** et menu **« Aller à… »** dans le bandeau du haut (toujours visible).
- **Réordonner** : glissez la poignée **⠿** à gauche du titre, ou boutons **▲/▼**.
- Chaque étape : titre, description, pictogrammes, photos.
- **Métadonnées repliées** : en édition, seul le titre + la référence restent visibles ; bouton **✉ Détails** pour éditer famille/type/description.

### Pictogrammes
Boutons préréglés (Attention, Danger, EPI, Risque électrique, Point chaud, Outillage, Information) — cliquez pour activer/désactiver. Chaque picto accepte une **couleur** (pastilles) et un **texte libre** modifiable.

### Photos
1. **« 📷 Photo(s)… »** : depuis l'appareil ou l'appareil photo du téléphone (compression automatique) — **plusieurs images peuvent être sélectionnées d'un coup**.
2. **Taille** : S (35 %) / M (60 %) / L (85 %) / Plein — appliqué en direct, sauvegardé.
3. **Position** : ⯇ gauche / ≡ centre / ⯈ droite.
4. **Annoter** : outil **Flèche**, **Zone** ou **Texte** :
   - flèche/zone : **cliquez le point de départ, puis le point d'arrivée** (l'aperçu suit la souris) ;
   - texte : cliquez sur la photo, tapez, **Entrée** ;
   - sans outil actif : cliquez une forme pour la sélectionner, **glissez pour la déplacer**, ou supprimez-la ;
   - couleurs : 4 pastilles.
5. Supprimer une photo : 🗑.

#### Header d'édition (suit le défilement)

Le header affiche le **nom de l'étape active**, **Publier**, **▸/▾** (tout réduire/développer) et **+** (palette d'insertion). La palette s'ouvre en appuyant sur **+** : **📷** photos, **➶** flèche, **▭** zone, **T** texte, pastilles de couleur et pictos (Attention, Danger, EPI…). Tout s'applique à l'étape dont le nom est affiché (ouvrir une étape en cliquant son titre la rend active). Après chaque pose de forme, l'outil se désactive.

#### Canevas d'étape (photos + formes)

- La zone d'édition **s'adapte automatiquement** à la hauteur et à la position des images : tout reste visible, même une image placée en bas.
- **Clic sur une image ou une forme** : sélectionne cet objet (Maj-clic pour ajouter à la sélection).
- **Glisser sur le fond** : dessine un **rectangle de sélection** (appliqué au relâchement).
- **Clic ou tap ailleurs** (fond du canevas, autre zone de l'éditeur) : **désélectionne** l'image ou la forme sélectionnée.
- **En lecture** : le sélecteur d'étape suit la même logique que l'éditeur — l'étape active est marquée **▶**, choisir une étape y défile en douceur.
- **Remontées terrain (auteur)** : le lien **« ⚑ Terrain »** du lecteur ouvre la page dédiée — **À traiter** (avec Corriger l'étape / Résoudre) et l'**historique des signalements traités**. La page de lecture n'affiche plus cet historique.
- **Lecture guidée** : les boutons **Précédent / Suivant / Terminé** restent accrochés en bas de l'écran pendant le défilement.
- **En lecture** : cliquez/touchez une photo pour l'ouvrir **plein écran** (Échap ou toucher le fond pour fermer, pincez pour zoomer).
- **Titre/description/famille…** : enregistrés automatiquement ~1 s après la dernière frappe (badge « Enregistrement… » dans le bandeau).
- **Envoi de plusieurs photos** : parallèle, avec compteur de progression ; une photo en échec n'interrompt pas les autres.
- **En lecture** : cliquez/touchez une photo pour l'ouvrir **plein écran** (Échap ou toucher le fond pour fermer, pincez pour zoomer).
- **Titre/description/famille…** : enregistrés automatiquement ~1 s après la dernière frappe (badge « Enregistrement… » dans le bandeau).
- **Envoi de plusieurs photos** : parallèle, avec compteur de progression ; une photo en échec n'interrompt pas les autres.
- **Glisser un objet** : le déplace (le groupe complet si plusieurs sélectionnés) ; relâcher dans la **colonne de droite** supprime.
- **Poignée en bas à droite d'une image** : redimensionne.
- Les positions sont enregistrées dans un repère fixe : vos objets restent exactement où vous les posez.

### Publier
- **« Publier V1 »** exige au moins une étape ; chaque republication crée **V2, V3…** (snapshot immuable).
- La liste des versions (auteur, date) est consultable ; une version peut être **restaurée** (l'état d'alors remplace le brouillon, l'historique reste intact).
- **Dupliquer** un mode opératoire : copie complète en brouillon (référence `-COPIE`), photos indépendantes.

### Supprimer
Bouton « Supprimer » dans la liste → **confirmation explicite** (tout est définitivement supprimé : étapes, photos, versions).

## Administrer (rôle admin)

### Comptes (nav « Comptes »)
- **Créer** : email + mot de passe (8 caractères min.) + rôle.
- **Rôle** : Lecteur (consulte) / Auteur (crée) / Admin (gère tout).
- **Désactiver** : sessions révoquées immédiatement, login refusé. Réactivation possible.
- **Réinitialiser le mot de passe** : un mot de passe temporaire est affiché **une seule fois** — communiquez-le de façon sécurisée.
- Protection : impossible de modifier son propre rôle ou statut.

### Déploiement (nav « Déploiement »)
- Version chargée (commit, auteur, date) + 5 derniers commits.
- **« Mettre à jour depuis GitHub »** : sauvegarde de la base → récupération du code → build → relance. Le site est **indisponible 1-2 minutes** (502 Cloudflare transitoire), puis revient seul — le journal défile en direct.
- **« Retour arrière »** : restaure la dernière sauvegarde de la base (10 conservées).
- En cas d'échec, le message indique la marche à suivre.

## Dépannage rapide

| Problème | Solution |
|---|---|
| Identifiants invalides | Vérifiez la saisie ; 10 essais ratés = 15 min de blocage |
| « Serveur momentanément injoignable » | Mise à jour en cours : patientez 1-2 min |
| Photo qui ne s'affiche pas | Rechargez (Ctrl+F5) ; sinon contactez l'admin |
| Annotation qui ne reste pas | Un bandeau d'erreur rouge s'affiche : signalez son message à l'admin |
