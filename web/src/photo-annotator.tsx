import { useEffect, useRef, useState } from "react";
import { parseShapes, type Shape } from "./annotated-photo";
import { api } from "./api";

// Éditeur d'annotations + mise en page de la photo :
//  - OUTIL ACTIF : clic-clic (départ/arrivée) pour flèche/zone ; clic pour texte.
//  - SANS OUTIL :
//      · clic sur une forme : sélection ; Maj-clic : ajoute à la sélection
//      · glisser une forme (ou une sélection multiple) : déplacement 1:1 borné
//      · poignée coin bas-droit de la PHOTO : largeur libre (0.2-1)
//      · glisser la photo elle-même (aucune forme visée) : position libre x/y
//      · relâcher une sélection sur la zone de suppression : supprimée
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
    if (Math.hypot(p.x - c.x, p.y - c.y) < 0.1) return i;
  }
  return -1;
}

interface Layout {
  x: number | null;
  y: number | null;
  w: number | null;
}

export default function PhotoAnnotator({
  photoId,
  filename,
  alt,
  initialAnnotations,
  initialLayout,
}: {
  photoId: number;
  filename: string;
  alt: string;
  initialAnnotations: unknown;
  initialLayout?: Layout;
}) {
  const [shapes, setShapes] = useState<Shape[]>(parseShapes(initialAnnotations));
  const [tool, setTool] = useState<Shape["type"] | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [pendingStart, setPendingStart] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // layout libre : w = largeur relative (0.2-1), x/y = position relative dans l'étape
  const [layout, setLayout] = useState<Layout>({ x: initialLayout?.x ?? null, y: initialLayout?.y ?? null, w: initialLayout?.w ?? 0.65 });
  const [imgBox, setImgBox] = useState({ w: 100, h: 100 });
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  // interactions en cours
  const [drag, setDrag] = useState<
    | { kind: "shapes"; indices: number[]; grabs: { x: number; y: number }[]; from: { x: number; y: number } }
    | { kind: "photo"; from: { x: number; y: number }; fromLayout: Layout }
    | { kind: "resize"; fromX: number }
    | null
  >(null);
  const [overTrash, setOverTrash] = useState(false);

  useEffect(() => {
    const measure = () => {
      const el = imgRef.current;
      if (el && el.complete && el.clientWidth > 0) setImgBox({ w: el.clientWidth, h: el.clientHeight });
    };
    const img = imgRef.current;
    img?.addEventListener("load", measure);
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 60);
    measure();
    return () => { img?.removeEventListener("load", measure); window.removeEventListener("resize", measure); clearTimeout(t); };
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

  async function persistLayout(next: Layout) {
    try {
      await api.saveLayout(photoId, "full", "left", next.x, next.y, next.w);
    } catch { /* bandeau d'erreur plus parlant sur les annotations */ }
  }

  function point(e: { clientX: number; clientY: number }, el: HTMLElement | null): { x: number; y: number } {
    const rect = (el ?? boxRef.current!).getBoundingClientRect();
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

  // Toutes les interactions de glissement (formes, photo, resize) : listeners
  // globaux, positions absolues, bornage.
  useEffect(() => {
    if (!drag) return;
    const bx = (v: number) => Math.min(1, Math.max(0, v));
    const move = (e: MouseEvent) => {
      if (drag.kind === "shapes") {
        const p = point(e, boxRef.current);
        const dx = p.x - drag.from.x;
        const dy = p.y - drag.from.y;
        setShapes((arr) => arr.map((s, i) => {
          if (!drag.indices.includes(i)) return s;
          const g = drag.grabs[drag.indices.indexOf(i)];
          const ox = p.x - g.x;
          const oy = p.y - g.y;
          if (s.type === "arrow") {
            const lenX = (s.x2 ?? 0) - s.x1;
            const lenY = (s.y2 ?? 0) - s.y1;
            return { ...s, x1: bx(ox), y1: bx(oy), x2: bx(ox + lenX), y2: bx(oy + lenY) };
          }
          return { ...s, x1: bx(ox), y1: bx(oy) };
        }));
        // zone de suppression survolée ?
        const sp = point(e, stepRef.current);
        setOverTrash(sp.y > 0.92);
      } else if (drag.kind === "photo") {
        const sp = point(e, stepRef.current);
        setLayout((l) => ({ ...l, x: bx(sp.x - 0.02), y: bx(sp.y) }));
      } else if (drag.kind === "resize") {
        const wrap = stepRef.current;
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        const rel = Math.min(1, Math.max(0.15, (e.clientX - rect.left) / rect.width));
        setLayout((l) => ({ ...l, w: rel }));
      }
    };
    const up = (e: MouseEvent) => {
      if (drag.kind === "shapes") {
        const sp = point(e, stepRef.current);
        if (sp.y > 0.92) {
          void persist(shapes.filter((_, i) => !drag.indices.includes(i)));
          setSelected(new Set());
        } else {
          setShapes((arr) => { void persist(arr); return arr; });
        }
        setOverTrash(false);
      } else if (drag.kind === "photo" || drag.kind === "resize") {
        setLayout((l) => { void persistLayout(l); return l; });
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  function onCanvasMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const p = point(e, boxRef.current);
    if (tool) return;               // les clics d'outils passent par onClick
    const idx = hitTest(shapes, p);
    if (idx >= 0) {
      let nextSel: Set<number>;
      if (e.shiftKey) {
        nextSel = new Set(selected);
        if (nextSel.has(idx)) nextSel.delete(idx); else nextSel.add(idx);
      } else if (selected.has(idx)) {
        nextSel = selected;          // drag d'une sélection existante
      } else {
        nextSel = new Set([idx]);
      }
      setSelected(nextSel);
      const indices = [...nextSel];
      const grabs = indices.map((i) => {
        const c = shapeCenter(shapes[i]);
        return { x: p.x - c.x, y: p.y - c.y };
      });
      setDrag({ kind: "shapes", indices, grabs, from: p });
    } else {
      if (!e.shiftKey) setSelected(new Set());
      // fond de la photo : déplacement libre de l'image dans l'étape
      const sp = point(e, stepRef.current);
      setDrag({ kind: "photo", from: sp, fromLayout: layout });
    }
  }

  function onCanvasClick(e: React.MouseEvent) {
    const p = point(e, boxRef.current);
    if (tool === "text") {
      setTextDraft({ x: p.x, y: p.y, value: "" });
      return;
    }
    if (tool) {
      if (!pendingStart) { setPendingStart(p); setPreview(p); }
      else commitShape(pendingStart, p);
      return;
    }
    // clic simple sans forme : la sélection a déjà été gérée au mousedown
  }

  useEffect(() => {
    if (!pendingStart) return;
    const move = (e: MouseEvent) => setPreview(point(e, boxRef.current));
    boxRef.current?.addEventListener("mousemove", move);
    return () => boxRef.current?.removeEventListener("mousemove", move);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStart !== null]);

  const sw = (i: number) => (selected.has(i) ? 3 : 2);

  return (
    <div ref={stepRef} style={{ display: "grid", gap: "0.4rem", position: "relative", width: "100%" }}>
      {/* zone de suppression : visible pendant un drag de formes */}
      {drag?.kind === "shapes" && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "8%",
          background: overTrash ? "var(--error-bg)" : "var(--danger-bg)",
          border: `2px dashed ${overTrash ? "var(--error-text)" : "var(--danger-border)"}`,
          borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 25, pointerEvents: "none", fontSize: "0.8rem", color: "var(--error-text)", fontWeight: 600,
        }}>
          {overTrash ? "Relâchez pour supprimer" : "🗑 Relâchez ici pour supprimer"}
        </div>
      )}

      <div style={{ width: "100%", minHeight: "8px", position: "relative" }}>
        <div
          ref={boxRef}
          draggable={false}
          onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onMouseDown={onCanvasMouseDown}
          onClick={onCanvasClick}
          style={{
            position: "relative", touchAction: "none",
            cursor: tool ? "crosshair" : drag?.kind === "photo" ? "grabbing" : "grab",
            width: `${(layout.w ?? 0.65) * 100}%`,
            marginLeft: layout.x !== null ? `${layout.x * 100}%` : undefined,
            marginTop: layout.y !== null ? `${Math.max(0, (layout.y - 0.06)) * 220}px` : undefined,
          }}
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
            </defs>
            {shapes.map((s, i) => {
              if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) {
                return (
                  <line key={i} x1={s.x1 * imgBox.w} y1={s.y1 * imgBox.h} x2={s.x2 * imgBox.w} y2={s.y2 * imgBox.h}
                    stroke={s.color} strokeWidth={sw(i)} vectorEffect="non-scaling-stroke" strokeLinecap="round"
                    markerEnd={`url(#ah-${photoId})`} />
                );
              }
              if (s.type === "rect" && s.w !== undefined && s.h !== undefined) {
                return (
                  <rect key={i} x={s.x1 * imgBox.w} y={s.y1 * imgBox.h} width={s.w * imgBox.w} height={s.h * imgBox.h}
                    fill="none" stroke={s.color} strokeWidth={sw(i)} vectorEffect="non-scaling-stroke" />
                );
              }
              return null;
            })}
            {pendingStart && preview && tool === "arrow" && (
              <line x1={pendingStart.x * imgBox.w} y1={pendingStart.y * imgBox.h} x2={preview.x * imgBox.w} y2={preview.y * imgBox.h}
                stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" markerEnd={`url(#ah-${photoId})`} />
            )}
            {pendingStart && preview && tool === "rect" && (
              <rect x={Math.min(pendingStart.x, preview.x) * imgBox.w} y={Math.min(pendingStart.y, preview.y) * imgBox.h}
                width={Math.abs(pendingStart.x - preview.x) * imgBox.w} height={Math.abs(pendingStart.y - preview.y) * imgBox.h}
                fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
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
                outline: selected.has(i) ? "2px solid #333" : "none",
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
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDrag({ kind: "resize", fromX: e.clientX }); }}
            title="Glisser pour redimensionner la photo"
            role="button" aria-label="Redimensionner la photo"
            style={{ position: "absolute", right: 0, bottom: 0, width: "14px", height: "14px", cursor: "ew-resize", background: "var(--accent)", borderTopLeftRadius: "4px", zIndex: 5, display: "block" }}
          />
        </div>
      </div>

      {error && <p role="alert" style={{ margin: 0, padding: "0.4rem 0.6rem", borderRadius: "6px", background: "var(--error-bg)", color: "var(--error-text)", fontSize: "0.85rem" }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
        {TOOLS.map((t) => (
          <button key={t.kind}
            onClick={() => { setTool(tool === t.kind ? null : t.kind); setPendingStart(null); setTextDraft(null); }}
            disabled={busy}
            style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", borderRadius: "4px", border: tool === t.kind ? "2px solid var(--accent)" : "1px solid var(--border)", background: tool === t.kind ? "var(--accent-bg)" : "var(--surface)" }}
            aria-pressed={tool === t.kind}
          >{t.label}</button>
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
        {!tool && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Glissez la photo pour la déplacer · poignée bleue pour la largeur · Maj-clic : sélection multiple · glissez vers la zone 🗑 pour supprimer
          </span>
        )}
        {selected.size > 0 && (
          <button onClick={() => { void persist(shapes.filter((_, i) => !selected.has(i))); setSelected(new Set()); }}
            style={{ fontSize: "0.8rem", marginLeft: "auto", color: "var(--error-text)" }} disabled={busy}>
            🗑 Supprimer ({selected.size})
          </button>
        )}
        {busy && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Enregistrement…</span>}
      </div>

      {textDraft && (
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <input autoFocus value={textDraft.value}
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            placeholder="Texte à afficher sur la photo"
            style={{ flex: 1, padding: "0.4rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
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
          }} style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600 }}>OK</button>
        </div>
      )}
    </div>
  );
}
