import { useEffect, useRef, useState } from "react";
import { api, type Photo } from "./api";
import { parseShapes, type Shape } from "./annotated-photo";

// Canevas unique d'une étape : les images ET les formes vivent dans le même
// espace, tout est déplaçable librement (borné au canevas).
//  - Outil actif : clic-clic pour flèche/zone ; clic pour texte.
//  - Sans outil : glisser une image la déplace ; glisser le fond fait un
//    RECTANGLE DE SÉLECTION (tout objet touché est sélectionné).
//  - Maj pour ajouter à la sélection ; glisser un objet sélectionné déplace
//    le groupe ; relâcher sur la bande du bas supprime.
export interface CanvasPhoto {
  photo: Photo;
  x: number;
  y: number;
  w: number;
}

export interface CanvasShape extends Shape {
  x1: number;
  y1: number;
}

export const TOOLS: { kind: Shape["type"]; label: string }[] = [
  { kind: "arrow", label: "Flèche" },
  { kind: "rect", label: "Zone" },
  { kind: "text", label: "Texte" },
];
export const COLORS = ["#d0021b", "#f5a623", "#1f4e9c", "#108c5e"];
// Référentiel vertical FIXE : les y sont stockés en fraction de REF_H pixels
// (et non de la hauteur visible, qui varie) — sans cela, chaque cycle
// sauvegarde/chargement décale les objets vers le haut.
const REF_H = 240;

