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
let lastPutBody: unknown = null;
(g as { fetch: unknown }).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  calls.push(String(url));
  if (init?.method === "PUT") {
    try { lastPutBody = JSON.parse(init.body ?? "{}"); } catch { lastPutBody = null; }
  }
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
};

const CANVAS_W = 800;
(dom.window as unknown as { HTMLElement: { prototype: { getBoundingClientRect: () => DOMRect } } })
  .HTMLElement.prototype.getBoundingClientRect = function () {
  return { width: (this as HTMLElement).id === "c" ? CANVAS_W : 800, height: 300, left: 0, top: 0, right: CANVAS_W, bottom: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
};
// C-40 : le rendu SVG lit clientWidth (0 en jsdom) — le mocker à 800
Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return CANVAS_W; } });

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
// C-28 : une photo se sélectionne au DOUBLE-CLIC ; un clic simple ne
// sélectionne pas ; un clic fond désélectionne.
function firePd(imgBox2: HTMLElement) {
  fire(imgBox2, "pointerdown", { clientX: 200, clientY: 200 });
  fire(dom.window, "pointerup", { clientX: 200, clientY: 200 });
}
firePd(imgBox);
await new Promise((r) => setTimeout(r, 30));
const canvases3 = Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%");
const imgBox2 = (canvases3[canvases3.length - 1] as HTMLElement).querySelector("img")?.parentElement as HTMLElement;
if (imgBox2.style.outline === "2px solid var(--accent)") throw new Error("un simple clic ne doit PAS sélectionner (double-clic requis, C-28)");
// deuxième clic dans la fenêtre double-clic : sélection
firePd(imgBox2);
await new Promise((r) => setTimeout(r, 30));
const canvases3b = Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%");
const imgBox2b = (canvases3b[canvases3b.length - 1] as HTMLElement).querySelector("img")?.parentElement as HTMLElement;
if (imgBox2b.style.outline !== "2px solid var(--accent)") throw new Error(`image non sélectionnée après double-clic (outline=${imgBox2b.style.outline})`);
console.log("U-CANVAS DOUBLE-CLIC = SÉLECTION OK");

// C-28 : un clic sur le fond DÉSÉLECTIONNE la photo
const c4 = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
// C-27 : la corbeille est un carré en haut à gauche (x<0.14, y<56) — clic fond hors zone.
fire(c4, "pointerdown", { clientX: 700, clientY: 150 });
fire(dom.window, "pointerup", { clientX: 700, clientY: 150 });
await new Promise((r) => setTimeout(r, 30));
const c5 = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
const imgBox3 = c5.querySelector("img")?.parentElement as HTMLElement;
if (imgBox3.style.outline === "2px solid var(--accent)") throw new Error("le clic fond doit désélectionner (C-28)");
console.log("U-CANVAS CLIC FOND = DÉSÉLECTION OK");

