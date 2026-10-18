import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { parseShapes, type Shape } from "./annotated-photo";
import type { Photo } from "./api";

// U-B1 (RF-31) : lightbox plein écran — clic/tap sur une photo du canevas de
// lecture ouvre l'image en plein écran ; clic/tap à nouveau (ou Échap) ferme ;
// molette / pinch du navigateur zoome nativement l'image pleine taille.
function Lightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-label={`Photo plein écran : ${photo.alt || "photo de l'étape"}`}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", cursor: "zoom-out", touchAction: "pinch-zoom" }}
    >
      <img
        src={`/photos/${photo.filename}`}
        alt={photo.alt || ""}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "6px" }}
      />
      <button
        onClick={onClose}
        aria-label="Fermer la photo plein écran"
        style={{ position: "absolute", top: "0.8rem", right: "0.9rem", width: "2.6rem", height: "2.6rem", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.5)", background: "rgba(0,0,0,0.5)", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      ><X size={18} aria-hidden="true" /></button>
    </div>
  );
}

// Vue lecture du canevas d'étape : images positionnées librement (côte à
// côte possibles) + formes dessinées par-dessus, en lecture seule.
export default function StepCanvasView({ photos, shapes }: { photos: Photo[]; shapes: Shape[] }) {
  const [H, setH] = useState(240);
  const [zoomed, setZoomed] = useState<Photo | null>(null);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const ref = useRef<HTMLDivElement>(null);
  const sh = parseShapes(shapes);

  useEffect(() => {
    let alive = true;
    for (const ph of photos) {
      if (ratios[ph.id] !== undefined) continue;
      const img = new Image();
      img.onload = () => {
        if (alive && img.naturalWidth > 0) setRatios((r) => ({ ...r, [ph.id]: img.naturalHeight / img.naturalWidth }));
      };
      img.src = `/photos/${ph.filename}`;
    }
    return () => { alive = false; };
  }, [photos.map((p) => p.id).join(",")]);

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const width = el.getBoundingClientRect().width || el.clientWidth || 800;
      let max = 240;
      for (const ph of photos) {
        const w = typeof ph.display_w === "number" ? ph.display_w : 1;
        const y = typeof ph.display_y === "number" ? ph.display_y : 0.05;
        const hpx = y * 240 + (w * width * (ratios[ph.id] ?? 0.75)) + 12;
        if (hpx > max) max = hpx;
      }
      setH(Math.round(max));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [photos, ratios]);

  const W = ref.current?.clientWidth ?? 800;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: `${H}px`, background: "var(--surface-2, transparent)", borderRadius: "8px", overflow: "hidden" }}>
      {photos.map((ph) => {
        const w = typeof ph.display_w === "number" ? ph.display_w : ph.display_size === "full" ? 1 : ph.display_size === "large" ? 0.85 : ph.display_size === "small" ? 0.35 : 1;
        const x = typeof ph.display_x === "number" ? ph.display_x : 0;
        const y = typeof ph.display_y === "number" ? ph.display_y : 0.05;
        return (
          <img key={ph.id} src={`/photos/${ph.filename}`} alt={ph.alt || ""} draggable={false}
            onClick={() => setZoomed(ph)}
            title="Agrandir la photo"
            style={{ position: "absolute", left: `${x * 100}%`, top: `${y * 240}px`, width: `${w * 100}%`, borderRadius: "8px", display: "block", cursor: "zoom-in" }} />
        );
      })}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <defs>
          {[...new Set(sh.filter((s) => s.type === "arrow").map((s) => s.color))].map((c) => (
            <marker key={c} id={`rv-ah-${c.replace("#", "")}`} markerWidth="4.5" markerHeight="4.5" refX="3.6" refY="2.25" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L4.5,2.25 L0,4.5 z" fill={c} />
            </marker>
          ))}
        </defs>
        {sh.map((s, i) => {
          if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) {
            return <line key={i} x1={s.x1 * W} y1={s.y1 * 240} x2={s.x2 * W} y2={s.y2 * 240}
              stroke={s.color} strokeWidth={s.width ?? 2} vectorEffect="non-scaling-stroke" strokeLinecap="round" markerEnd={`url(#rv-ah-${s.color.replace("#", "")})`} />;
          }
          if (s.type === "rect" && s.w !== undefined && s.h !== undefined) {
            return <rect key={i} x={s.x1 * W} y={s.y1 * 240} width={s.w * W} height={s.h * 240}
              fill="none" stroke={s.color} strokeWidth={s.width ?? 2} vectorEffect="non-scaling-stroke" />;
          }
          return null;
        })}
      </svg>
      {zoomed && <Lightbox photo={zoomed} onClose={() => setZoomed(null)} />}
      {sh.map((s, i) => s.type === "text" && s.text ? (
        <span key={`t${i}`} style={{
          position: "absolute", left: `${s.x1 * 100}%`, top: `${s.y1 * 240}px`, transform: "translate(-50%, -50%)",
          background: s.color, color: "white", padding: "0.15rem 0.4rem", borderRadius: "4px",
          fontSize: "0.8rem", fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap",
        }}>{s.text}</span>
      ) : null)}
    </div>
  );
}