export default function StepCanvas({
  stepId,
  photos,
  canvasShapes,
  onPhotosChanged,
  tool: toolProp,
  color: colorProp,
  onToolDone,
  onSelectionChange,
  deleteActionRef,
}: {
  stepId: number;
  photos: CanvasPhoto[];
  canvasShapes: Shape[];
  onPhotosChanged?: () => void;
  tool?: Shape["type"] | null;
  color?: string;
  onToolDone?: () => void;
  onSelectionChange?: (count: number) => void;
  deleteActionRef?: (fn: () => void) => void;
}) {
  const [objs, setObjs] = useState<CanvasPhoto[]>(photos);
  const [shapes, setShapes] = useState<Shape[]>(parseShapes(canvasShapes));
  const [tool, setTool] = useState<Shape["type"] | null>(toolProp ?? null);
  const [color, setColor] = useState(colorProp ?? COLORS[0]);
  useEffect(() => { setTool(toolProp ?? null); setPendingStart(null); setTextDraft(null); }, [toolProp]);
  useEffect(() => { if (colorProp) setColor(colorProp); }, [colorProp]);
  const [pendingStart, setPendingStart] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const [selPhotos, setSelPhotos] = useState<Set<number>>(new Set());
  const [selShapes, setSelShapes] = useState<Set<number>>(new Set());
  useEffect(() => { onSelectionChange?.(selPhotos.size + selShapes.size); }, [selPhotos, selShapes, onSelectionChange]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selRect, setSelRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [drag, setDrag] = useState<
    | { kind: "photo"; ids: number[]; grabs: { x: number; y: number }[]; from: { x: number; y: number } }
    | { kind: "shape"; indices: number[]; grabs: { x: number; y: number }[]; from: { x: number; y: number } }
    | { kind: "selrect"; from: { x: number; y: number } }
    | { kind: "resize"; photoId: number }
    | null
  >(null);
  const [overTrash, setOverTrash] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setObjs(photos); }, [JSON.stringify(photos)]);
  useEffect(() => { setShapes(parseShapes(canvasShapes)); }, [JSON.stringify(canvasShapes)]);

  // ratios réels (h/w) des images : chargés une fois par photo, utilisés pour
  // le hit-test, la sélection au rectangle et la hauteur du canevas.
  const [ratios, setRatios] = useState<Record<number, number>>({});
  useEffect(() => {
    let alive = true;
    for (const o of objs) {
      if (ratios[o.photo.id] !== undefined) continue;
      const img = new Image();
      img.onload = () => {
        if (alive && img.naturalWidth > 0) setRatios((r) => ({ ...r, [o.photo.id]: img.naturalHeight / img.naturalWidth }));
      };
      img.src = `/photos/${o.photo.filename}`;
    }
    return () => { alive = false; };
  }, [objs.map((o) => o.photo.id).join(",")]);
  const ratioOf = (o: CanvasPhoto) => ratios[o.photo.id] ?? 0.75;

  // hauteur du canevas : couvre toutes les images (y + h) avec un minimum
  // et une marge ; les y et les hauteurs sont en fraction de REF_H (fixe).
  const [canvasW, setCanvasW] = useState(0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setCanvasW(el.getBoundingClientRect().width || el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
 window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const W = canvasW || 800;
  const photoH = (o: CanvasPhoto) => Math.max(0.04, (o.w * W * ratioOf(o)) / REF_H);
  const H = Math.round(Math.max(
    REF_H,
    ...objs.map((o) => (o.y + photoH(o)) * REF_H + 12),
    ...shapes.map((sh) => {
      const bottom = sh.type === "rect" && sh.h !== undefined ? sh.y1 + sh.h
        : sh.type === "arrow" && sh.y2 !== undefined ? Math.max(sh.y1, sh.y2)
        : sh.y1 + 0.1;
      return bottom * REF_H + 12;
    }),
  ));

  async function saveShapes(next: Shape[]) {
    setBusy(true); setError(null);
    try {
      await fetch(`/api/steps/${stepId}/canvas`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shapes: next }),
      });
      setShapes(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sauvegarde impossible");
    } finally { setBusy(false); }
  }

  async function savePhotoLayout(photoId: number, x: number, y: number, w: number) {
    try {
      await api.saveLayout(photoId, "full", "left", x, y, w);
      onPhotosChanged?.();
    } catch { /* silencieux : la prochaine action resynchronisera */ }
  }

  function pt(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.max(0, (e.clientY - r.top) / REF_H),
    };
  }

  function photoHit(p: { x: number; y: number }): number {
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      const h = photoH(o);
      if (p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + h) return i;
    }
    return -1;
  }


  function shapeHit(p: { x: number; y: number }): number {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) {
        const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
        if (Math.hypot(p.x - cx, p.y - cy) < Math.max(0.08, Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / 2)) return i;
      } else if (s.type === "rect" && s.w !== undefined && s.h !== undefined) {
        if (p.x >= s.x1 && p.x <= s.x1 + s.w && p.y >= s.y1 && p.y <= s.y1 + s.h) return i;
      } else {
        if (Math.hypot(p.x - s.x1, p.y - s.y1) < 0.06) return i;
      }
    }
    return -1;
  }

  // glissements : listeners globaux, positions absolues, bornage
  useEffect(() => {
    if (!drag) return;
    const cx = (v: number) => Math.min(1, Math.max(0, v));
    const cy = (v: number) => Math.max(0, v);
    const move = (e: PointerEvent) => {
      const p = pt(e);
      if (drag.kind === "selrect") {
        setSelRect({ x1: drag.from.x, y1: drag.from.y, x2: p.x, y2: p.y });
        // sélection en direct
        const R = { l: Math.min(drag.from.x, p.x), r: Math.max(drag.from.x, p.x), t: Math.min(drag.from.y, p.y), b: Math.max(drag.from.y, p.y) };
        const np = new Set<number>();
        objs.forEach((o, i) => {
          const h = photoH(o);
          if (o.x < R.r && o.x + o.w > R.l && o.y < R.b && o.y + h > R.t) np.add(i);
        });
        const ns = new Set<number>();
        shapes.forEach((s, i) => {
          const c = s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined ? { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 } : { x: s.x1, y: s.y1 };
          if (c.x >= R.l && c.x <= R.r && c.y >= R.t && c.y <= R.b) ns.add(i);
        });
        setSelPhotos(np); setSelShapes(ns);
        setOverTrash(p.x > 0.85);
      } else if (drag.kind === "photo") {
        const dx = p.x - drag.from.x, dy = p.y - drag.from.y;
        setObjs((arr) => arr.map((o, i) => {
          if (!drag.ids.includes(i)) return o;
          const g = drag.grabs[drag.ids.indexOf(i)];
          return { ...o, x: cx(p.x - g.x), y: cy(p.y - g.y) };
        }));
        setOverTrash(p.x > 0.85);
      } else if (drag.kind === "shape") {
        setShapes((arr) => arr.map((s, i) => {
          if (!drag.indices.includes(i)) return s;
          const g = drag.grabs[drag.indices.indexOf(i)];
          const ox = cx(p.x - g.x), oy = cy(p.y - g.y);
          if (s.type === "arrow") {
            const lenX = (s.x2 ?? 0) - s.x1, lenY = (s.y2 ?? 0) - s.y1;
            return { ...s, x1: ox, y1: oy, x2: ox + lenX, y2: oy + lenY };
          }
          return { ...s, x1: ox, y1: oy };
        }));
        setOverTrash(p.x > 0.85);
      } else if (drag.kind === "resize") {
        const r = canvasRef.current!.getBoundingClientRect();
        const rel = Math.min(1, Math.max(0.1, (e.clientX - r.left) / r.width));
        setObjs((arr) => arr.map((o) => o.photo.id === drag.photoId ? { ...o, w: rel - o.x } : o));
      }
    };
    const up = (e: PointerEvent) => {
      const p = pt(e);
      const trash = p.x > 0.85;
      if (drag.kind === "selrect") {
        setSelRect(null);
        const moved = Math.hypot(p.x - drag.from.x, p.y - drag.from.y) >= 0.01;
        if (!moved && !e.shiftKey) { setSelPhotos(new Set()); setSelShapes(new Set()); }
      } else if (drag.kind === "photo") {
        if (trash) {
          // suppression des photos sélectionnées (fichiers + lignes)
          for (const i of drag.ids) void api.deletePhoto(objs[i].photo.id).catch(() => {});
          setObjs((arr) => arr.filter((_, i) => !drag.ids.includes(i)));
          setSelPhotos(new Set());
          onPhotosChanged?.();
        } else {
          setObjs((arr) => {
            arr.forEach((o, i) => { if (drag.ids.includes(i)) void savePhotoLayout(o.photo.id, o.x, o.y, o.w); });
            return arr;
          });
        }
      } else if (drag.kind === "shape") {
        if (trash) {
          void saveShapes(shapes.filter((_, i) => !drag.indices.includes(i)));
          setSelShapes(new Set());
        } else {
          setShapes((arr) => { void saveShapes(arr); return arr; });
        }
      } else if (drag.kind === "resize") {
        setObjs((arr) => {
          const o = arr.find((x) => x.photo.id === drag.photoId);
          if (o) void savePhotoLayout(o.photo.id, o.x, o.y, o.w);
          return arr;
        });
      }
      setOverTrash(false);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (tool) return;            // les outils agissent au clic (le click part aussi au tactile)
    const p = pt(e);
    const ph = photoHit(p);
    const sh = ph < 0 ? shapeHit(p) : -1;
    // C-19 : au DOIGT sur le fond (aucun objet, aucun outil), on ne capture
    // pas — le navigateur gère le scroll de page (touch-action: pan-y).
    // La sélection-rectangle reste un geste SOURIS ; au tactile on tape
    // directement les objets pour les sélectionner.
    if (e.pointerType !== "mouse" && ph < 0 && sh < 0) return;
    e.preventDefault();
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* pointeur parti */ }
    if (ph >= 0) {
      let ids: number[];
      if (e.shiftKey) {
        ids = new Set(selPhotos).has(ph) ? [...selPhotos].filter((x) => x !== ph) : [...selPhotos, ph];
      } else if (selPhotos.has(ph)) {
        ids = [...selPhotos];
      } else {
        ids = [ph];
      }
      setSelPhotos(new Set(ids));
      setSelShapes(new Set());
      setDrag({ kind: "photo", ids, grabs: ids.map((i) => ({ x: p.x - objs[i].x, y: p.y - objs[i].y })), from: p });
    } else if (sh >= 0) {
      let idx: number[];
      if (e.shiftKey) {
        idx = selShapes.has(sh) ? [...selShapes].filter((x) => x !== sh) : [...selShapes, sh];
      } else if (selShapes.has(sh)) {
        idx = [...selShapes];
      } else {
        idx = [sh];
      }
      setSelShapes(new Set(idx));
      setSelPhotos(new Set());
      const grabs = idx.map((i) => {
        const s = shapes[i];
        const c = s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined ? { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 } : { x: s.x1, y: s.y1 };
        return { x: p.x - c.x, y: p.y - c.y };
      });
      setDrag({ kind: "shape", indices: idx, grabs, from: p });
    } else if (e.pointerType === "mouse") {
      // fond : rectangle de sélection — GESTE SOURIS UNIQUEMENT.
      // Au doigt, le fond ne démarre aucun drag : touch-action: pan-y
      // laisse le navigateur scroller la page (C-19/C-21).
      setDrag({ kind: "selrect", from: p });
    }
  }

  function onToolPointerUp(e: React.PointerEvent) {
    if (!tool) return;
    const p = pt(e);
    if (tool === "text") {
      setTextDraft({ x: p.x, y: p.y, value: "" });
      return;
    }
    if (tool) {
      if (!pendingStart) { setPendingStart(p); setPreview(p); }
      else {
        const a = pendingStart, b = p;
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 0.02) {
          const shape: Shape = tool === "arrow"
            ? { type: "arrow", x1: a.x, y1: a.y, x2: b.x, y2: b.y, color }
            : { type: "rect", x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), color };
          void saveShapes([...shapes, shape]);
        }
        setPendingStart(null); setPreview(null);
      }
    }
  }

  useEffect(() => {
    if (!pendingStart) return;
    const move = (e: PointerEvent) => setPreview(pt(e));
    canvasRef.current?.addEventListener("pointermove", move);
    return () => canvasRef.current?.removeEventListener("pointermove", move);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStart !== null]);

  const deleteSelection = () => {
    if (selShapes.size) void saveShapes(shapes.filter((_, i) => !selShapes.has(i)));
    if (selPhotos.size) {
      for (const i of selPhotos) void api.deletePhoto(objs[i].photo.id).catch(() => {});
      setObjs((arr) => arr.filter((_, i) => !selPhotos.has(i)));
      onPhotosChanged?.();
    }
    setSelPhotos(new Set()); setSelShapes(new Set());
  };
  useEffect(() => { deleteActionRef?.(deleteSelection); });

  const sw = (i: number) => (selShapes.has(i) ? 3 : 2);

  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
          {tool ? (tool === "text" ? "Touchez pour poser le texte" : pendingStart ? "Touchez l'arrivée" : "Touchez le départ")
            : "Glissez le fond : sélection · relâchez à droite pour supprimer"}
        </span>
        {busy && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>…</span>}
      </div>

      {error && <p role="alert" style={{ margin: 0, padding: "0.3rem 0.5rem", borderRadius: "6px", background: "var(--error-bg)", color: "var(--error-text)", fontSize: "0.82rem" }}>{error}</p>}

      {/* zone canevas : images + formes + interactions */}
      <div
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerUp={onToolPointerUp}
        style={{ position: "relative", width: "100%", height: `${H}px`, background: "var(--surface-2, #f0f1f4)", borderRadius: "8px", overflow: "hidden", touchAction: tool ? "none" : "pan-y", cursor: tool ? "crosshair" : "default" }}
      >
        {/* images */}
        {objs.map((o, i) => (
          <div key={o.photo.id} style={{
            position: "absolute", left: `${o.x * 100}%`, top: `${o.y * REF_H}px`, width: `${o.w * 100}%`,
            outline: selPhotos.has(i) ? "2px solid var(--accent)" : "none", borderRadius: "8px", overflow: "hidden",
          }}>
            <img src={`/photos/${o.photo.filename}`} alt={o.photo.alt || ""} draggable={false}
              style={{ width: "100%", display: "block", pointerEvents: "none" }} />
            <span
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelPhotos(new Set([i])); setDrag({ kind: "resize", photoId: o.photo.id }); }}
              role="button" aria-label="Redimensionner l'image"
              style={{ position: "absolute", right: 0, bottom: 0, width: "28px", height: "28px", cursor: "ew-resize", background: "var(--accent)", borderTopLeftRadius: "6px", display: "block", opacity: 0.85, touchAction: "none" }}
            />
          </div>
        ))}

        {/* formes SVG en coordonnées canevas */}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <defs>
            {[...new Set(shapes.filter((s) => s.type === "arrow").map((s) => s.color))].concat(pendingStart && tool === "arrow" ? [color] : []).map((c) => (
              <marker key={c} id={`cs-ah-${stepId}-${c.replace("#", "")}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L10,5 L0,10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {shapes.map((s, i) => {
            const W = canvasRef.current?.clientWidth ?? 800;
            if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) {
              return <line key={i} x1={s.x1 * W} y1={s.y1 * REF_H} x2={s.x2 * W} y2={s.y2 * REF_H}
                stroke={s.color} strokeWidth={sw(i)} vectorEffect="non-scaling-stroke" strokeLinecap="round" markerEnd={`url(#cs-ah-${stepId}-${s.color.replace("#", "")})`} />;
            }
            if (s.type === "rect" && s.w !== undefined && s.h !== undefined) {
              return <rect key={i} x={s.x1 * W} y={s.y1 * REF_H} width={s.w * W} height={s.h * REF_H}
                fill="none" stroke={s.color} strokeWidth={sw(i)} vectorEffect="non-scaling-stroke" />;
            }
            return null;
          })}
          {pendingStart && preview && tool === "arrow" && (() => {
            const W = canvasRef.current?.clientWidth ?? 800;
            return <line x1={pendingStart.x * W} y1={pendingStart.y * REF_H} x2={preview.x * W} y2={preview.y * REF_H}
              stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" markerEnd={`url(#cs-ah-${stepId}-${color.replace("#", "")})`} />;
          })()}
          {pendingStart && preview && tool === "rect" && (() => {
            const W = canvasRef.current?.clientWidth ?? 800;
            return <rect x={Math.min(pendingStart.x, preview.x) * W} y={Math.min(pendingStart.y, preview.y) * REF_H}
              width={Math.abs(pendingStart.x - preview.x) * W} height={Math.abs(pendingStart.y - preview.y) * REF_H}
              fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
          })()}
          {selRect && (() => {
            const W = canvasRef.current?.clientWidth ?? 800;
            return <rect x={Math.min(selRect.x1, selRect.x2) * W} y={Math.min(selRect.y1, selRect.y2) * REF_H}
              width={Math.abs(selRect.x2 - selRect.x1) * W} height={Math.abs(selRect.y2 - selRect.y1) * REF_H}
              fill="rgba(31,78,156,0.08)" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeDasharray="4 3" />;
          })()}
        </svg>

        {/* textes */}
        {shapes.map((s, i) => s.type === "text" && s.text ? (
          <span key={`t${i}`} style={{
            position: "absolute", left: `${s.x1 * 100}%`, top: `${s.y1 * REF_H}px`, transform: "translate(-50%, -50%)",
            background: s.color, color: "white", padding: "0.15rem 0.4rem", borderRadius: "4px",
            fontSize: "0.8rem", fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap",
            outline: selShapes.has(i) ? "2px solid #333" : "none",
          }}>{s.text}</span>
        ) : null)}
        {textDraft && (
          <span style={{
            position: "absolute", left: `${textDraft.x * 100}%`, top: `${textDraft.y * REF_H}px`, transform: "translate(-50%, -50%)",
            background: color, color: "white", padding: "0.15rem 0.4rem", borderRadius: "4px",
            fontSize: "0.8rem", fontWeight: 600, pointerEvents: "none",
          }}>{textDraft.value || "…"}</span>
        )}

        {/* bande de suppression pendant un drag */}
        {(drag?.kind === "photo" || drag?.kind === "shape") && (
          <div style={{
            position: "absolute", top: 0, bottom: 0, right: 0, width: "15%",
            background: overTrash ? "var(--error-bg)" : "var(--danger-bg, #fff5f5)",
            border: `2px dashed ${overTrash ? "var(--error-text)" : "var(--danger-border, #e0b4b4)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 25, pointerEvents: "none",
            fontSize: "0.75rem", color: "var(--error-text)", fontWeight: 600,
          }}>{overTrash ? "Relâchez ici" : "🗑"}</div>
        )}
      </div>

      {textDraft && (
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <input autoFocus value={textDraft.value}
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            placeholder="Texte à afficher"
            style={{ flex: 1, padding: "0.4rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && textDraft.value.trim()) {
                void saveShapes([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
                setTextDraft(null); setTool(null);
              }
              if (e.key === "Escape") { setTextDraft(null); setTool(null); }
            }} />
          <button onClick={() => {
            if (textDraft.value.trim()) void saveShapes([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
            setTextDraft(null); setTool(null);
            onToolDone?.();
          }} style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600 }}>OK</button>
        </div>
      )}
    </div>
  );
}