// C-29 : un drag COMMENCÉ dans la zone corbeille ne supprime pas —
// il faut que le doigt ait quitté le départ pour rejoindre la corbeille.
{
  const c6 = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
  // double-clic pour sélectionner la photo (C-28)
  const imgB = c6.querySelector("img")?.parentElement as HTMLElement;
  fire(imgB, "pointerdown", { clientX: 200, clientY: 300 });
  fire(dom.window, "pointerup", { clientX: 200, clientY: 300 });
  fire(imgB, "pointerdown", { clientX: 200, clientY: 300 });
  fire(dom.window, "pointerup", { clientX: 200, clientY: 300 });
  await new Promise((r) => setTimeout(r, 30));
  // Démontage du premier montage : ses listeners window pollueraient le
// scénario suivant (deux racines sur le même dom.window).
root.unmount();
// C-29 : une photo posée DANS la zone corbeille (haut gauche) ne doit pas
// se supprimer par simple frôlement — le geste doit être CONDUIT depuis
// l'extérieur vers la corbeille. Montage dédié (photo en haut à gauche).
{
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const r2 = createRoot(host);
  r2.render(
    React.createElement(StepCanvas, {
      stepId: 2,
      photos: [{ photo: { ...photo, id: 2 }, x: 0.03, y: 0.04, w: 0.2 }],
      canvasShapes: [],
    })
  );
  await new Promise((r) => setTimeout(r, 100));
  const cc = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
  const im = cc.querySelector("img")?.parentElement as HTMLElement;
  if (!im) throw new Error("photo haut-gauche non rendue");
  // sélection au double-clic
  fire(im, "pointerdown", { clientX: 40, clientY: 30 });
  fire(dom.window, "pointerup", { clientX: 40, clientY: 30 });
  fire(im, "pointerdown", { clientX: 40, clientY: 30 });
  fire(dom.window, "pointerup", { clientX: 40, clientY: 30 });
  await new Promise((r) => setTimeout(r, 30));
  // frôlement : petit geste RESTANT dans la zone corbeille -> pas de suppression
  fire(im, "pointerdown", { clientX: 40, clientY: 30 });
  fire(dom.window, "pointermove", { clientX: 45, clientY: 33 });
  fire(dom.window, "pointerup", { clientX: 45, clientY: 33 });
  await new Promise((r) => setTimeout(r, 80));
  if (!host.querySelector("img")) throw new Error("photo supprimée par frôlement dans la zone corbeille (C-29)");
  console.log("U-CANVAS CORBEILLE = GESTE CONDUIT UNIQUEMENT OK");
}

// C-30 : clic fond LÉGÈREMENT TREMBLÉ (micro-mouvement sous le seuil du vrai
// rectangle) désélectionne quand même ; un drag loin de la corbeille avec
// petit mouvement ne supprime jamais.
{
  const r3 = createRoot(host2());
  r3.render(React.createElement(StepCanvas, {
    stepId: 3,
    photos: [{ photo: { ...photo, id: 3 }, x: 0.03, y: 0.04, w: 0.2 }],
    canvasShapes: [],
  }));
  await new Promise((r) => setTimeout(r, 100));
  const cd = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
  const im3 = cd.querySelector("img")?.parentElement as HTMLElement;
  // sélection double-clic
  fire(im3, "pointerdown", { clientX: 40, clientY: 30 });
  fire(dom.window, "pointerup", { clientX: 40, clientY: 30 });
  fire(im3, "pointerdown", { clientX: 40, clientY: 30 });
  fire(dom.window, "pointerup", { clientX: 40, clientY: 30 });
  await new Promise((r) => setTimeout(r, 30));
  // drag avec petit mouvement LOIN de la corbeille (bas droite du canvas)
  fire(im3, "pointerdown", { clientX: 40, clientY: 30 });
  fire(dom.window, "pointermove", { clientX: 55, clientY: 60 });
  fire(dom.window, "pointerup", { clientX: 55, clientY: 60 });
  await new Promise((r) => setTimeout(r, 60));
  if (!cd.querySelector("img")) throw new Error("photo supprimée loin de la corbeille (C-30)");
  console.log("U-CANVAS PAS DE SUPPRESSION LOIN CORBEILLE OK");
}
// C-31 : un TAP TACTILE sur le fond du canevas déselectionne la photo
// (avant, seul le pointeur souris vidait la sélection) ; un pointerdown
// HORS du canevas (ailleurs dans l'éditeur) déselectionne aussi.
{
  const r4 = createRoot(host2());
  r4.render(React.createElement(StepCanvas, {
    stepId: 4,
    photos: [{ photo: { ...photo, id: 4 }, x: 0.5, y: 0.5, w: 0.3 }],
    canvasShapes: [],
  }));
  await new Promise((r) => setTimeout(r, 100));
  const ce = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
  const im4 = ce.querySelector("img")?.parentElement as HTMLElement;
  // sélection au double-clic (souris)
  fire(im4, "pointerdown", { clientX: 520, clientY: 220 });
  fire(dom.window, "pointerup", { clientX: 520, clientY: 220 });
  fire(im4, "pointerdown", { clientX: 520, clientY: 220 });
  fire(dom.window, "pointerup", { clientX: 520, clientY: 220 });
  await new Promise((r) => setTimeout(r, 30));
  const ce2 = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
  const im4b = ce2.querySelector("img")?.parentElement as HTMLElement;
  if (im4b.style.outline !== "2px solid var(--accent)") throw new Error("pré-condition : photo non sélectionnée");
  // TAP TACTILE sur le fond (pointerType touch)
  fire(ce2, "pointerdown", { clientX: 100, clientY: 150, pointerType: "touch" });
  fire(dom.window, "pointerup", { clientX: 100, clientY: 150, pointerType: "touch" });
  await new Promise((r) => setTimeout(r, 30));
  const im4c = ((Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!).querySelector("img")?.parentElement as HTMLElement;
  if (im4c.style.outline === "2px solid var(--accent)") throw new Error("le tap tactile sur le fond doit déselectionner (C-31)");
  console.log("U-CANVAS TAP TACTILE FOND = DÉSÉLECTION OK");

  // re-sélection puis clic HORS canevas (sur le body)
  fire(im4c, "pointerdown", { clientX: 520, clientY: 220 });
  fire(dom.window, "pointerup", { clientX: 520, clientY: 220 });
  fire(im4c, "pointerdown", { clientX: 520, clientY: 220 });
  fire(dom.window, "pointerup", { clientX: 520, clientY: 220 });
  await new Promise((r) => setTimeout(r, 30));
  const im4d = ((Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!).querySelector("img")?.parentElement as HTMLElement;
  if (im4d.style.outline !== "2px solid var(--accent)") throw new Error("pré-condition 2 : photo non sélectionnée");
  const outside = doc.createElement("button");
  doc.body.appendChild(outside);
  outside.dispatchEvent(new dom.window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 }));
  await new Promise((r) => setTimeout(r, 30));
  const im4e = ((Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!).querySelector("img")?.parentElement as HTMLElement;
  if (im4e.style.outline === "2px solid var(--accent)") throw new Error("le clic hors canevas doit déselectionner (C-31)");
  console.log("U-CANVAS CLIC HORS CANEVAS = DÉSÉLECTION OK");
  r4.unmount();
}

// C-38 : un tap AVEC MICRO-MOUVEMENT (< 6 px) sur une forme ne la déplace PAS
// — au tactile, le doigt glisse naturellement en tapant ; avant, chaque tap
// déplaçait la flèche dans la direction du geste.
{
  const r5 = createRoot(host2());
  r5.render(React.createElement(StepCanvas, {
    stepId: 5,
    photos: [],
    canvasShapes: [{ type: "arrow", x1: 0.3, y1: 0.3, x2: 0.5, y2: 0.5, color: "#d0021b" }],
  }));
  await new Promise((r) => setTimeout(r, 100));
  const cf = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
  // tap sur le centre de la flèche avec micro-glissement de 3 px (sous le seuil 6 px)
  const rect = { left: 0, top: 0, width: 800 };
  (cf as unknown as { getBoundingClientRect: () => typeof rect }).getBoundingClientRect = () => rect;
  const cx = 0.4 * 800, cy = 0.4 * 240;
  fire(cf, "pointerdown", { clientX: cx, clientY: cy });
  fire(dom.window, "pointermove", { clientX: cx + 3, clientY: cy + 2 });
  fire(dom.window, "pointerup", { clientX: cx + 3, clientY: cy + 2 });
  await new Promise((r) => setTimeout(r, 80));
  // la flèche ne doit PAS avoir bougé : pas de PUT canvas pendant le geste
  const put = calls.find((u) => String(u).includes("/canvas"));
  if (put) throw new Error("un simple tap (sous 6 px) ne doit sauvegarder/déplacer aucune forme (C-38)");
  console.log("U-CANVAS TAP SANS GLISSEMENT = AUCUN DÉPLACEMENT OK");
  r5.unmount();
}

// C-40 : drag de flèche SANS SAUT — la flèche conserve son centre sous le
// pointeur : au premier déplacement, les extrémités bougent d'exactement le
// delta du geste (et non d'un bond de la moitié de la longueur).
{
  const r6 = createRoot(host2());
  r6.render(React.createElement(StepCanvas, {
    stepId: 6,
    photos: [],
    canvasShapes: [{ type: "arrow", x1: 0.3, y1: 0.3, x2: 0.5, y2: 0.5, color: "#d0021b" }],
  }));
  await new Promise((r) => setTimeout(r, 100));
  const cg = (Array.from(doc.querySelectorAll("div")).filter((d) => d.style.position === "relative" && d.style.width === "100%") as HTMLElement[]).pop()!;
  // saisir le CENTRE de la flèche (0.4, 0.4) et glisser de +0.02
  const sx = 0.4 * 800, sy = 0.4 * 240;
  fire(cg, "pointerdown", { clientX: sx, clientY: sy });
  await new Promise((r) => setTimeout(r, 30));   // laisser l'effet attacher les listeners
  fire(dom.window, "pointermove", { clientX: sx + 20, clientY: sy + 12 }); // +0.025 en x, +0.05 en y
  await new Promise((r) => setTimeout(r, 50));
  // lire la flèche déplacée directement dans le SVG rendu (le move met à
  // jour le rendu ; le PUT n'est émis qu'au relâchement)
  await new Promise((r) => setTimeout(r, 50));
  const svg = cg.querySelector("svg");
  const line = svg?.querySelector("line");
  if (!line) throw new Error("flèche non rendue dans le SVG");
  const x1 = Number(line.getAttribute("x1")) / 800;   // coordonnées écran -> fraction
  const y1 = Number(line.getAttribute("y1")) / 240;
  // deltas attendus : le centre suit le pointeur de (+0.025, +0.05) — x1
  // (le départ de la flèche) doit passer de 0.3 à ~0.325, SANS bond
  if (Math.abs(x1 - (0.3 + 0.025)) > 0.005 || Math.abs(y1 - (0.3 + 0.05)) > 0.005) {
    throw new Error(`SAUT détecté : x1 attendu ~0.325 (delta du geste), obtenu ${x1.toFixed(3)} ; y1 attendu ~0.35, obtenu ${y1.toFixed(3)} (C-40)`);
  }
  console.log("U-CANVAS DRAG FLÈCHE SANS SAUT OK");
  r6.unmount();
}

process.exit(0);

function host2() {
  const h = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(h);
  return h;
}
}
