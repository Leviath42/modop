import { useRef, useState } from "react";
import { parseShapes, type Shape } from "./annotated-photo";
import { api } from "./api";

// Éditeur d'annotations : flèches, zones, textes colorés.
// Coordonnées relatives (0-1) : rendu identique à toute taille d'affichage.
// L'image est draggable={false} : sans ça, le drag natif du navigateur
// déplace la photo entière au lieu de dessiner la forme.
const TOOLS: { kind: Shape["type"]; label: string }[] = [
  { kind: "arrow", label: "Flèche" },
  { kind: "rect", label: "Zone" },
  { kind: "text", label: "Texte" },
];
const COLORS = ["#d0021b", "#f5a623", "#1f4e9c", "#108c5e"];

export default function PhotoAnnotator({
  photoId,
  filename,
  alt,
  initialAnnotations,
}: {
  photoId: number;
  filename: string;
  alt: string;
  initialAnnotations: unknown;
}) {
  const [shapes, setShapes] = useState<Shape[]>(parseShapes(initialAnnotations));
  const [tool, setTool] = useState<Shape["type"] | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [draft, setDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  function relative(e: React.MouseEvent): { x: number; y: number } {
    const rect = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  async function persist(next: Shape[]) {
    setBusy(true);
    try {
      await api.saveAnnotations(photoId, next);
      setShapes(next);
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(e: React.MouseEvent) {
    if (!tool || tool === "text") return;
    e.preventDefault();
    const p = relative(e);
    setDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  }

  function onPointerMove(e: React.MouseEvent) {
    if (!draft) return;
    const p = relative(e);
    setDraft({ ...draft, x2: p.x, y2: p.y });
  }

  function onPointerUp() {
    if (!draft) return;
    const { x1, y1, x2, y2 } = draft;
    setDraft(null);
    const dist = Math.hypot(x2 - x1, y2 - y1);
    if (dist < 0.01) return;
    const shape: Shape =
      tool === "arrow"
        ? { type: "arrow", x1, y1, x2, y2, color }
        : {
            type: "rect",
            x1: Math.min(x1, x2),
            y1: Math.min(y1, y2),
            w: Math.abs(x2 - x1),
            h: Math.abs(y2 - y1),
            color,
          };
    void persist([...shapes, shape]);
  }

  const showPreview = tool !== null;

  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <div
        ref={boxRef}
        style={{ position: "relative", touchAction: "none" }}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
      >
        <img
          src={`/photos/${filename}`}
          alt={alt}
          draggable={false}
          style={{
            width: "100%",
            display: "block",
            borderRadius: "8px",
            cursor: tool && tool !== "text" ? "crosshair" : tool === "text" ? "text" : "default",
            userSelect: "none",
          }}
        />
        {/* calque SVG : formes enregistrées (masquées pendant un dessin) + aperçu du dessin en cours */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          {!showPreview &&
            shapes.map((s, i) => {
              if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) {
                return (
                  <g key={i}>
                    <line x1={s.x1 * 100} y1={s.y1 * 100} x2={s.x2 * 100} y2={s.y2 * 100} stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    <circle cx={s.x1 * 100} cy={s.y1 * 100} r="0.8" fill={s.color} />
                  </g>
                );
              }
              if (s.type === "rect" && s.w !== undefined && s.h !== undefined) {
                return (
                  <rect key={i} x={s.x1 * 100} y={s.y1 * 100} width={s.w * 100} height={s.h * 100} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                );
              }
              return null;
            })}
          {/* aperçu en cours */}
          {draft && tool === "arrow" && (
            <line x1={draft.x1 * 100} y1={draft.y1 * 100} x2={draft.x2 * 100} y2={draft.y2 * 100} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          )}
          {draft && tool === "rect" && (
            <rect
              x={Math.min(draft.x1, draft.x2) * 100}
              y={Math.min(draft.y1, draft.y2) * 100}
              width={Math.abs(draft.x2 - draft.x1) * 100}
              height={Math.abs(draft.y2 - draft.y1) * 100}
              fill="none"
              stroke={color}
              strokeWidth="2" vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* textes enregistrés (hors SVG pour un rendu net) */}
        {!showPreview &&
          shapes
            .filter((s) => s.type === "text" && s.text)
            .map((s, i) => (
              <span
                key={`t${i}`}
                style={{
                  position: "absolute",
                  left: `${s.x1 * 100}%`,
                  top: `${s.y1 * 100}%`,
                  transform: "translate(-50%, -50%)",
                  background: s.color,
                  color: "white",
                  padding: "0.15rem 0.4rem",
                  borderRadius: "4px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {s.text}
              </span>
            ))}
        {textDraft && (
          <span
            style={{
              position: "absolute",
              left: `${textDraft.x * 100}%`,
              top: `${textDraft.y * 100}%`,
              transform: "translate(-50%, -50%)",
              background: color,
              color: "white",
              padding: "0.15rem 0.4rem",
              borderRadius: "4px",
              fontSize: "0.8rem",
              fontWeight: 600,
              pointerEvents: "none",
            }}
          >
            {textDraft.value || "…"}
          </span>
        )}
      </div>

      {/* barre d'outils */}
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            onClick={() => { setTool(tool === t.kind ? null : t.kind); setTextDraft(null); }}
            disabled={busy}
            style={{
              padding: "0.25rem 0.6rem", fontSize: "0.8rem", borderRadius: "4px",
              border: tool === t.kind ? "2px solid #1f4e9c" : "1px solid #c9ccd3",
              background: tool === t.kind ? "#eaf1fb" : "white",
            }}
            aria-pressed={tool === t.kind}
          >
            {t.label}
          </button>
        ))}
        {tool && (
          <>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Couleur ${c}`}
                style={{
                  width: "22px", height: "22px", borderRadius: "50%", cursor: "pointer",
                  background: c, border: color === c ? "3px solid #333" : "1px solid #ccc",
                }}
              />
            ))}
            <span style={{ fontSize: "0.75rem", color: "#888" }}>
              {tool === "text" ? "Cliquez sur la photo, tapez le texte, Entrée" : "Glissez sur la photo"}
            </span>
          </>
        )}
        {shapes.length > 0 && (
          <button onClick={() => void persist(shapes.slice(0, -1))} style={{ fontSize: "0.8rem", marginLeft: "auto" }} disabled={busy}>
            ↩ Annuler la dernière
          </button>
        )}
        {busy && <span style={{ fontSize: "0.75rem", color: "#888" }}>Enregistrement…</span>}
      </div>

      {textDraft && (
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <input
            autoFocus
            value={textDraft.value}
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            placeholder="Texte à afficher sur la photo"
            style={{ flex: 1, padding: "0.4rem", borderRadius: "4px", border: "1px solid #c9ccd3" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && textDraft.value.trim()) {
                void persist([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
                setTextDraft(null);
                setTool(null);
              }
              if (e.key === "Escape") { setTextDraft(null); setTool(null); }
            }}
          />
          <button
            onClick={() => {
              if (textDraft.value.trim()) {
                void persist([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
              }
              setTextDraft(null);
              setTool(null);
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}
