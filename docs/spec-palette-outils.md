# Palette d'outils d'édition — Spécification ergonomique & technique

**Contexte** : application de création de modes opératoires. Stack : React (Vite, SPA pure) + react-router-dom, servie en statique par une API Express.
**Périmètre** : texte riche, étapes numérotées, images, insertions graphiques (texte sur/autour de l'image), et extensions.

---

## 1. Principes directeurs

1. **Le contenu d'abord.** La palette ne doit jamais masquer le document : elle se replie, se contextualise, disparaît quand elle est inutile.
2. **Progressivité.** 80 % des actions = 20 % des outils : une palette courte visible, le reste dans des panneaux secondaires ("Plus").
3. **Contexte plutôt que mode.** L'outil apparaît là où l'utilisateur agit (sélection, bloc actif), pas dans un mode global à activer/désactiver.
4. **Parité desktop/mobile, pas duplication.** Mêmes outils, géométries différentes ; jamais deux logiques mentales.
5. **Annulation universelle.** Chaque manipulation (recadrage, flèche, réordonnancement) doit être dans l'historique undo/redo.

---

## 2. Inventaire des outils

### 2.1 Blocs structurels
| Outil | Rôle | Priorité |
|---|---|---|
| Étape numérotée | Unité de base du mode opératoire | P0 — cœur du produit |
| Sous-étape / retrait | Hiérarchie optionnelle | P1 |
| Titre de section | Découpage visuel | P0 |
| Avertissement / précaution | Encart danger, EPI, point de vigilance | P0 (métier) |
| Note / astuce | Encart informatif | P1 |
| Tableau | Données, tolérances, couples | P1 |
| Séparateur | Respiration visuelle | P2 |

### 2.2 Texte riche (par bloc)
Gras, italique, souligné · listes · titres internes · lien · surlignage · commentaire/annotation · variables dynamiques (référence produit, version, date) — P1.

### 2.3 Médias & graphique
| Outil | Rôle | Priorité |
|---|---|---|
| Import image (upload, capture, galerie) | Photo de l'opération | P0 |
| Insertion de formes | Flèches, cercles, rectangles, numéros de repère | P0 |
| Texte sur image | Légendes et callouts positionnés | P0 |
| Ligne/chemin de geste | Sens de rotation, mouvement | P1 |
| Masquage/floutage | Cacher visages, données sensibles | P2 |
| Recadrage/pivot | Post-traitement léger | P1 |

### 2.4 Réordonnancement
Drag & drop des étapes (desktop), poignée "hamburger" + glisser (mobile), avec réaffectation automatique des numéros d'étapes.

---

## 3. Architecture de la palette — barre basse fixe unifiée

**Modèle inspiré de Figma (barre basse d'outils), de la capture d'écran Windows (outils contextuels compacts à frappe) et d'Obsidian (ruban + palette de commandes).**

### 3.1 Barre basse fixe (desktop **et** mobile — cœur du système)

Une barre ancrée en bas de l'écran, identique conceptuellement sur les deux plateformes, persistante et hors de la zone de frappe :

| Zone | Contenu | Référence |
|---|---|---|
| Gauche — Structure | Étape +, Image, Formes, Encarts | Figma : actions de création groupées |
| Centre — Outils extensibles | Bouton actif "explosé" : sélectionner un outil ouvre son **panneau extensible** au-dessus de la barre (formes, encarts, variables) | Obsidian : flyout menus |
| Droite — Historique & Plus | Undo/Redo, ⋯ (Plus) | universel |

**Règles ergonomiques de la barre** :
1. **8 boutons visibles maximum** (limite cognitive + largeur mobile en paysage).
2. **Extensibilité par flyout**, pas par navigation : un appui sur "Formes" fait surgir un panneau vertical/arc au-dessus du bouton ; l'outil actif reste affiché dans le bouton parent (icône de l'outil en cours, à la Figma).
3. **État de l'outil dans le bouton** : le bouton affiche l'outil actif du groupe (ex. "flèche" quand la flèche est sélectionnée), pas une icône générique.
4. **Auto-repli** : le flyout se referme à la sélection d'un outil (avec ré-affichage possible via re-clic) ou sur Échap.
5. **Contextualité par mutation, pas par addition** : la barre ne change pas de place ni de nombre de boutons — seuls les flyouts changent (image sélectionnée → le bouton "Formes" devient actif et propose flèches/cercles/repères/texte).
6. **Frappe clavier** : les outils ont des touches mnémoniques (F = formes, T = texte, A = flèche…) visibles dans les tooltips, à la Figma ; Entrée/Échap valident/annulent.

### 3.2 Compléments desktop

1. **Barre flottante de sélection de texte** (mise en forme : gras, italique, listes, lien) — apparaît à la sélection, se ferme sinon. La barre basse reste inchangée.
2. **Palette de commandes** (Ctrl+K, à l'Obsidian) : accès clavier à tous les outils, y compris rares — remplace le panneau latéral "Insertions".
3. **Rail gauche** (escamotable) : numéros d'étapes + navigation du document, jamais d'outils d'édition.
4. Cibles ≥ 40×40 px.

### 3.3 Compléments mobile

1. La barre basse **se place au-dessus du clavier système** quand il est ouvert (glissement animé, pas de saut) ; un appui sur "Étape +" referme le clavier.
2. Flyouts mobiles : **bottom sheet demi-hauteur** ancrée au-dessus de la barre plutôt que popover flottant (stabilité, zone pouce).
3. **Barre de formatage de texte** intégrée à la barre basse quand une sélection de texte existe : les boutons Structure cèdent temporairement leur place à Gras/Italique/Liste (mutation des boutons, pas ajout).
4. **Image sélectionnée → flyout plein écran annotable** (Formes / Texte / Filtres en onglets dans la barre basse) avec undo local.
5. **Gestes** : appui long sur une étape = menu (dupliquer, déplacer, supprimer) ; glisser la poignée = réordonner ; pincer = zoom annotable.
6. Cibles ≥ 44×44 pt ; tout dans le tiers inférieur de l'écran.

---

## 5. Comportements transverses

- **Undo/redo global** fusionné (texte + structure + annotations) — pas d'historique séparé par média.
- **Autosauvegarde** + indicateur discret ; jamais de dialogue "quitter sans sauvegarder".
- **États vides pédagogiques** : chaque zone d'insertion affiche une micro-aide au premier usage.
- **Apprentissage progressif** : infobulles "essayez : glissez une image ici" masquées après 2 utilisations.
- **Accessibilité (WCAG AA)** : focus visible, navigation clavier complète, contrastes, taille de texte adaptative, labels ARIA sur chaque outil.

---

## 6. Implémentation technique (React SPA — Vite + react-router-dom, servi par API Express)

| Besoin | Recommandation | Motif |
|---|---|---|
| Éditeur de document | **TipTap** (ProseMirror) | Éditeur de blocs structurés, extensions custom (étape, encart), DOM réel |
| Nœuds custom | NodeView React (`ReactNodeViewRenderer`) | Rendu des blocs étape/image/encart en composants React |
| Barre flottante | Floating UI (`floating-ui`) | Positionnement des flyouts au-dessus des boutons de la barre basse (flip/shift automatiques en bord d'écran) |
| Barre basse fixe | `position: fixed` + `env(safe-area-inset-bottom)` + ancre du scroll éditorial (padding-bottom sur le document) | Barre native sur les deux plateformes ; le clavier virtuel est géré via `visualViewport` sur mobile |
| Annotation image | SVG overlay piloté par state (points, paths) — stocké comme nœud enfant de l'image | Undo natif via transactions ProseMirror |
| Drag & drop | dnd-kit | Accessible (clavier), plus léger que react-beautiful-dnd (abandonné) |
| Mobile | Même arborescence de commandes, composants d'affichage distincts (`ToolbarDesktop` / `ToolbarMobile` via `useMediaQuery`) | Une seule source de vérité des actions |
| Historique | Transactions ProseMirror (grain fin) | Undo fiable y compris sur annotations SVG |

**Spécificités SPA/Vite** :
- Pas de SSR : le rendu de l'éditeur est 100 % client, ce qui simplifie TipTap (aucune hydratation à gérer). Chargement de ProseMirror en `React.lazy` + `Suspense` si le bundle éditorial dépasse ~200 kB gzip.
- Sauvegarde : autosave debouncé côté client vers l'API Express ; en cas d'hors-ligne intermittent, file d'attente locale (IndexedDB) rejouée à la reconnexion.
- L'API Express ne sert que le JSON du document (arbre ProseMirror sérialisé) et les assets média ; toute la logique de palette et d'undo reste côté client — le serveur n'a jamais à connaître les outils.

**Architecture de commandes** : registre unique `CommandRegistry` (id, icône, label, raccourci, condition d'affichage, action). Les deux barres consomment le même registre — garantit la parité desktop/mobile et facilite les tests.

**Modèle de données** : document = liste de nœuds `step` ; une étape contient texte riche, images (avec enfants formes/texte SVG), encarts. Le mode opératoire reste exportable (PDF/JSON) indépendamment de la palette.

---

## 7. Points à challenger / décisions ouvertes

1. **Étapes numérotées : bloc dédié ou attribut ?** Recommandé : bloc dédié (robuste au drag & drop), mais plus lourd qu'une simple liste. À valider selon votre structure de données actuelle.
2. **Annotation : plein écran ou inline ?** Le plein écran mobile est plus confortable, mais casse le contexte. Alternative retenue : plein écran au mobile, inline au desktop.
3. **Faut-il un mode "lecture/revision" distinct ?** Si oui, la palette se réduit à un seul bouton "Suggérer une modification".
4. **Hors périmètre assumé** : dessin vectoriel avancé et montage vidéo — mieux servis par une intégration externe que par une palette surchargée.

---

*Document de travail — itérable. Chaque section peut être revue indépendamment.*