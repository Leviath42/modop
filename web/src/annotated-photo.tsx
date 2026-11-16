import { useId } from "react";
// Utilitaires de formes (annotations du canevas d'étape).
// Format shape : { type: "arrow"|"rect"|"text", ... } en coordonnées
// relatives (0-1) pour être indépendant de la taille d'affichage.
export interface Shape {
  type: "arrow" | "rect" | "text";
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
  w?: number;
  h?: number;
  text?: string;
  color: string;
  // C-71 (#10) : épaisseur du trait (stockée avec la forme ; défaut 2).
  width?: number;
}

export function parseShapes(raw: unknown): Shape[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === "string" && raw) {
      try {
        return JSON.parse(raw) as Shape[];
      } catch {
        return [];
      }
    }
    return [];
  }
  return raw as Shape[];
}

// C-95 : calque d'annotations posées SUR une photo (formes relatives 0-1 à
// la photo, p. ex. via l'outil MCP annotate_photo). Rendu passif — il
// recouvre l'image sans intercepter les clics (pointerEvents: none),
// fidèle au lecteur comme à l'export docx (canvas-composite.ts).
export function PhotoAnnotationLayer({ annotations }: { annotations?: unknown[] }) {
  const uid = useId();
  const sh = parseShapes(annotations ?? []);
  if (sh.length === 0) return null;
  const mid = (c: string) => "pa-ah-" + uid + "-" + c.replace("#", "");
  return (<>
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <defs>
        {[...new Set(sh.filter((s) => s.type === "arrow").map((s) => s.color))].map((c) => (
          <marker key={c} id={mid(c)} markerWidth="4.5" markerHeight="4.5" refX="3.6" refY="2.25" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L4.5,2.25 L0,4.5 z" fill={c} />
          </marker>
        ))}
      </defs>
      {sh.map((s, i) => {
        if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) {
          return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={s.color} strokeWidth={s.width ?? 2} vectorEffect="non-scaling-stroke" strokeLinecap="round"
            markerEnd={"url(#" + mid(s.color) + ")"} />;
        }
        if (s.type === "rect" && s.w !== undefined && s.h !== undefined) {
          return <rect key={i} x={s.x1} y={s.y1} width={s.w} height={s.h}
            fill="none" stroke={s.color} strokeWidth={s.width ?? 2} vectorEffect="non-scaling-stroke" />;
        }
        return null;
      })}
    </svg>
    {sh.map((s, i) => s.type === "text" && s.text ? (
      <span key={"t" + i} style={{
        position: "absolute", left: (s.x1 * 100) + "%", top: (s.y1 * 100) + "%", transform: "translate(-50%, -50%)",
        background: s.color, color: "white", padding: "0.15rem 0.4rem", borderRadius: "4px",
        fontSize: "0.8rem", fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap",
      }}>{s.text}</span>
    ) : null)}
  </>);
}
