import {
  ArrowUpRight,
  Camera,
  Crop,
  Palette,
  Undo2,
  Check,
  Image as ImageIcon,
  Plus,
  Shapes,
  Square,
  Trash2,
  TriangleAlert,
  Type,
  type LucideIcon,
} from "lucide-react";
import { COLORS } from "../../step-canvas";
import { cn } from "../../lib/utils";
import type { PictoPreset, CommandDefinition, ToolContext } from "./types";

// Icônes du groupe Formes (clé = type de forme) — un seul jeu pour la barre
// (bouton parent, flyout) et cohérent avec le rendu posé sur le canevas.
const SHAPE_ICONS: Record<string, LucideIcon> = {
  arrow: ArrowUpRight,
  rect: Square,
  text: Type,
};

export const PICTO_PRESETS: PictoPreset[] = [
  { kind: "attention", label: "Attention", color: "#f5a623" },
  { kind: "danger", label: "Danger", color: "#d0021b" },
  { kind: "epi", label: "EPI obligatoire", color: "#1f4e9c" },
  { kind: "electrique", label: "Risque électrique", color: "#7b16c9" },
  { kind: "point-chaud", label: "Point chaud", color: "#d0021b" },
  { kind: "outil", label: "Outillage spécifique", color: "#108c5e" },
  { kind: "info", label: "Information", color: "#5b7285" },
];

// Classes communes des items de flyout (une seule source pour desktop/mobile).
const menuItem =
  "flex w-full items-center gap-2 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted";

// — Structure : Étape + —
const stepAdd: CommandDefinition = {
  id: "step-add",
  zone: "left",
  label: "Étape",
  aria: "Ajouter une étape",
  title: "Ajouter une étape (E)",
  shortcut: "e",
  icon: () => <Plus size={16} />,
  isVisible: () => true,
  run: (ctx) => ctx.actions.addStep(),
};

// — Insertion : Photos (flyout galerie / appareil) —
const photo: CommandDefinition = {
  id: "photo",
  zone: "left",
  label: "Photos",
  aria: "Photos",
  title: "Photos : galerie ou appareil photo (P)",
  shortcut: "p",
  icon: () => <ImageIcon size={16} />,
  isVisible: () => true,
  run: (_ctx, ui) => ui.setOpen(!ui.open),
  flyout: (ctx, ui) => (
    <div role="menu" aria-label="Source de la photo" className="grid min-w-44 gap-1">
      <button role="menuitem" onClick={() => { ctx.actions.openPhotoSource("gallery"); ui.setOpen(false); }} className={menuItem}>
        <ImageIcon size={16} aria-hidden="true" /> Depuis la galerie
      </button>
      <button role="menuitem" onClick={() => { ctx.actions.openPhotoSource("camera"); ui.setOpen(false); }} className={menuItem}>
        <Camera size={16} aria-hidden="true" /> Prendre une photo
      </button>
    </div>
  ),
};

// — Insertion : Formes (flyout flèche / zone / texte + couleur) —
// Le bouton parent affiche l'outil ACTIF du groupe (règle 3 de la spec).
const shapes: CommandDefinition = {
  id: "shapes",
  zone: "left",
  label: "Formes",
  aria: "Formes",
  title: "Formes : flèche (A), zone (R), texte (T) — F pour ouvrir",
  shortcut: "f",
  icon: (ctx) => {
    const Icon = ctx.insertTool ? SHAPE_ICONS[ctx.insertTool] : null;
    return Icon ? <Icon size={16} /> : <Shapes size={16} />;
  },
  isVisible: () => true,
  isActive: (ctx) => ctx.insertTool !== null,
  run: (_ctx, ui) => ui.setOpen(!ui.open),
  flyout: (ctx, ui) => (
    <div role="menu" aria-label="Formes" className="grid min-w-44 gap-1">      {([
        { kind: "arrow", label: "Flèche", shortcut: "A", Icon: ArrowUpRight },
        { kind: "rect", label: "Zone", shortcut: "R", Icon: Square },
        { kind: "text", label: "Texte", shortcut: "T", Icon: Type },
      ] as const).map(({ kind, label, shortcut, Icon }) => (
        <button
          key={kind}
          role="menuitemradio"
          aria-checked={ctx.insertTool === kind}
          onClick={() => { ctx.actions.setInsertTool(kind); ui.setOpen(false); }}
          title={`${label} (${shortcut})`}
          className={cn(menuItem, ctx.insertTool === kind && "border-primary bg-accent font-medium")}
        >
          <Icon size={16} /><span className="flex-1">{label}</span>
          {ctx.insertTool === kind && <Check size={16} aria-hidden="true" className="text-ok" />}
        </button>
      ))}
    </div>
  ),
};

// Sélection directe au clavier des sous-outils de Formes (commandes cachées).
const shapeShortcut = (kind: "arrow" | "rect" | "text", label: string, key: string): CommandDefinition => ({
  id: `insert-${kind}`,
  zone: "left",
  label,
  title: `${label} (${key})`,
  shortcut: key,
  icon: () => null,
  hidden: true,
  isVisible: () => false,
  run: (ctx) => ctx.actions.setInsertTool(ctx.insertTool === kind ? null : kind),
});

