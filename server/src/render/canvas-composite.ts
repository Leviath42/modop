import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";

// Composition du canevas d'étape en une seule image — pour l'export DOCX.
// Reproduit EXACTEMENT le rendu du lecteur (step-canvas-view.tsx) :
//  - repère vertical fixe de 240 px (les y sont stockés en fraction de 240) ;
//  - photos positionnées librement (display_x/y/w) ;
//  - formes par-dessus (x1/y1 en fractions de largeur/240px), flèches avec
//    pointe, rectangles, textes.

const REF_H = 240;

export interface CompositePhoto {
  filename: string;
  display_x?: number | null;
  display_y?: number | null;
  display_w?: number | null;
  display_size?: string;
}

export interface CompositeShape {
  type: "arrow" | "rect" | "text";
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
  w?: number;
  h?: number;
  text?: string;
  color?: string;
}

function photoW(p: CompositePhoto): number {
  if (typeof p.display_w === "number") return p.display_w;
  if (p.display_size === "full") return 1;
  if (p.display_size === "large") return 0.85;
  if (p.display_size === "small") return 0.35;
  return 0.6;
}

export async function composeStepCanvas(
  photosDir: string,
  photos: CompositePhoto[],
  shapes: CompositeShape[],
  width = 800
): Promise<Buffer | null> {
  if (photos.length === 0 && shapes.length === 0) return null;

  // charger les images et mesurer
  const loaded: { img: Awaited<ReturnType<typeof loadImage>>; x: number; y: number; w: number; h: number }[] = [];
  for (const p of photos) {
    const file = path.join(photosDir, p.filename);
    if (!fs.existsSync(file)) continue;
    try {
      const img = await loadImage(file);
      const w = photoW(p) * width;
      const ratio = img.height / img.width;
      const x = (typeof p.display_x === "number" ? p.display_x : 0) * width;
      const y = (typeof p.display_y === "number" ? p.display_y : 0.05) * REF_H;
      loaded.push({ img, x, y, w, h: w * ratio });
    } catch { /* image illisible : ignorée */ }
  }

  // hauteur = bas de l'image la plus basse / forme la plus basse (comme le lecteur)
  let maxH = 240;
  for (const o of loaded) maxH = Math.max(maxH, Math.round(o.y + o.h + 12));
  for (const s of shapes) {
    const bottom = s.type === "arrow" && s.y2 !== undefined ? Math.max(s.y1, s.y2) : s.y1 + (s.h ?? 0.2);
    maxH = Math.max(maxH, Math.round(bottom * REF_H + 24));
  }

  const canvas = createCanvas(width, maxH);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f0f1f4";
  ctx.fillRect(0, 0, width, maxH);

  // photos (dans l'ordre, comme le DOM)
  for (const o of loaded) {
    ctx.drawImage(o.img, o.x, o.y, o.w, o.h);
  }

  // formes — même logique que step-canvas-view
  const font = "sans-serif";
  for (const s of shapes) {
    const color = s.color ?? "#d0021b";
    const x1 = s.x1 * width;
    const y1 = s.y1 * REF_H;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    if (s.type === "arrow") {
      const x2 = (s.x2 ?? s.x1 + 0.2) * width;
      const y2 = (s.y2 ?? s.y1 + 0.2) * REF_H;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ax = x2 - (dx / len) * 14, ay = y2 - (dy / len) * 14;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(ax - (dy / len) * 6, ay + (dx / len) * 6);
      ctx.lineTo(ax + (dy / len) * 6, ay - (dx / len) * 6);
      ctx.closePath();
      ctx.fill();
    } else if (s.type === "rect") {
      ctx.strokeRect(x1, y1, (s.w ?? 0.3) * width, (s.h ?? 0.2) * REF_H);
    } else if (s.type === "text") {
      ctx.font = `600 16px ${font}`;
      ctx.fillText(s.text ?? "", x1, y1);
    }
  }

  return canvas.toBuffer("image/png");
}
