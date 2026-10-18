import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
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
  onSelectionChange,
  deleteActionRef,
  onInteract,
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
  onInteract?: () => void;
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
  // C-31 : un clic/tap HORS du canevas (champs de l'éditeur, fond de page)
  // désélectionne — avant, seule la zone canevas pouvait vider la sélection.
  useEffect(() => {
    const onDocDown = (e: PointerEvent) => {
      const el = canvasRef.current;
      if (!el || el.contains(e.target as Node)) return;
      // boutons qui agissent SUR la sélection (ex. « Objets ») : conservés
      const t = e.target as Element;
      if (t.closest?.("[data-keep-canvas-selection]")) return;
      setSelPhotos(new Set());
      setSelShapes(new Set());
    };
    document.addEventListener("pointerdown", onDocDown, true);
    return () => document.removeEventListener("pointerdown", onDocDown, true);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selRect, setSelRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [drag, setDrag] = useState<
    | { kind: "photo"; ids: number[]; grabs: { x: number; y: number }[]; from: { x: number; y: number } }
    | { kind: "shape"; indices: number[]; grabs: { x: number; y: number }[]; from: { x: number; y: number } }
    | { kind: "selrect"; from: { x: number; y: number }; touch?: boolean; prevSel?: { photos: Set<number>; shapes: Set<number> } }
    | { kind: "resize"; photoId: number }
    | null
  >(null);
  const [overTrash, setOverTrash] = useState(false);
  // C-38 : un clic/tap ne doit jamais déplacer un objet — au tactile, le doigt
  // glisse naturellement de quelques px en tapant ; sans seuil, chaque tap
  // déplaçait la forme saisie (une flèche "sautait" dans la direction du geste).
  const dragMovedRef = useRef(false);
  const overTrashRef = useRef(false);
  const lastPhotoDownRef = useRef<{ idx: number; at: number } | null>(null);
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
    overTrashRef.current = false;
    dragMovedRef.current = false;
    const move = (e: PointerEvent) => {
      const p = pt(e);
      // C-38 : hystérésis — le drag photo/shape ne s'engage qu'après ~6 px
      // de trajet réel ; en dessous, c'est un clic et rien ne bouge.
      if (!dragMovedRef.current && (drag.kind === "photo" || drag.kind === "shape")) {
        const r = canvasRef.current?.getBoundingClientRect();
        if (r) {
          const dxpx = e.clientX - (r.left + drag.from.x * r.width);
          const dypx = e.clientY - (r.top + drag.from.y * REF_H);
          if (Math.hypot(dxpx, dypx) < 6) return;
        }
        dragMovedRef.current = true;
      }
      if (drag.kind === "selrect") {
        setSelRect({ x1: drag.from.x, y1: drag.from.y, x2: p.x, y2: p.y });
        // sélection en direct — SOURIS uniquement (au tactile, le navigateur
        // peut encore annuler le geste en scroll : on ne touche pas à la
        // sélection avant le relâchement)
        if (!drag.touch) {
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
        }
        const over = p.x < 0.14 && p.y * 240 < 56 && !(drag.from.x < 0.14 && drag.from.y * 240 < 56);
        overTrashRef.current = over;
        setOverTrash(over);
      } else if (drag.kind === "photo") {
        setObjs((arr) => arr.map((o, i) => {
          if (!drag.ids.includes(i)) return o;
          const g = drag.grabs[drag.ids.indexOf(i)];
          return { ...o, x: cx(p.x - g.x), y: cy(p.y - g.y) };
        }));
        const over = p.x < 0.14 && p.y * 240 < 56 && !(drag.from.x < 0.14 && drag.from.y * 240 < 56);
        overTrashRef.current = over;
        setOverTrash(over);
      } else if (drag.kind === "shape") {
        setShapes((arr) => arr.map((s, i) => {
          if (!drag.indices.includes(i)) return s;
          const g = drag.grabs[drag.indices.indexOf(i)];
          const ox = cx(p.x - g.x), oy = cy(p.y - g.y);
          if (s.type === "arrow") {
            // C-40 : grabs = offset pointeur->CENTRE ; le déplacement conserve
            // le centre sous le pointeur — la flèche ne saute plus d'un bond
            // de la moitié de sa longueur au premier mouvement.
            const lenX = (s.x2 ?? 0) - s.x1, lenY = (s.y2 ?? 0) - s.y1;
            const nx1 = ox - lenX / 2, ny1 = oy - lenY / 2;
            return { ...s, x1: cx(nx1), y1: cy(ny1), x2: cx(nx1 + lenX), y2: cy(ny1 + lenY) };
          }
          return { ...s, x1: ox, y1: oy };
        }));
        const over = p.x < 0.14 && p.y * 240 < 56 && !(drag.from.x < 0.14 && drag.from.y * 240 < 56);
        overTrashRef.current = over;
        setOverTrash(over);
      } else if (drag.kind === "resize") {
        const r = canvasRef.current!.getBoundingClientRect();
        const rel = Math.min(1, Math.max(0.1, (e.clientX - r.left) / r.width));
        setObjs((arr) => arr.map((o) => o.photo.id === drag.photoId ? { ...o, w: rel - o.x } : o));
      }
    };
    const up = (e: PointerEvent) => {
      const p = pt(e);
      const inTrash = (q: { x: number; y: number }) => q.x < 0.14 && q.y * 240 < 56;
      // C-29/C-30 : suppression UNIQUEMENT si le doigt a réellement survolé
      // la corbeille pendant le geste (état suivi au move, départ hors zone)
      // — jamais sur un simple recalcul au relâchement.
      const trash = drag.kind === "photo" || drag.kind === "shape"
        ? overTrashRef.current && !inTrash(drag.from)
        : false;
      if (drag.kind === "selrect") {
        setSelRect(null);
        // C-30 : un clic (même légèrement tremblé) sur le fond désélectionne
        // TOUJOURS — le rectangle ne conserve que s'il a réellement encadré
        // (surface significative) ; le seuil 0.01 (=2,4 px en y) était trop
        // bas, un micro-tremblement gardait la sélection.
        const dx = Math.abs(p.x - drag.from.x), dy = Math.abs(p.y - drag.from.y);
        const reallyRect = dx >= 0.05 && dy >= 0.05; // ~40px x 12px minimum
        // C-31 : le clic fond vide AUSSI les formes (avant, seules les
        // photos étaient vidées au relâchement, une forme restait
        // sélectionnée après un clic à côté).
        if (!reallyRect && !e.shiftKey) { setSelPhotos(new Set()); setSelShapes(new Set()); }
      } else if (drag.kind === "photo") {
        if (trash) {
          // suppression des photos sélectionnées (fichiers + lignes)
          for (const i of drag.ids) void api.deletePhoto(objs[i].photo.id).catch(() => {});
          setObjs((arr) => arr.filter((_, i) => !drag.ids.includes(i)));
          setSelPhotos(new Set());
          onPhotosChanged?.();
        } else {
          if (dragMovedRef.current) {
            setObjs((arr) => {
              arr.forEach((o, i) => { if (drag.ids.includes(i)) void savePhotoLayout(o.photo.id, o.x, o.y, o.w); });
              return arr;
            });
          }
        }
      } else if (drag.kind === "shape") {
        if (trash) {
          void saveShapes(shapes.filter((_, i) => !drag.indices.includes(i)));
          setSelShapes(new Set());
        } else if (dragMovedRef.current) {
          setShapes((arr) => { void saveShapes(arr); return arr; });
        }
        // C-38 : sans mouvement réel (simple clic), rien à sauvegarder
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
    const cancel = () => {
      // C-31 : pointercancel = le navigateur prend le relais (scroll tactile
      // depuis le fond) — on nettoie l'affichage SANS désélectionner.
      setSelRect(null);
      setOverTrash(false);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [drag]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    onInteract?.();               // C-41 : toute interaction rend l'étape active côté éditeur
    if (tool) return;            // les outils agissent au clic (le click part aussi au tactile)
    const p = pt(e);
    // C-26 : les formes sont rendues AU-DESSUS des photos (SVG après les <img>)
    // — le hit-test suit le même ordre, sinon une forme posée sur une image
    // est impossible à sélectionner (la photo captait toujours le clic).
    const sh = shapeHit(p);
    const ph = sh < 0 ? photoHit(p) : -1;
    // C-19 : au DOIGT sur le fond (aucun objet, aucun outil), on ne capture
    // pas — le navigateur gère le scroll de page (touch-action: pan-y).
    // La sélection-rectangle reste un geste SOURIS ; au tactile on tape
    // directement les objets pour les sélectionner.
    // C-31 : un TAP tactile/pen sur le fond démarre bien une gesture selrect
    // (sans preventDefault ni capture) — si le navigateur prend le relais en
    // scroll, pointercancel annule sans désélectionner ; si c'est un vrai
    // tap, le relâchement passe par la branche C-30 (clic fond = vide).
    const touch = e.pointerType === "touch" || e.pointerType === "pen";
    if (touch && ph < 0 && sh < 0) {
      // C-31 : un tap sur le fond déselectionne AUSSI au tactile — mais si
      // le navigateur reprend le geste en scroll (pointercancel), prevSel
      // restaure la sélection d'avant le geste.
      if (!e.shiftKey) { setSelPhotos(new Set()); setSelShapes(new Set()); }
      setDrag({ kind: "selrect", from: p, touch: true, prevSel: { photos: new Set(selPhotos), shapes: new Set(selShapes) } });
      return;
    }
    e.preventDefault();
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* pointeur parti */ }
    if (ph >= 0) {
      // C-28 : une photo se sélectionne au DOUBLE-CLIC ; un premier clic
      // simple ne fait qu'armer (il permet en revanche de déplacer une photo
      // déjà sélectionnée, et Maj-clic reste la sélection additive).
      const now = Date.now();
      const dbl = lastPhotoDownRef.current?.idx === ph && now - (lastPhotoDownRef.current?.at ?? 0) < 400;
      lastPhotoDownRef.current = { idx: ph, at: now };
      let ids: number[];
      if (e.shiftKey) {
        ids = new Set(selPhotos).has(ph) ? [...selPhotos].filter((x) => x !== ph) : [...selPhotos, ph];
      } else if (dbl || selPhotos.has(ph)) {
        ids = [ph];
      } else {
        // premier clic simple : pas de sélection — juste préparer le drag
        // éventuel si la photo est déjà sélectionnée ; sinon ne rien faire.
        ids = [];
      }
      if (ids.length === 0 && !selPhotos.has(ph)) {
        // clic simple hors sélection : rien (pas de drag d'une photo non sélectionnée)
        return;
      }
      setSelPhotos(new Set(ids.length ? ids : [...selPhotos]));
      setSelShapes(new Set());
      setDrag({ kind: "photo", ids: [...(ids.length ? ids : selPhotos)], grabs: (ids.length ? ids : [...selPhotos]).map((i) => ({ x: p.x - objs[i].x, y: p.y - objs[i].y })), from: p });
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
    } else {
      // C-28 : un clic sur le fond (souris) désélectionne les photos —
      // et démarre le rectangle de sélection (geste souris uniquement).
      // C-28/C-31 : au pointeur souris, un clic sur le fond vide photos ET
      // formes immédiatement (le rectangle de sélection ne conserve que
      // s'il a une vraie surface — branche C-30 du up).
      // Au doigt/stylet, on ne vide qu'au relâchement (le navigateur peut
      // encore reprendre le geste en scroll : pointercancel restaure alors
      // la sélection d'avant le geste via prevSel).
      const isTouch = e.pointerType === "touch" || e.pointerType === "pen";
      if (!isTouch && !e.shiftKey) { setSelPhotos(new Set()); setSelShapes(new Set()); }
      setDrag({ kind: "selrect", from: p, touch: isTouch || undefined, prevSel: isTouch ? { photos: new Set(selPhotos), shapes: new Set(selShapes) } : undefined });
    }
  }

  function onToolPointerUp(e: React.PointerEvent) {
    if (!tool) return;
    onInteract?.();               // C-41 : poser un outil rend l'étape active
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
              fill="var(--accent)" fillOpacity="0.08" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeDasharray="4 3" />;
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
          <input autoFocus value={textDraft.value}
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            placeholder="Texte…"
            aria-label="Texte à afficher sur l'étape"
            style={{
              position: "absolute", left: `${textDraft.x * 100}%`, top: `${textDraft.y * REF_H}px`, transform: "translate(-50%, -50%)",
              background: color, color: "white", padding: "0.15rem 0.4rem", borderRadius: "4px",
              fontSize: "0.8rem", fontWeight: 600, border: "2px solid white", outline: "none",
              minWidth: "5rem", maxWidth: "60%", boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && textDraft.value.trim()) {
                void saveShapes([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
                setTextDraft(null); setTool(null);
              }
              if (e.key === "Escape") { setTextDraft(null); setTool(null); }
            }}
            onBlur={() => {
              if (textDraft.value.trim()) {
                void saveShapes([...shapes, { type: "text", x1: textDraft.x, y1: textDraft.y, text: textDraft.value.trim(), color }]);
              }
              setTextDraft(null); setTool(null);
            }} />
        )}

        {/* carré de suppression pendant un drag — en haut à gauche (C-27) */}
        {(drag?.kind === "photo" || drag?.kind === "shape") && (
          <div style={{
            position: "absolute", top: 0, left: 0, width: "14%", height: "56px",
            background: overTrash ? "var(--error-bg)" : "var(--danger-bg, #fff5f5)",
            border: `2px dashed ${overTrash ? "var(--error-text)" : "var(--danger-border, #e0b4b4)"}`,
            borderBottomRightRadius: "8px",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 25, pointerEvents: "none",
            fontSize: "0.9rem", color: "var(--error-text)", fontWeight: 600,
          }}>{overTrash ? "Relâchez ici" : <Trash2 size={18} aria-hidden="true" />}</div>
        )}
      </div>


    </div>
  );
}