// — Style : couleur du trait + épaisseur (C-71 #10) —
// Bouton compact (icône + pastille de la couleur en cours), flyout avec
// grille de couleurs et curseur d'épaisseur — remplace la rangée de gros
// ronds dans le flyout Formes (illisible sur mobile).
const style: CommandDefinition = {
  id: "style",
  zone: "left",
  label: "Style",
  aria: "Style",
  title: "Style : couleur et épaisseur du trait (S)",
  shortcut: "s",
  icon: (ctx) => (
    <span className="inline-flex items-center gap-1">
      <Palette size={16} aria-hidden="true" />
      <span aria-hidden="true" className="size-3.5 rounded-full border border-border" style={{ background: ctx.insertColor }} />
    </span>
  ),
  isVisible: () => true,
  isActive: (ctx) => ctx.insertWidth !== 2,
  run: (_ctx, ui) => ui.setOpen(!ui.open),
  flyout: (ctx, _ui) => (
    <div role="menu" aria-label="Style du trait" className="grid gap-2">
      <div className="grid grid-cols-4 gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => ctx.actions.setInsertColor(c)}
            aria-label={`Couleur ${c}`}
            aria-pressed={ctx.insertColor === c}
            title={`Couleur ${c}`}
            className={cn("color-swatch size-4 cursor-pointer rounded-full sm:size-5", ctx.insertColor === c ? "border-2 border-foreground" : "border border-border")}
            style={{ background: c }}
          />
        ))}
      </div>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Épaisseur du trait : {ctx.insertWidth}
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={ctx.insertWidth}
          onChange={(e) => ctx.actions.setInsertWidth(Number(e.target.value))}
          aria-label="Épaisseur du trait"
          className="w-40"
        />
      </label>
    </div>
  ),
};

// — Indications (encarts métier de l'étape : attention, danger, EPI…) —
const activePresetCount = (ctx: ToolContext) =>
  ctx.steps.find((s) => s.id === (ctx.activeStepId ?? ctx.steps[0]?.id))?.pictos.length ?? 0;

const indications: CommandDefinition = {
  id: "indications",
  zone: "left",
  label: "Indications",
  aria: "Indications",
  title: "Indications de l'étape : attention, danger, EPI… (I)",
  shortcut: "i",
  icon: () => <TriangleAlert size={16} aria-hidden="true" />,
  isVisible: () => true,
  isActive: (ctx) => activePresetCount(ctx) > 0,
  badge: (ctx) => { const n = activePresetCount(ctx); return n > 0 ? String(n) : null; },
  run: (_ctx, ui) => ui.setOpen(!ui.open),
  flyout: (ctx, _ui) => {
    const st = ctx.steps.find((s) => s.id === (ctx.activeStepId ?? ctx.steps[0]?.id));
    return (
      <div role="menu" aria-label="Indications" className="grid min-w-48 gap-1">
        {PICTO_PRESETS.map((preset) => {
          const on = st ? st.pictos.some((x) => x.kind === preset.kind) : false;
          return (
            <button
              key={preset.kind}
              role="menuitemcheckbox"
              aria-checked={on}
              onClick={() => ctx.actions.togglePreset(preset)}
              className={menuItem}
              style={on ? { background: `${preset.color}22` } : undefined}
            >
              <span aria-hidden="true" className="size-[0.7rem] shrink-0 rounded-full" style={{ background: preset.color }} />
              <span className="flex-1 text-xs">{preset.label}</span>
              {on && <Check size={16} aria-hidden="true" className="text-ok" />}
            </button>
          );
        })}
      </div>
    );
  },
};

// — Actions contextuelles (zone droite) —
const deleteStep: CommandDefinition = {
  id: "delete-step",
  zone: "right",
  label: "Supprimer l'étape",
  title: "Supprimer l'étape affichée (confirmation demandée)",
  danger: true,
  icon: () => <Trash2 size={16} aria-hidden="true" />,
  isVisible: (ctx) => ctx.steps.length > 1,
  run: (ctx) => ctx.actions.deleteActiveStep(),
};

const deleteSelection: CommandDefinition = {
  id: "delete-selection",
  zone: "right",
  label: "Objets",
  title: "Supprimer les objets sélectionnés du canevas de l'étape affichée",
  danger: true,
  keepCanvasSelection: true,
  icon: () => <Trash2 size={16} aria-hidden="true" />,
  isVisible: (ctx) => ctx.canvasSelection > 0,
  badge: (ctx) => ctx.canvasSelection > 0 ? String(ctx.canvasSelection) : null,
  run: (ctx) => ctx.actions.deleteCanvasSelection(),
};

// C-73 : actions contextuelles du rognage — le bouton vit dans la barre
// (plus dans le canevas), visible quand une seule photo est sélectionnée ;
// l'annulation reste possible tant que l'éditeur est ouvert (l'ancien
// fichier n'est jamais supprimé au rognage).
const crop: CommandDefinition = {
  id: "crop",
  zone: "right",
  label: "Recadrer",
  aria: "Recadrer la photo sélectionnée",
  title: "Recadrer la photo sélectionnée",
  icon: () => <Crop size={16} aria-hidden="true" />,
  isVisible: (ctx) => ctx.photoSelected === 1,
  run: (ctx) => ctx.actions.requestCrop(),
};

const undoCrop: CommandDefinition = {
  id: "undo-crop",
  zone: "right",
  label: "Annuler rognage",
  aria: "Annuler le dernier rognage",
  title: "Annuler le dernier rognage",
  icon: () => <Undo2 size={16} aria-hidden="true" />,
  isVisible: (ctx) => ctx.canUndoCrop,
  run: (ctx) => ctx.actions.undoCrop(),
};


// Registre — ordre = ordre d'affichage. Ajouter un outil = une entrée ici.
export const EDITOR_COMMANDS: CommandDefinition[] = [
  stepAdd,
  photo,
  shapes,
  style,
  indications,
  shapeShortcut("arrow", "Flèche", "a"),
  shapeShortcut("rect", "Zone", "r"),
  shapeShortcut("text", "Texte", "t"),
  deleteStep,
  deleteSelection,
  crop,
  undoCrop,
];
