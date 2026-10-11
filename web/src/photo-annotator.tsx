import { useRef, useState } from "react";
import AnnotatedPhoto, { parseShapes, type Shape } from "./annotated-photo";

// Éditeur d'annotations : outils flèche / rectangle / texte, clic-glisser
// sur la photo, sauvegarde via api.saveAnnotations.
// Les coordonnées sont relatives (0-1) : le rendu est identique à toute taille.
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
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  function relative(e: React.MouseEvent): { x: number; y: number } {
    const rect = imgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  async function persist(next: Shape[]) {
    setBusy(true);
    try {
      const { api } = await import("./api");
      await api.saveAnnotations(photoId, next);
      setShapes(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <div ref={imgRef} style={{ position: "relative" }}>
        <div onClick={(e) => {
          if (!tool) return;
          const p = relative(e);
          if (tool === "text") {
            setTextDraft({ x: p.x, y: p.y, value: "" });
            return;
          }
          setDrag(p);
        }}>
          <AnnotatedPhoto filename={filename} alt={alt} shapes={tool ? [] : shapes} maxWidth="100%" />
          {/* aperçu pendant le drag */}
          {drag && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
          )}
        </div>
        {shapes.length > 0 && tool === null && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <AnnotatedPhoto filename={filename} alt="" shapes={shapes} maxWidth="100%" />
          </div>
        )}
      </div>

      {/* barre d'outils */}
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setTool(tool === t.kind ? null : t.kind)}
            disabled={busy}
            style={{
              padding: "0.25rem 0.6rem", fontSize: "0.8rem", borderRadius: "4px",
              border: tool === t.kind ? "2px solid #1f4e9c" : "1px solid #c9ccd3",
              background: tool === t.kind ? "#eaf1fb" : "white",
            }}
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
              {tool === "text" ? "Cliquez sur la photo pour placer le texte" : "Glissez sur la photo"}
            </span>
          </>
        )}
        {shapes.length > 0 && (
          <button onClick={() => void persist(shapes.slice(0, -1))} style={{ fontSize: "0.8rem", marginLeft: "auto" }}>
            ↩ Annuler la dernière
          </button>
        )}
      </div>

      {/* zone de glissement active : overlay de capture */}
      {tool && tool !== "text" && (
        <div
          style={{ position: "absolute", inset: 0, cursor: "crosshair" }}
          onMouseDown={(e) => setDrag(relative(e))}
          onMouseUp={(e) => {
            if (!drag) return;
            const p = relative(e);
            const shape: Shape =
              tool === "arrow"
                ? { type: "arrow", x1: drag.x, y1: drag.y, x2: p.x, y2: p.y, color }
                : {
                    type: "rect",
                    x1: Math.min(drag.x, p.x),
                    y1: Math.min(drag.y, p.y),
                    w: Math.abs(p.x - drag.x),
                    h: Math.abs(p.y - drag.y),
                    color,
                  };
            void persist([...shapes, shape]);
            setDrag(null);
          }}
        />
      )}

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
              }
              if (e.key === "Escape") setTextDraft(null);
            }}
          />
          <button
            onClick={() => {
              if (textDraft.value.trim()) {
                void persist([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
              }
              setTextDraft(null);
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}
