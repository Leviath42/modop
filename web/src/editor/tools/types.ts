import type { ReactNode } from "react";
import type { Shape } from "../../annotated-photo";
import type { Step } from "../../api";

// Palette d'outils modulaire — voir docs/spec-palette-outils.md.
// Architecture : un registre unique de commandes (CommandDefinition) consommé
// par la barre basse (desktop ET mobile à terme). Chaque outil = un module
// déclaratif (icône, libellé, raccourci, visibilité, action, flyout) —
// ajouter un outil = ajouter une entrée au registre, rien d'autre.

export interface PictoPreset {
  kind: string;
  label: string;
  color: string;
}

// Contexte partagé par tous les outils : l'état de l'éditeur (lecture) et
// les actions qu'il injecte (écriture). Les outils ne connaissent RIEN du
// composant éditeur — seule cette interface lie les deux.
export interface ToolContext {
  isNew: boolean;
  steps: Step[];
  activeStepId: number | null;
  insertTool: Shape["type"] | null;
  insertColor: string;
  insertWidth: number;
  canvasSelection: number;
  actions: {
    addStep(): void;
    openPhotoSource(which: "gallery" | "camera"): void;
    setInsertTool(t: Shape["type"] | null): void;
    setInsertColor(c: string): void;
    setInsertWidth(w: number): void;
    togglePreset(preset: PictoPreset): void;
    deleteActiveStep(): void;
    deleteCanvasSelection(): void;
  };
}

// État du flyout d'une commande, piloté par la barre (une seule ouverte).
export interface FlyoutUI {
  open: boolean;
  setOpen(open: boolean): void;
}

export interface CommandDefinition {
  id: string;
  zone: "left" | "right";
  label: string;
  title: string;
  // aria-label du bouton (défaut : title) — explicite pour les libellés
  // courts testés/assistés ("Photos", "Ajouter une étape").
  aria?: string;
  // Touche mnémonique (simple, sans modificateur) — visible dans le title.
  shortcut?: string;
  // Icône affichée dans le bouton ; peut dépendre du contexte (règle 3 de
  // la spec : le bouton parent affiche l'outil ACTIF du groupe).
  icon(ctx: ToolContext): ReactNode;
  isVisible(ctx: ToolContext): boolean;
  // Surbrillance du bouton (outil actif / flyout ouvert / état non vide).
  isActive?(ctx: ToolContext): boolean;
  // Compteur discret (ex. Indications (2)).
  badge?(ctx: ToolContext): string | null;
  danger?: boolean;
  // C-31 : le clic sur ce bouton ne doit pas vider la sélection du canevas
  // (listener global de désélection) — ex. « Supprimer les objets ».
  keepCanvasSelection?: boolean;
  run(ctx: ToolContext, ui: FlyoutUI): void;
  // Panneau extensible affiché AU-DESSUS du bouton (spec § 3.1).
  flyout?(ctx: ToolContext, ui: FlyoutUI): ReactNode;
  // Commande invisible dans la barre mais active au clavier (sélection
  // directe d'un sous-outil : A = flèche, R = zone, T = texte).
  hidden?: boolean;
}
