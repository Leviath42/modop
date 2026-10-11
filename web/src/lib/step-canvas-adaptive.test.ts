import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import StepCanvas from "../step-canvas";

// Test du canevas d'étape : (1) la hauteur du canevas s'adapte à la position
// et à la taille réelle des images (ratio mesuré, pas l'approximation 0.75) ;
// (2) un clic sur le fond sans déplacement NE vide PAS la sélection courante,
// et le rectangle de sélection ne s'applique qu'au relâchement.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

const calls: string[] = [];
(g as { fetch: unknown }).fetch = async (url: string) => {
  calls.push(String(url));
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
};

const CANVAS_W = 800;
(dom.window as unknown as { HTMLElement: { prototype: { getBoundingClientRect: () => DOMRect } } })
  .HTMLElement.prototype.getBoundingClientRect = function () {
  return { width: (this as HTMLElement).id === "c" ? CANVAS_W : 800, height: 300, left: 0, top: 0, right: CANVAS_W, bottom: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
};

// images "chargées" : ratio réel 0.5 (h = w/2), pas 0.75
(dom.window as unknown as { Image: unknown }).Image = class {
  naturalWidth = 1000;
  naturalHeight = 500;
  onload: (() => void) | null = null;
  constructor() { setTimeout(() => this.onload?.(), 0); }
};
g.Image = (dom.window as unknown as { Image: unknown }).Image;
(g as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

const photo = { id: 1, filename: "a.png", alt: "", display_size: "full" as const, display_x: 0, display_y: 0.5, display_w: 0.5 };

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(StepCanvas, {
    stepId: 1,
    photos: [{ photo, x: 0, y: 0.5, w: 0.5 }],
    canvasShapes: [],
  })
);
await new Promise((r) => setTimeout(r, 150));
const doc = dom.window.document;

// le conteneur canevas : div relatif avec le fond surface-2
const canvases = Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%");
if (canvases.length === 0) throw new Error("canevas introuvable");
const canvas = canvases[canvases.length - 1] as HTMLElement;
canvas.id = "c";

// hauteur attendue : y + h = 0.5 + 0.5*0.5 = 0.75 de la largeur 800 = 600 + marge 12 => >= 600
const h1 = parseInt(canvas.style.height, 10);
// y=0.5 (fraction de REF_H=240) + h = w*W*ratio/REF_H = 0.5*800*0.5/240 px => H = (0.5 + 0.8333)*240 + 12 ≈ 332
if (h1 !== 332) throw new Error(`hauteur non adaptée : ${h1}px (attendu 332)`);

console.log("U-CANVAS HAUTEUR ADAPTATIVE OK");

// --- Sélection : le clic sur l'image sélectionne l'objet, le clic fond NE vide PAS
const canvases2 = Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%");
const c2 = canvases2[canvases2.length - 1] as HTMLElement;
const imgBox = c2.querySelector("img")?.parentElement as HTMLElement;
if (!imgBox) throw new Error("image non rendue");
function fire(el: Element | EventTarget, type: string, opts: PointerEventInit = {}) {
  el.dispatchEvent(new dom.window.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, ...opts }));
}
fire(imgBox, "pointerdown", { clientX: 200, clientY: 200 });
fire(dom.window, "pointerup", { clientX: 200, clientY: 200 });
await new Promise((r) => setTimeout(r, 30));
const canvases3 = Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%");
const imgBox2 = (canvases3[canvases3.length - 1] as HTMLElement).querySelector("img")?.parentElement as HTMLElement;
if (imgBox2.style.outline !== "2px solid var(--accent)") throw new Error(`image non sélectionnée après clic (outline=${imgBox2.style.outline})`);
console.log("U-CANVAS CLIC IMAGE = SÉLECTION UNIQUE OK");

// clic sur le fond SANS déplacement : la sélection doit être conservée
// (le rectangle ne s'applique qu'au relâchement avec déplacement)
const c4 = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
// C-27 : la corbeille est désormais un carré en haut à gauche (x<0.14, y<56) —
// pointer le clic fond hors de cette zone.
fire(c4, "pointerdown", { clientX: 400, clientY: 150 });
fire(dom.window, "pointerup", { clientX: 400, clientY: 150 });
await new Promise((r) => setTimeout(r, 30));
const c5 = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
const imgBox3 = c5.querySelector("img")?.parentElement as HTMLElement;
if (imgBox3.style.outline !== "2px solid var(--accent)") throw new Error("clic fond sans déplacement a vidé la sélection");
console.log("U-CANVAS CLIC FOND NE VIDE PAS LA SÉLECTION OK");
process.exit(0);
