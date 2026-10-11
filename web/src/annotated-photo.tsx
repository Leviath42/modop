// Rendu d'une photo avec ses annotations persistées (shapes JSON).
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

export default function AnnotatedPhoto({
  filename,
  alt,
  shapes,
  maxWidth,
  onImageClick,
  zoomable,
}: {
  filename: string;
  alt: string;
  shapes: Shape[];
  maxWidth: string;
  onImageClick?: () => void;
  zoomable?: boolean;
}) {
  return (
    <figure style={{ margin: 0, position: "relative", maxWidth }}>
      <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
        <img
          src={`/photos/${filename}`}
          alt={alt}
          loading="lazy"
          draggable={false}
          style={{ width: "100%", display: "block", borderRadius: "8px", userSelect: "none", cursor: zoomable ? "zoom-in" : undefined }}
          onClick={onImageClick}
        />
        {shapes.length > 0 && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          >
            {shapes.map((s, i) => {
              if (s.type === "arrow" && s.x2 !== undefined && s.y2 !== undefined) {
                return (
                  <line
                    key={i}
                    x1={s.x1 * 100} y1={s.y1 * 100} x2={s.x2 * 100} y2={s.y2 * 100}
                    stroke={s.color} strokeWidth="1.2" vectorEffect="non-scaling-stroke"
                    markerEnd=""
                  />
                );
              }
              if (s.type === "rect" && s.w !== undefined && s.h !== undefined) {
                return (
                  <rect
                    key={i}
                    x={s.x1 * 100} y={s.y1 * 100} width={s.w * 100} height={s.h * 100}
                    fill="none" stroke={s.color} strokeWidth="1.2" vectorEffect="non-scaling-stroke"
                  />
                );
              }
              return null;
            })}
          </svg>
        )}
        {shapes
          .filter((s) => s.type === "text" && s.text)
          .map((s, i) => (
            <span
              key={i}
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
      </div>
      {alt && <figcaption style={{ color: "#666", fontSize: "0.85rem" }}>{alt}</figcaption>}
    </figure>
  );
}
