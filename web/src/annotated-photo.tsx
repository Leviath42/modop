// Utilitaires de formes (annotations du canevas d'étape).
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
