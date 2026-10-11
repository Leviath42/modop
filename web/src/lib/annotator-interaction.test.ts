import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import PhotoAnnotator from "../photo-annotator";

// Test d'interaction réel : clic-glisser-relâcher sur la photo doit (1) appeler
// l'API de sauvegarde et (2) laisser la forme affichée APRÈS le relâcher.
const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

let savedCalls: { url: string; body: unknown }[] = [];
(g as { fetch: unknown }).fetch = async (url: string, init?: { body?: string }) => {
  if (String(url).includes("/annotations")) {
    savedCalls.push({ url: String(url), body: JSON.parse(init?.body ?? "{}") });
    return { ok: true, status: 200, json: async () => ({ ok: true, count: 1 }) } as unknown as Response;
  }
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
};

// jsdom retourne des rect nuls : on fournit une géométrie réaliste
const W = 400, H = 300;
(dom.window as unknown as { HTMLElement: { prototype: { getBoundingClientRect: () => DOMRect } } }).HTMLElement.prototype.getBoundingClientRect = function () {
  return { width: W, height: H, left: 10, top: 10, right: W + 10, bottom: H + 10, x: 10, y: 10, toJSON: () => ({}) } as DOMRect;
};

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(PhotoAnnotator, { photoId: 42, filename: "t.png", alt: "a", initialAnnotations: [] })
);
await new Promise((r) => setTimeout(r, 120));

const doc = dom.window.document;

// React re-rend le DOM à chaque interaction : on requête le nœud au moment T
function getBox(): HTMLElement {
  return dom.window.document.querySelector('div[style*="position: relative"]') as HTMLElement;
}
function mouse(type: string, x: number, y: number) {
  if (type === "mousedown") {
    getBox().dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
  } else {
    dom.window.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
  }
}

// 1. activer l'outil Flèche
const btns = [...doc.querySelectorAll("button")];
const arrowBtn = btns.find((b) => b.textContent === "Flèche")!;
arrowBtn.click();
await new Promise((r) => setTimeout(r, 60));

// 2. glisser : (50,60) -> (250,200)
mouse("mousedown", 50, 60);
await new Promise((r) => setTimeout(r, 100));
mouse("mousemove", 250, 200);
await new Promise((r) => setTimeout(r, 50));
mouse("mouseup", 250, 200);
await new Promise((r) => setTimeout(r, 200));

// 3. la forme doit être SAUVEGARDÉE
if (savedCalls.length === 0) throw new Error("aucun appel de sauvegarde API");
if (!String(savedCalls[0].url).includes("/api/photos/42/annotations")) throw new Error("mauvaise URL: " + savedCalls[0].url);
const body = savedCalls[0].body as { annotations: { type: string; x1: number; y1: number; x2: number; y2: number }[] };
if (body.annotations[0].type !== "arrow") throw new Error("type attendu: arrow");
console.log("✓ flèche sauvegardée:", JSON.stringify(body.annotations[0]));

// 4. ET toujours affichée après le relâcher (SVG contient un <line>)
const svg = getBox().querySelector("svg");
if (!svg) throw new Error("calque SVG absent");
const line = svg.querySelector("line");
if (!line) throw new Error("la flèche n'est PAS affichée après le relâcher — bug de persistance d'affichage");
console.log("✓ flèche affichée après relâcher (persistante)");

// 5. outil Zone : rect persistant
const rectBtn = btns.find((b) => b.textContent === "Zone")!;
rectBtn.click();
await new Promise((r) => setTimeout(r, 60));
mouse("mousedown", 60, 60);
mouse("mousemove", 200, 180);
mouse("mouseup", 200, 180);
await new Promise((r) => setTimeout(r, 150));
if (!svg.querySelector("rect")) throw new Error("zone non affichée");
console.log("✓ zone affichée et persistante");

// 6. outil Texte : clic ouvre la saisie, Entrée persiste
const textBtn = btns.find((b) => b.textContent === "Texte")!;
textBtn.click();
await new Promise((r) => setTimeout(r, 60));
mouse("mousedown", 200, 150);
mouse("mouseup", 200, 150);
await new Promise((r) => setTimeout(r, 100));
const input = dom.window.document.querySelector("input[placeholder*='Texte']") as HTMLInputElement;
if (!input) throw new Error("la saisie de texte ne s'ouvre pas au clic");
// jsdom : passer par le setter natif pour que React voie la valeur
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
setter.call(input, "Repère 12");
input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
await new Promise((r) => setTimeout(r, 60));
input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
if (!dom.window.document.body.textContent?.includes("Repère 12")) throw new Error("le texte posé n'apparaît pas");
console.log("✓ texte posé et affiché");

console.log("INTERACTION COMPLÈTE OK — le code beta persiste les formes");
process.exit(0);
