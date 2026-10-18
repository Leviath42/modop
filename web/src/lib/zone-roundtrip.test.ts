import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import StepCanvas from "../step-canvas";

// Flux complet d'une zone rect : dessin (clic-clic), sauvegarde API,
// puis RE-MONTAGE du composant avec les formes rechargées — la zone doit
// s'afficher AU MÊME ENDROIT (pas écrasée vers le haut du canevas).

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

let savedShapes: unknown[] = [];
(g as { fetch: unknown }).fetch = async (url: string, init?: { body?: string; method?: string }) => {
  if (String(url).includes("/canvas") && init?.method === "PUT") {
    savedShapes = JSON.parse(init.body ?? "{}").shapes;
  }
  return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
};

const CANVAS_W = 800;
(dom.window as unknown as { HTMLElement: { prototype: { getBoundingClientRect: () => DOMRect } } })
  .HTMLElement.prototype.getBoundingClientRect = function () {
  return { width: (this as HTMLElement).id === "cv" ? CANVAS_W : 800, height: 600, left: 0, top: 0, right: CANVAS_W, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
};
(g as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
class FakeImage { onload: (() => void) | null = null; naturalWidth = 0; naturalHeight = 0; src = ""; }
(dom.window as unknown as { Image: unknown }).Image = FakeImage;
g.Image = FakeImage;

const photo = { id: 1, filename: "a.png", alt: "", display_size: "full" as const, display_x: 0, display_y: 0.05, display_w: 1 };
const root = createRoot(dom.window.document.getElementById("root")!);

function mount(shapes: unknown[], tool: "rect" | null = null) {
  root.render(
    React.createElement(StepCanvas, {
      stepId: 1,
      photos: [{ photo, x: 0, y: 0.05, w: 1 }],
      canvasShapes: shapes as never[],
      tool,
      color: "#d0021b",
      onToolDone: () => {},
    })
  );
}

mount([], "rect");
await new Promise((r) => setTimeout(r, 120));
const doc = dom.window.document;

function fire(el: Element | EventTarget, type: string, opts: PointerEventInit = {}) {
  (el as Element).dispatchEvent(new dom.window.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: "touch", ...opts }));
}
// canevas : hauteur ~ (0.05 + 1*800*0.75/240)*240 + 12 = 612px ; ratio 0.75 par défaut
// dessiner une zone vers le BAS du canevas : y ≈ 400px (=1.667 en fraction REF_H)
const cv2 = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
fire(cv2, "pointerup", { clientX: 100, clientY: 400 });
await new Promise((r) => setTimeout(r, 30));
const cv3 = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
fire(cv3, "pointerup", { clientX: 300, clientY: 450 });
await new Promise((r) => setTimeout(r, 80));

if (savedShapes.length === 0) throw new Error("aucune forme sauvegardée");
const rect = savedShapes[0] as { type: string; y1: number };
if (rect.type !== "rect") throw new Error(`type inattendu : ${rect.type}`);
// y1 attendu : 400/240 = 1.6667 (fraction de REF_H, PAS écrasé vers [0,1])
if (Math.abs(rect.y1 - 400 / 240) > 0.01) throw new Error(`y1 sauvegardé = ${rect.y1}, attendu ~1.667 (la zone est écrasée vers le haut !)`);

// --- rechargement : remonter le composant avec les formes issues de l'API ---
mount(savedShapes, null);
await new Promise((r) => setTimeout(r, 120));
const allRects = Array.from(dom.window.document.querySelectorAll("svg rect")) as unknown as { getAttribute: (a: string) => string }[];
const rectEl = allRects[0];
const y1px = Number(rectEl.getAttribute("y"));
if (Math.abs(y1px - 400) > 2) throw new Error(`zone re-rendue à y=${y1px}px, attendu 400px (écrasée vers le haut !)`);

console.log("U-ZONE FLUX COMPLET OK : dessin bas de canevas -> sauvegarde y1=" + rect.y1.toFixed(3) + " -> re-rendu y=" + y1px + "px (inchangé)");
process.exit(0);
