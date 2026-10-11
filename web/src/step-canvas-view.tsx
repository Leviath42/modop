import { useEffect, useRef, useState } from "react";
import { parseShapes, type Shape } from "./annotated-photo";
import type { Photo } from "./api";

// Vue lecture du canevas d'étape : images positionnées librement (côte à
// côte possibles) + formes dessinées par-dessus, en lecture seule.
export default function StepCanvasView({ photos, shapes }: { photos: Photo[]; shapes: Shape[] }) {
  const [H, setH] = useState(240);
  const ref = useRef<HTMLDivElement>(null);
  const sh = parseShapes(shapes);

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      // hauteur = max des images placées (y + hauteur estimée) avec minimum
      let max = 200;
      for (const ph of photos) {
        const w = typeof ph.display_w === "number" ? ph.display_w : 0.6;
        const x = typeof ph.display_x === "number" ? ph.display_x : 0;
        const y = typeof ph.display_y === "number" ? ph.display_y : 0;
        const ratio = 0.75;
        const bottom = (y * 0.6 + w * ratio + 0.05) * 240;
        if (bottom > max) max = bottom;
      }
      setH(Math.round(max));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [photos]);

  const W = ref.current?.clientWidth ?? 800;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: `${H}px`, background: "var(--surface-2, transparent)", borderRadius: "8px", overflow: "hidden" }}>
      {photos.map((ph) => {
        const w = typeof ph.display_w === "number" ? ph.display_w : ph.display_size === "full" ? 1 : ph.display_size === "large" ? 0.85 : ph.display_size === "small" ? 0.35 : 0.6;
        const x = typeof ph.display_x === "number" ? ph.display_x : 0;
        const y = typeof ph.display_y === "number" ? ph.display_y * 0.6 : 0.05;
        return (
          <img key={ph.id} src={`/photos/${ph.filename}`} alt={ph.alt || ""} draggable={false}
            style={{ position: "absolute", left: `${x * 100}%`, top: `${y * H}px`, width: `${w * 100}%`, borderRadius: "8px", display: "block" }} />
        );
      })}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <defs>
          <marker id="rv-ah" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L10,5 L0,10 z" fill="#888" />
          </marker>
        </defs>
        {sh.map((s, i) => {
          if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) {
            return <line key={i} x1={s.x1 * W} y1={s.y1 * H} x2={s.x2 * W} y2={s.y2 * H}
              stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" markerEnd="url(#rv-ah)" />;
          }
          if (s.type === "rect" && s.w !== undefined && s.h !== undefined) {
            return <rect key={i} x={s.x1 * W} y1={s.y1 * H} width={s.w * W} height={s.h * H}
              fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
          }
          return null;
        })}
      </svg>
      {sh.map((s, i) => s.type === "text" && s.text ? (
        <span key={`t${i}`} style={{
          position: "absolute", left: `${s.x1 * 100}%`, top: `${s.y1 * 100}%`, transform: "translate(-50%, -50%)",
          background: s.color, color: "white", padding: "0.15rem 0.4rem", borderRadius: "4px",
          fontSize: "0.8rem", fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap",
        }}>{s.text}</span>
      ) : null)}
    </div>
  );
}
