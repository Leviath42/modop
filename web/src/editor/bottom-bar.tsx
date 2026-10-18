import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { SHORTCUT_MAP, VISIBLE_COMMANDS, type FlyoutUI, type ToolContext } from "./tools/registry";

// Bouton de la palette : la classe tool-icon-btn est OBLIGATOIRE (règle
// tactile @media pointer:coarse de styles.css — cibles 44px fixes, C-37).
const toolIconBtn =
  "tool-icon-btn inline-flex min-w-0 shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs leading-tight text-foreground";

// Barre basse fixe (spec § 3.1) — ancrée en bas, identique desktop/mobile :
// gauche = structure & insertion (flyouts extensibles au-dessus du bouton),
// droite = actions contextuelles. Le bouton parent affiche l'outil ACTIF de
// son groupe ; un seul flyout ouvert à la fois ; Échap referme ; les
// raccourcis clavier (E, P, F, A, R, T, I) sélectionnent les outils.
export function EditorBottomBar({ ctx }: { ctx: ToolContext }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const uiOf = (id: string): FlyoutUI => ({
    open: openId === id,
    setOpen: (v) => setOpenId(v ? id : null),
  });

  // Échap referme le flyout ouvert (règle 4 de la spec).
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenId(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  // Frappe clavier : raccourcis des commandes, hors saisie de texte.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as Element | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t as HTMLElement).isContentEditable)) return;
      const cmd = SHORTCUT_MAP[e.key.toLowerCase()];
      if (!cmd || !cmd.isVisible(ctx)) return;
      e.preventDefault();
      cmd.run(ctx, uiOf(cmd.id));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const render = (cmd: (typeof VISIBLE_COMMANDS)[number]) => {
    if (!cmd.isVisible(ctx)) return null;
    const ui = uiOf(cmd.id);
    const active = cmd.isActive?.(ctx) || ui.open;
    return (
      <span key={cmd.id} className="relative inline-flex">
        <button
          onClick={() => cmd.run(ctx, ui)}
          className={cn(
            toolIconBtn,
            cmd.danger
              ? "border-danger-border bg-danger-bg text-error hover:bg-danger-bg"
              : active
                ? "border-primary bg-accent"
                : "border-border bg-surface"
          )}
          title={cmd.title}
          aria-label={cmd.aria ?? cmd.title}
          aria-expanded={cmd.flyout ? ui.open : undefined}
          aria-haspopup={cmd.flyout ? "menu" : undefined}
          data-keep-canvas-selection={cmd.keepCanvasSelection ? "1" : undefined}
        >
          {cmd.icon(ctx)}
          <span className="text-xs">{cmd.label}</span>
          {cmd.badge?.(ctx) && (
            <span className="rounded-full bg-primary px-1.5 text-[0.65rem] font-semibold text-primary-foreground">
              {cmd.badge(ctx)}
            </span>
          )}
        </button>
        {cmd.flyout && ui.open && (
          <div
            className="absolute bottom-[calc(100%+0.4rem)] left-0 z-[135] rounded-lg border border-border bg-surface p-1.5 shadow-xl"
          >
            {cmd.flyout(ctx, ui)}
          </div>
        )}
      </span>
    );
  };

  const left = VISIBLE_COMMANDS.filter((c) => c.zone === "left").map(render);
  const right = VISIBLE_COMMANDS.filter((c) => c.zone === "right").map(render);

  return (
    <div
      role="toolbar"
      aria-label="Outils d'édition"
      className="fixed inset-x-0 bottom-0 z-[120] overflow-visible border-t border-border-soft bg-surface shadow-[0_-2px_12px_rgba(0,0,0,0.10)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-[820px] min-w-0 flex-wrap items-center gap-1.5 overflow-visible px-2 py-1.5">
        {left}
        {(right.some(Boolean)) && <span className="ml-auto" aria-hidden="true" />}
        {right}
      </div>
    </div>
  );
}
