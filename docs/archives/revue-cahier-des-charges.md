# Revue du cahier des charges — Modop v1.4 (proposition)

*Document de travail alimentant la v1.4 du cahier des charges. Sources : benchmark des plateformes d'instructions de travail (Dozuki, Poka, SwipeGuide/L2L, VKS, Tulip, Operations1, Azumuta, SafetyCulture), standards de gestion documentaire (ISO 15489, ISO 23081), littérature UX terrain (NN/g, progressive disclosure). Réalisé pendant la campagne beta — vagues 0-6 livrées.*

---

## 1. Benchmark concurrentiel — ce que font les leaders

### 1.1 Panorama 2025-2026

| Plateforme | Positionnement | Points forts | Prix indicatif |
|---|---|---|---|
| **Dozuki** (issu d'iFixit) | Standard de la documentation industrielle | Contrôle de versions strict, workflows d'approbation, FDA 21 CFR Part 11, gabarits éprouvés « une étape = une photo » | ~850 $/mois, min. 50 users |
| **Poka** (IFS) | Connected worker complet | Actualités d'usine, matrice de compétences, IA de conversion de documents hérités, multilingue (37 lang.) | Sur devis (entreprise) |
| **SwipeGuide** (racheté par L2L, 09/2024) | Simplicité mobile-first | Étapes courtes « swipe » type stories, création en minutes par un chef d'équipe, UX minimalist | Intégré L2L, 150 $/user/mois |
| **VKS** | Assemblage guidé | Anti-erreur, collecte de données de production | ~350 $/user/mois |
| **Tulip** | Apps d'atelier configurables | Instructions embarquées dans des apps métier | 100 $/interface/mois, min. 10 |
| **Operations1** | Instructions + exécution | Logique contextuelle par variante produit, forte présence UE | 10 k€/an + implémentation |
| **Azumuta** | Qualité intégrée | Contrôles en ligne, instructions par variante | Sur devis |
| **SafetyCulture** | Inspections + instructions | Écosystème mobile très mature, offline poussé | Sur devis |

**Constats transversaux** :
- **Le marché a validé le modèle de Modop** : une photo par étape, texte court, pictos de sécurité, versions publiées. Le projet est aligné avec les fondamentaux du segment.
- **Trois tiers se dessinent** : stockage de SOP (Notion/SweetProcess) → instructions guidées (Modop est ici) → exécution connectée avec collecte de données (Poka/VKS). Modop n'a pas vocation à monter au 3e tier, mais doit verrouiller le 2e.
- **Consolidation en cours** (SwiperGuide→L2L, Poka→IFS) : les acteurs indépendants disparaissent ou deviennent des suites — l'auto-hébergement léger de Modop est un différenciant pérenne pour les PME.

### 1.2 Ce que les leaders font et que Modop n'a pas (encore)

| Fonction | Qui | Priorité suggérée |
|---|---|---|
| **Gabarit strict « 1 étape = 1 action = 1 photo »** avec rappels qualité | Dozuki (héritage iFixit) | Haute — coût nul, effet immédiat sur la qualité des contenus |
| **Changelog à la publication** | Tous | **Déjà spécifié** (RF-65) — confirmer la vague |
| **Checklists de confirmation** (l'opérateur coche l'étape faite) | Poka, VKS, L2L | Moyenne — transforme la lecture en exécution suivie |
| **Accès par QR code au poste** | Knowby, Humble, L2L, QRStuff | **Haute** — coût faible, usage terrain majeur (voir §3) |
| **Retour terrain sur une étape** (« cette photo est floue ») | Dozuki (Q&A), Poka | Moyenne — boucle d'amélioration continue |
| **Auto-traduction des contenus** | L2L (52+ langues), Poka | Basse — hors périmètre initial |
| **Boucle de commentaires publics type Q&A** | iFixit/Dozuki | Basse — l'audit a montré le coût de modération |

### 1.3 Ce que Modop fait déjà (à valeur égale ou supérieure)

- Publication versionnée avec snapshot immuable + consultation de version précise + export DOCX versionné (beaucoup d'outils n'ont que l'historique linéaire)
- Éditeur d'annotations photo natif (flèches/zones/textes libres) — chez les leaders c'est souvent un module payant
- PWA offline pour lecture, auto-hébergement sur un conteneur unique (les leaders sont SaaS, lock-in fort)
- Drag & drop tactile Pointer Events, thème sombre persistant, mobile-first réel (SwipeGuide a été racheté précisément pour ça)

---

## 2. Principes UI/UX retenus du benchmark et de la littérature

### 2.1 Écriture des instructions (Dozuki Tech Writing Handbook, smartrdm, REWO)

1. **Une étape = une action** — « Each step should be direct, visual, and focused on the action ». Les instructions longues numériques échouent autant que le papier. *Implication Modop : le gabarit d'étape doit décourager les pavés de texte (limite indicative affichée, jamais bloquante).*
2. **Une photo du point de vue de l'opérateur**, pas de « la pièce de loin » ; « a single well-placed photo can replace an entire paragraph ». *Implication : conseils d'aide à la saisie dans l'éditeur (placeholder, aide contextuelle).*
3. **Marqueurs visuels sur la photo** (flèches, cercles, encadrés) pour pointer le détail — Modop le fait (RF-58), c'est validé comme différenciant par iFixit dès l'origine.
4. **Avertissements avant l'action**, pas en footnote — les pictos Modop (RF-55) sont sur la bonne voie ; à renforcer : picto « danger » affiché *avant* le texte de l'étape en lecture.
5. **Feedback loop** : les meilleurs contenus vivants demandent un retour utilisateur immédiat (iFixit : « les commentaires sont souvent aussi utiles que les instructions »). *Implication : bouton discret « Signaler un problème sur cette étape » en lecture (crée une entrée d'audit, notification à l'auteur).*

### 2.2 Lecture au poste de travail (NN/g, UXPin, arkite)

6. **Progressive disclosure** : l'essentiel d'abord, le détail replié — réduit le temps de première action de 30-50 %. Modop l'a fait pour l'éditeur (C-01/C-06) ; **le lecteur mobile devrait aussi proposer un mode « une étape par écran avec avance Suivant/Précédent »** — c'est le pattern SwipeGuide qui a fait son succès (le swipe « stories » réduit la charge cognitive).
7. **Cibles et contrastes terrain** : l'atelier se lit debout, avec des gants, sous un éclairage variable — gros boutons (≥ 48px), contraste renforcé en mode « atelier » (option de thème « contraste élevé »).
8. **QR code d'accès direct** (NN/g) : 13 guidelines d'employabilité ; pour Modop, une vignette par mode opératoire imprimable (PDF avec QR → `/workflow/:id/read`) collée sur la machine. Consignes : zone de silence ≥ 4 modules, min. 2 cm pour scan à 20 cm, alt-text.
9. **Offline d'abord** : la lecture doit marcher quand le Wi-Fi de l'atelier tombe — Modop a le SW ; à compléter par le **pré-cache des MO publiés** (vague 7 existante) et un indicateur « dernier synchro ».

### 2.3 Architecture de l'information (ISO 15489 / 23081, appliqués à Modop)

10. **Classification = navigation** : « classification is organizing records against the business activities that produced them » — l'arborescence RF-62 doit refléter l'organisation métier (machine, atelier, type de maintenance), pas un classement arbitraire. 2-3 niveaux max au-delà desquels la recherche prend le relais.
11. **Métadonnées minimales** (ISO 23081 adapté) : chaque document doit porter — identifiant (référence ✓), titre (✓), version courante (✓), auteur (✓ via versions), **date de validité/revue**, **propriétaire éditorial**, **statut** (RF-67 ✓), classification (RF-62). Manquent aujourd'hui : **date de prochaine revue** et **responsable**.
12. **Cycle de vie documentaire** : créé → en relecture → validé → diffusé → **à revoir** (revue périodique) → **obsolète** (remplacé ou retiré). Le statut RF-67 doit inclure la revue périodique — c'est le point qui distingue une vraie GED d'un dépôt de fichiers : *un document jamais relu devient silencieusement faux.*
13. **Traçabilité** : qui a publié quoi, quand, et à partir de quelle version — l'audit log Modop couvre déjà ceci ; l'exposer dans l'historique du document (chaîne des versions avec auteur + description RF-65).
14. **Conservation/retrait** : pas de suppression silencieuse — un document obsolète doit rester consultable (avec badge d'obsolescence et lien vers son remplaçant) tant que la politique de conservation ne l'archive pas.

---

## 3. Recommandations pour la v1.4 du cahier des charges

### 3.1 Nouvelles exigences proposées (à numéroter dans le CdC)

| ID | Exigence | Origine | Effort estimé |
|---|---|---|---|
| RF-70 | **Gabarit qualité étape** : aide contextuelle dans l'éditeur (conseil « une action par étape », limite indicative de description, rappel photo) — jamais bloquant | Dozuki/iFixit | Faible |
| RF-71 | **QR code d'accès** : chaque MO publié expose une vignette imprimable (PDF : titre, référence, QR → URL publique du lecteur) ; consignes d'impression incluses | Knowby, L2L, NN/g | Faible-moyen |
| RF-72 | **Mode lecture guidée** (mobile) : une étape par écran, boutons Suivant/Précédent en zone pouce, progression visible (étape 3/8) | SwipeGuide | Moyen |
| RF-73 | **Retour terrain** : bouton « Signaler un problème » par étape (lecteur) → entrée d'audit + notification auteur ; consultation des signalements par l'auteur | iFixit Q&A, Poka | Moyen |
| RF-74 | **Date de revue périodique** : champ « à revoir le » par document, alerte visuelle en liste/lecture quand dépassée, filtre « à revoir » | ISO 15489 | Faible |
| RF-75 | **Responsable éditorial** : champ propriétaire du document (distinct de l'auteur de version), affiché dans l'historique | ISO 23081 | Faible |
| RF-76 | **Badge d'obsolescence avec remplaçant** : un MO remplacé pointe vers son successeur ; jamais de 404 silencieux | ISO 15489 | Faible |
| RF-77 | **Statistiques de consultation** (nombre de vues/exports par MO, déjà partiellement dans `/api/stats`) exposées à l'auteur — priorisation des mises à jour | Lot 4 du CdC | Faible |

### 3.2 Rafinements des exigences existantes

- **RF-62 (arborescence)** : confirmer la limite à **3 niveaux**, avec recherche/filtre transverse ; l'arborescence gère la navigation, la recherche reste l'échappatoire (ISO : classification ≠ findability).
- **RF-67 (statut)** : les valeurs recommandées sont *brouillon / en relecture / validé / à revoir / obsolète* ; transitions contrôlées par rôle (auteur : brouillon→relecture ; validateur : relecture→validé ; anyone : alerte « à revoir » automatique à l'échéance RF-74).
- **RF-65 (changelog)** : champ de saisie **dans la modale de publication** (C-06 l'a rendue naturelle), stocké dans le snapshot, affiché dans l'historique et l'export DOCX.
- **RNF-5 (accessibilité)** : ajouter le mode « atelier » — contraste renforcé, cibles ≥ 48px, texte redimensionnable ; et QR accessibles (alt-text, taille).

### 3.3 Points d'attention (ne pas faire)

- **Ne pas ajouter de module de collecte de données d'exécution** (checklists signées, e-signatures) dans ce cycle : c'est le saut vers le tier 3 (VKS/Poka) — coût élevé, périmètre différent, exigences réglementaires (21 CFR Part 11) hors sujet pour l'instant. À inscrire en vision long terme seulement.
- **Ne pas implémenter les commentaires publics/Q&A** sans stratégie de modération — la boucle de feedback RF-73 (privée, par signalement) donne 80 % du bénéfice pour 20 % du coût.
- **Pas de multi-langue** dans ce cycle (coût de traduction continue sous-estimé partout dans le segment).

### 3.4 Séquencement suggéré

- **Vague 7** (déjà tracée) : UI stats + comparaison de versions + export DOCX annoté (C-62..65 du CdC)
- **Vague 8 — qualité documentaire** (nouveau, découle de cette revue) : RF-70, 74, 75, 76 + refinements RF-62/67 — *le socle GED avant l'arborescence, sinon on classe des documents sans cycle de vie*
- **Vague 9 — terrain** : RF-71 (QR), RF-72 (lecture guidée), RF-73 (feedback), RNF-5 atelier
- **RF-77 (stats)** peut s'insérer dans la vague 7 (l'API existe déjà)

---

## 4. Sources

- Comparatifs 2025-2026 : Manual.to (comparatif indépendant), Guideflow, Scribe, Humble Operations, Mission Control — panorama et tarifs du segment
- Dozuki/iFixit : Tech Writing Handbook (chap. 8), principes d'autoring « 1 étape 1 photo », historique produit
- smartrdm.com, arkite.com, knowby.co, processnavigation.com, rewo.io, operations1.com — best practices instructions digitales 2025-2026
- ISO 15489-1:2016 (concepts et principes du records management), ISO 23081-1:2017 (métadonnées : 5 catégories), ISO 16175 (exigences fonctionnelles systèmes de gestion électronique)
- NN/g « 13 QR-Code Usability Guidelines », UXPin/uxuiprinciples « Progressive Disclosure » (données : -30 à -50 % de temps de première action)
- QRStuff « QR Code Safety Tips for Manufacturing » (OSHA 1910.145, lisibilité à 5 pieds, placement)
