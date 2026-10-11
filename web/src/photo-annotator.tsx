import { useEffect, useRef, useState } from "react";
import { parseShapes, type Shape } from "./annotated-photo";
import { api } from "./api";

// Éditeur d'annotations, deux modes :
//  - OUTIL ACTIF : placement par CLIC-CLIC (clic = départ, second clic = arrivée)
//    plus fiable que le glisser, qui reste dépendant du navigateur.
//  - AUCUN OUTIL : les formes posées sont sélectionnables et DÉPLAÇABLES
//    (glisser une forme la repositionne, sauvegarde au relâcher).
const TOOLS: { kind: Shape["type"]; label: string }[] = [
  { kind: "arrow", label: "Flèche" },
  { kind: "rect", label: "Zone" },
  { kind: "text", label: "Texte" },
];
const COLORS = ["#d0021b", "#f5a623", "#1f4e9c", "#108c5e"];

function shapeCenter(s: Shape): { x: number; y: number } {
  if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
  if (s.type === "rect" && s.w !== undefined && s.h !== undefined) return { x: s.x1 + s.w / 2, y: s.y1 + s.h / 2 };
  return { x: s.x1, y: s.y1 };
}

function hitTest(shapes: Shape[], p: { x: number; y: number }): number {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const c = shapeCenter(shapes[i]);
    if (Math.hypot(p.x - c.x, p.y - c.y) < 0.12) return i;
  }
  return -1;
}

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
  const [pendingStart, setPendingStart] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<{ idx: number; grabX: number; grabY: number } | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  async function persist(next: Shape[]) {
    setBusy(true);
    try {
      await api.saveAnnotations(photoId, next);
      setShapes(next);
    } finally {
      setBusy(false);
    }
  }

  function point(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function commitShape(a: { x: number; y: number }, b: { x: number; y: number }) {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.02) return;
    const shape: Shape =
      tool === "arrow"
        ? { type: "arrow", x1: a.x, y1: a.y, x2: b.x, y2: b.y, color }
        : { type: "rect", x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), color };
    void persist([...shapes, shape]);
    setPendingStart(null);
    setPreview(null);
  }

  // Déplacement d'une forme : listeners globaux pendant le move
  useEffect(() => {
    if (moving === null) return;
    const move = (e: MouseEvent) => {
      const p = point(e);
      setShapes((arr) =>
        arr.map((s, i) => {
          if (i !== moving.idx) return s;
          const dx = p.x - moving.grabX;
          const dy = p.y - moving.grabY;
          if (s.type === "arrow") return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: (s.x2 ?? 0) + dx, y2: (s.y2 ?? 0) + dy };
          return { ...s, x1: (s.x1 ?? 0) + dx, y1: (s.y1 ?? 0) + dy };
        })
      );
    };
    const up = () => {
      setMoving(null);
      setShapes((arr) => {
        void persist(arr);
        return arr;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);

  function onCanvasClick(e: React.MouseEvent) {
    const p = point(e);
    if (tool === "text") {
      setTextDraft({ x: p.x, y: p.y, value: "" });
      return;
    }
    if (tool) {
      if (!pendingStart) {
        setPendingStart(p);
        setPreview(p);
      } else {
        commitShape(pendingStart, p);
      }
      return;
    }
    const idx = hitTest(shapes, p);
    if (idx >= 0) {
      setSelected(idx);
      setMoving({ idx, grabX: p.x, grabY: p.y });
    } else {
      setSelected(null);
    }
  }

  useEffect(() => {
    if (!pendingStart) return;
    const move = (e: MouseEvent) => setPreview(point(e));
    boxRef.current?.addEventListener("mousemove", move);
    return () => boxRef.current?.removeEventListener("mousemove", move);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStart !== null]);

  const deleteSelected = () => {
    if (selected === null) return;
    void persist(shapes.filter((_, i) => i !== selected));
    setSelected(null);
  };

  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <div
        ref={boxRef}
        draggable={false}
        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
        style={{ position: "relative", touchAction: "none", cursor: tool ? "crosshair" : "default" }}
        onClick={onCanvasClick}
      >
        <img src={`/photos/${filename}`} alt={alt} draggable={false}
          style={{ width: "100%", display: "block", borderRadius: "8px", userSelect: "none" }} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          {shapes.map((s, i) => {
            const isSel = selected === i;
            const sw = isSel ? 3 : 2;
            if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) {
              return (
                <g key={i}>
                  <line x1={s.x1 * 100} y1={s.y1 * 100} x2={s.x2 * 100} y2={s.y2 * 100} stroke={s.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                  <circle cx={s.x1 * 100} cy={s.y1 * 100} r={isSel ? 1.4 : 1} fill={s.color} />
                </g>
              );
            }
            if (s.type === "rect" && s.w !== undefined && s.h !== undefined) {
              return <rect key={i} x={s.x1 * 100} y1={s.y1 * 100} width={s.w * 100} height={s.h * 100} fill="none" stroke={s.color} strokeWidth={sw} vectorEffect="non-scaling-stroke" />;
            }
            return null;
          })}
          {pendingStart && preview && tool === "arrow" && (
            <line x1={pendingStart.x * 100} y1={pendingStart.y * 100} x2={preview.x * 100} y2={preview.y * 100} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          )}
          {pendingStart && preview && tool === "rect" && (
            <rect x={Math.min(pendingStart.x, preview.x) * 100} y={Math.min(pendingStart.y, preview.y) * 100} width={Math.abs(preview.x - pendingStart.x) * 100} height={Math.abs(preview.y - pendingStart.y) * 100} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {shapes
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => s.type === "text" && s.text)
          .map(({ s, i }) => (
            <span key={`t${i}`} style={{
              position: "absolute", left: `${s.x1 * 100}%`, top: `${s.y1 * 100}%`, transform: "translate(-50%, -50%)",
              background: s.color, color: "white", padding: "0.15rem 0.4rem", borderRadius: "4px",
              fontSize: "0.8rem", fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap",
              outline: selected === i ? "2px solid #333" : "none",
            }}>{s.text}</span>
          ))}
        {textDraft && (
          <span style={{
            position: "absolute", left: `${textDraft.x * 100}%`, top: `${textDraft.y * 100}%`,
            transform: "translate(-50%, -50%)", background: color, color: "white",
            padding: "0.15rem 0.4rem", borderRadius: "4px", fontSize: "0.8rem", fontWeight: 600, pointerEvents: "none",
          }}>{textDraft.value || "…"}</span>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
        {TOOLS.map((t) => (
          <button key={t.kind}
            onClick={() => { setTool(tool === t.kind ? null : t.kind); setPendingStart(null); setTextDraft(null); }}
            disabled={busy}
            style={{
              padding: "0.25rem 0.6rem", fontSize: "0.8rem", borderRadius: "4px",
              border: tool === t.kind ? "2px solid #1f4e9c" : "1px solid #c9ccd3",
              background: tool === t.kind ? "#eaf1fb" : "white",
            }} aria-pressed={tool === t.kind}>
            {t.label}
          </button>
        ))}
        {tool && (
          <>
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`Couleur ${c}`}
                style={{ width: "22px", height: "22px", borderRadius: "50%", cursor: "pointer", background: c, border: color === c ? "3px solid #333" : "1px solid #ccc" }} />
            ))}
            <span style={{ fontSize: "0.75rem", color: "#888" }}>
              {tool === "text" ? "Cliquez sur la photo, tapez, Entrée" : pendingStart ? "Cliquez pour fixer l'arrivée" : "Cliquez pour placer le départ"}
            </span>
          </>
        )}
        {!tool && <span style={{ fontSize: "0.75rem", color: "#888" }}>Cliquez une forme pour la sélectionner — glissez pour la déplacer</span>}
        {selected !== null && (
          <button onClick={deleteSelected} style={{ fontSize: "0.8rem", marginLeft: "auto", color: "#b30000" }} disabled={busy}>
            🗑 Supprimer la forme
          </button>
        )}
        {busy && <span style={{ fontSize: "0.75rem", color: "#888" }}>Enregistrement…</span>}
      </div>

      {textDraft && (
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <input autoFocus value={textDraft.value}
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            placeholder="Texte à afficher sur la photo"
            style={{ flex: 1, padding: "0.4rem", borderRadius: "4px", border: "1px solid #c9ccd3" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && textDraft.value.trim()) {
                void persist([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
                setTextDraft(null); setTool(null);
              }
              if (e.key === "Escape") { setTextDraft(null); setTool(null); }
            }} />
          <button onClick={() => {
            if (textDraft.value.trim()) {
              void persist([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
            }
            setTextDraft(null); setTool(null);
          }}>OK</button>
        </div>
      )}
    </div>
  );
}
