import { ArrowIcon, PhotoIcon, PlusIcon, RectIcon, SHAPE_ICONS, TextIcon } from "../../icons";
import { COLORS } from "../../step-canvas";
import { cn } from "../../lib/utils";
import type { PictoPreset, CommandDefinition, ToolContext } from "./types";

// Icône générique du groupe Formes (aucun outil actif) : carré + cercle.
const ShapesIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
    <circle cx="16" cy="16" r="4.5" />
  </svg>
);

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
  icon: () => <PlusIcon />,
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
  icon: () => <PhotoIcon />,
  isVisible: () => true,
  run: (_ctx, ui) => ui.setOpen(!ui.open),
  flyout: (ctx, ui) => (
    <div role="menu" aria-label="Source de la photo" className="grid min-w-44 gap-1">
      <button role="menuitem" onClick={() => { ctx.actions.openPhotoSource("gallery"); ui.setOpen(false); }} className={menuItem}>
        <span aria-hidden="true">🖼</span> Depuis la galerie
      </button>
      <button role="menuitem" onClick={() => { ctx.actions.openPhotoSource("camera"); ui.setOpen(false); }} className={menuItem}>
        <span aria-hidden="true">📷</span> Prendre une photo
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
    return Icon ? <Icon /> : <ShapesIcon />;
  },
  isVisible: () => true,
  isActive: (ctx) => ctx.insertTool !== null,
  run: (_ctx, ui) => ui.setOpen(!ui.open),
  flyout: (ctx, _ui) => (
    <div role="menu" aria-label="Formes" className="grid min-w-44 gap-1">
      {([
        { kind: "arrow", label: "Flèche", shortcut: "A", Icon: ArrowIcon },
        { kind: "rect", label: "Zone", shortcut: "R", Icon: RectIcon },
        { kind: "text", label: "Texte", shortcut: "T", Icon: TextIcon },
      ] as const).map(({ kind, label, shortcut, Icon }) => (
        <button
          key={kind}
          role="menuitemradio"
          aria-checked={ctx.insertTool === kind}
          onClick={() => ctx.actions.setInsertTool(kind)}
          title={`${label} (${shortcut})`}
          className={cn(menuItem, ctx.insertTool === kind && "border-primary bg-accent font-medium")}
        >
          <Icon /><span className="flex-1">{label}</span>
          {ctx.insertTool === kind && <span aria-hidden="true" className="text-ok">✓</span>}
        </button>
      ))}
      <div className="mt-1 flex items-center gap-1.5 border-t border-border-soft pt-1.5" data-color-pop>
        <span className="text-xs text-muted-foreground">Couleur</span>
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => ctx.actions.setInsertColor(c)}
            aria-label={`Couleur ${c}`}
            aria-pressed={ctx.insertColor === c}
            className={cn("size-[22px] cursor-pointer rounded-full", ctx.insertColor === c ? "border-2 border-foreground" : "border border-border")}
            style={{ background: c }}
          />
        ))}
      </div>
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
  icon: () => <span aria-hidden="true" className="text-sm leading-none">⚠</span>,
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
              {on && <span aria-hidden="true" className="text-ok">✓</span>}
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
  icon: () => <span aria-hidden="true" className="text-sm leading-none">🗑</span>,
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
  icon: () => <span aria-hidden="true" className="text-sm leading-none">🗑</span>,
  isVisible: (ctx) => ctx.canvasSelection > 0,
  badge: (ctx) => ctx.canvasSelection > 0 ? String(ctx.canvasSelection) : null,
  run: (ctx) => ctx.actions.deleteCanvasSelection(),
};

// Registre — ordre = ordre d'affichage. Ajouter un outil = une entrée ici.
export const EDITOR_COMMANDS: CommandDefinition[] = [
  stepAdd,
  photo,
  shapes,
  indications,
  shapeShortcut("arrow", "Flèche", "a"),
  shapeShortcut("rect", "Zone", "r"),
  shapeShortcut("text", "Texte", "t"),
  deleteStep,
  deleteSelection,
];
