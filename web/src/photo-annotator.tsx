import { useEffect, useRef, useState } from "react";
import { parseShapes, type Shape } from "./annotated-photo";
import { api } from "./api";

// Éditeur d'annotations :
//  - OUTIL ACTIF : clic-clic (départ, puis arrivée) ; aperçu en direct.
//  - SANS OUTIL : cliquer une forme la sélectionne ; glisser la déplace (1:1,
//    borné 0-1) ; la poignée coin bas-droit redimensionne la photo (snap S/M/L/Plein).
// Le calque SVG mesure l'image réelle : les coordonnées relatives (0-1)
// s'affichent exactement où elles ont été posées, quelle que soit la taille.
const TOOLS: { kind: Shape["type"]; label: string }[] = [
  { kind: "arrow", label: "Flèche" },
  { kind: "rect", label: "Zone" },
  { kind: "text", label: "Texte" },
];
const COLORS = ["#d0021b", "#f5a623", "#1f4e9c", "#108c5e"];
const SIZES: { v: string; label: string; width: string; w: number }[] = [
  { v: "small", label: "S", width: "35%", w: 0.35 },
  { v: "medium", label: "M", width: "60%", w: 0.6 },
  { v: "large", label: "L", width: "85%", w: 0.85 },
  { v: "full", label: "Plein", width: "100%", w: 1.0 },
];

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
  initialSize,
  initialAlign,
}: {
  photoId: number;
  filename: string;
  alt: string;
  initialAnnotations: unknown;
  initialSize?: string;
  initialAlign?: string;
}) {
  const [shapes, setShapes] = useState<Shape[]>(parseShapes(initialAnnotations));
  const [tool, setTool] = useState<Shape["type"] | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [pendingStart, setPendingStart] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<{ idx: number; grabX: number; grabY: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(initialSize ?? "medium");
  const [align, setAlign] = useState(initialAlign ?? "center");
  const [imgBox, setImgBox] = useState({ w: 100, h: 100 });
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Mesure de l'image affichée : uniquement chargée (complete), + remesure
  // tardive car le premier rendu précède le layout.
  useEffect(() => {
    const measure = () => {
      const el = imgRef.current;
      if (el && el.complete && el.clientWidth > 0) {
        setImgBox({ w: el.clientWidth, h: el.clientHeight });
      }
    };
    const img = imgRef.current;
    img?.addEventListener("load", measure);
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 60);
    measure();
    return () => {
      img?.removeEventListener("load", measure);
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, []);

  async function persist(next: Shape[]) {
    setBusy(true);
    setError(null);
    try {
      await api.saveAnnotations(photoId, next);
      setShapes(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sauvegarde impossible — réessayez");
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

  // Déplacement : la forme suit la position ABSOLUE du curseur moins l'offset
  // de prise (pas de delta cumulé) ; bornage 0-1 (jamais hors image).
  useEffect(() => {
    if (moving === null) return;
    const move = (e: MouseEvent) => {
      const p = point(e);
      setShapes((arr) =>
        arr.map((s, i) => {
          if (i !== moving.idx) return s;
          const originX = p.x - moving.grabX;
          const originY = p.y - moving.grabY;
          const bx = (v: number) => Math.min(1, Math.max(0, v));
          if (s.type === "arrow") {
            const lenX = (s.x2 ?? 0) - s.x1;
            const lenY = (s.y2 ?? 0) - s.y1;
            return { ...s, x1: bx(originX), y1: bx(originY), x2: bx(originX + lenX), y2: bx(originY + lenY) };
          }
          return { ...s, x1: bx(originX), y1: bx(originY) };
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

  // Redimensionnement de la photo : poignée coin bas-droit, snap S/M/L/Plein.
  useEffect(() => {
    if (!resizing) return;
    const move = (e: MouseEvent) => {
      const wrap = boxRef.current?.parentElement;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const rel = Math.min(1, Math.max(0.2, (e.clientX - rect.left) / rect.width));
      let best = SIZES[0];
      for (const sn of SIZES) if (Math.abs(sn.w - rel) < Math.abs(best.w - rel)) best = sn;
      if (best.v !== size) setSize(best.v);
    };
    const up = () => {
      setResizing(false);
      void api.saveLayout(photoId, size, align).catch(() => {});
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing, size, align]);

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
      const c = shapeCenter(shapes[idx]);
      setMoving({ idx, grabX: p.x - c.x, grabY: p.y - c.y });
    } else {
      setSelected(null);
    }
  }

  // Aperçu qui suit la souris entre les deux clics
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

  const setLayout = (sz?: string, al?: string) => {
    if (sz) setSize(sz);
    if (al) setAlign(al);
    void api.saveLayout(photoId, sz ?? size, al ?? align).catch(() => {});
  };

  const sw = (i: number) => (selected === i ? 3 : 2);

  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <div style={{ display: "flex", justifyContent: align, width: "100%" }}>
        <div
          ref={boxRef}
          draggable={false}
          onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{ position: "relative", touchAction: "none", cursor: tool ? "crosshair" : "default", width: SIZES.find((x) => x.v === size)?.width ?? "60%", flex: align === "center" ? "0 0 auto" : "1 1 auto" }}
          onClick={onCanvasClick}
        >
          <img
            ref={imgRef}
            src={`/photos/${filename}`}
            alt={alt}
            draggable={false}
            style={{ width: "100%", display: "block", borderRadius: "8px", userSelect: "none" }}
          />
          <svg
            viewBox={`0 0 ${imgBox.w} ${imgBox.h}`}
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          >
            <defs>
              <marker id={`ah-${photoId}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L10,5 L0,10 z" fill={color} />
              </marker>
              <marker id={`ah-sel-${photoId}`} markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L12,6 L0,12 z" fill={color} />
              </marker>
            </defs>
            {shapes.map((s, i) => {
              if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) {
                const mId = selected === i ? `ah-sel-${photoId}` : `ah-${photoId}`;
                return (
                  <line
                    key={i}
                    x1={s.x1 * imgBox.w} y1={s.y1 * imgBox.h}
                    x2={s.x2 * imgBox.w} y2={s.y2 * imgBox.h}
                    stroke={s.color} strokeWidth={sw(i)} vectorEffect="non-scaling-stroke"
                    strokeLinecap="round" markerEnd={`url(#${mId})`}
                  />
                );
              }
              if (s.type === "rect" && s.w !== undefined && s.h !== undefined) {
                return (
                  <rect
                    key={i}
                    x={s.x1 * imgBox.w} y={s.y1 * imgBox.h}
                    width={s.w * imgBox.w} height={s.h * imgBox.h}
                    fill="none" stroke={s.color} strokeWidth={sw(i)} vectorEffect="non-scaling-stroke"
                  />
                );
              }
              return null;
            })}
            {pendingStart && preview && tool === "arrow" && (
              <line
                x1={pendingStart.x * imgBox.w} y1={pendingStart.y * imgBox.h}
                x2={preview.x * imgBox.w} y2={preview.y * imgBox.h}
                stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"
                strokeLinecap="round" markerEnd={`url(#ah-${photoId})`}
              />
            )}
            {pendingStart && preview && tool === "rect" && (
              <rect
                x={Math.min(pendingStart.x, preview.x) * imgBox.w}
                y={Math.min(pendingStart.y, preview.y) * imgBox.h}
                width={Math.abs(pendingStart.x - preview.x) * imgBox.w}
                height={Math.abs(pendingStart.y - preview.y) * imgBox.h}
                fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"
              />
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
          <span
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setResizing(true); }}
            title="Glisser pour redimensionner la photo"
            role="button"
            aria-label="Redimensionner la photo"
            style={{ position: "absolute", right: 0, bottom: 0, width: "14px", height: "14px", cursor: "nwse-resize", background: "var(--accent)", borderTopLeftRadius: "4px", zIndex: 5, display: "block" }}
          />
        </div>
      </div>

      {error && <p role="alert" style={{ margin: 0, padding: "0.4rem 0.6rem", borderRadius: "6px", background: "var(--error-bg)", color: "var(--error-text)", fontSize: "0.85rem" }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            onClick={() => { setTool(tool === t.kind ? null : t.kind); setPendingStart(null); setTextDraft(null); }}
            disabled={busy}
            style={{
              padding: "0.25rem 0.6rem", fontSize: "0.8rem", borderRadius: "4px",
              border: tool === t.kind ? "2px solid var(--accent)" : "1px solid var(--border)",
              background: tool === t.kind ? "var(--accent-bg)" : "var(--surface)",
            }}
            aria-pressed={tool === t.kind}
          >
            {t.label}
          </button>
        ))}
        {tool && (
          <>
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`Couleur ${c}`}
                style={{ width: "22px", height: "22px", borderRadius: "50%", cursor: "pointer", background: c, border: color === c ? "3px solid #333" : "1px solid #ccc" }} />
            ))}
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {tool === "text" ? "Cliquez sur la photo, tapez, Entrée" : pendingStart ? "Cliquez pour fixer l'arrivée" : "Cliquez pour placer le départ"}
            </span>
          </>
        )}
        {!tool && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Cliquez une forme pour la sélectionner — glissez pour la déplacer</span>}
        {selected !== null && (
          <button onClick={deleteSelected} style={{ fontSize: "0.8rem", marginLeft: "auto", color: "var(--error-text)" }} disabled={busy}>
            🗑 Supprimer la forme
          </button>
        )}
        {busy && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Enregistrement…</span>}
        <span style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center", marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)", flexWrap: "wrap" }}>
          Taille
          {SIZES.map((sz) => (
            <button key={sz.v}
              onClick={() => setLayout(sz.v)}
              style={{ padding: "0.15rem 0.45rem", fontSize: "0.75rem", borderRadius: "4px", border: size === sz.v ? "2px solid var(--accent)" : "1px solid var(--border)", background: size === sz.v ? "var(--accent-bg)" : "var(--surface)" }}
              aria-pressed={size === sz.v}
              title={`Taille ${sz.label}`}
            >{sz.label}</button>
          ))}
          Position
          {(["left", "center", "right"] as const).map((al) => (
            <button key={al}
              onClick={() => setLayout(undefined, al)}
              style={{ padding: "0.15rem 0.45rem", fontSize: "0.75rem", borderRadius: "4px", border: align === al ? "2px solid var(--accent)" : "1px solid var(--border)", background: align === al ? "var(--accent-bg)" : "var(--surface)" }}
              aria-pressed={align === al}
              title={al === "left" ? "À gauche" : al === "center" ? "Centrée" : "À droite"}
            >{al === "left" ? "⯇" : al === "center" ? "≡" : "⯈"}</button>
          ))}
        </span>
      </div>

      {textDraft && (
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <input
            autoFocus
            value={textDraft.value}
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            placeholder="Texte à afficher sur la photo"
            style={{ flex: 1, padding: "0.4rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && textDraft.value.trim()) {
                void persist([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
                setTextDraft(null); setTool(null);
              }
              if (e.key === "Escape") { setTextDraft(null); setTool(null); }
            }}
          />
          <button
            onClick={() => {
              if (textDraft.value.trim()) {
                void persist([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
              }
              setTextDraft(null); setTool(null);
            }}
            style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600 }}
          >OK</button>
        </div>
      )}
    </div>
  );
}
