import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import StepCanvasView from "../step-canvas-view";
import type { Photo } from "../api";
import type { Shape } from "../annotated-photo";

// C-95 (V12 #2-4) : les annotations posées sur une photo (outil MCP
// annotate_photo) sont rendues dans la vue lecture — flèche/zone en SVG
// sur l'image, texte en pastille — et une forme du canevas plus basse que
// les photos n'est plus tronquée (hauteur du conteneur recalculée).

const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.Image = class { naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null; constructor() { setTimeout(() => this.onload?.(), 0); } } as unknown as typeof Image;

const photos: Photo[] = [
  {
    id: 21, filename: "p1.jpg", alt: "photo",
    annotations: [
      { type: "arrow", x1: 0.1, y1: 0.2, x2: 0.6, y2: 0.5, color: "#d0021b" },
      { type: "rect", x1: 0.1, y1: 0.6, w: 0.3, h: 0.2, color: "#f5a623" },
      { type: "text", x1: 0.5, y1: 0.8, text: "Repère 12", color: "#1f4e9c" },
    ],
  },
];
const shapes: Shape[] = [
  { type: "arrow", x1: 0.1, y1: 0.2, x2: 0.5, y2: 4, color: "#d0021b" }, // plus basse que la photo
];

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(StepCanvasView, { photos, shapes }));
await new Promise((r) => setTimeout(r, 300));
const doc = dom.window.document;

const spans = Array.from(doc.querySelectorAll("span"));
if (!spans.some((s) => s.textContent === "Repère 12")) throw new Error("C-95 : pastille d'annotation photo absente du rendu");
if (doc.querySelectorAll('svg[viewBox="0 0 1 1"] line').length !== 1) throw new Error("C-95 : flèche d'annotation absente du calque photo");
if (doc.querySelectorAll('svg[viewBox="0 0 1 1"] rect').length !== 1) throw new Error("C-95 : zone d'annotation absente du calque photo");

// le calque vit DANS le conteneur de la photo (recouvre l'image)
const photoBox = doc.querySelector("div[style*=position]")?.parentElement;
if (!photoBox || photoBox.querySelector("img") === null) throw new Error("C-95 : conteneur photo introuvable");

// hauteur recalculée avec la forme basse : flèche y2=4 -> 4*240+24 = 984 px
if (!doc.body.innerHTML.includes("984px")) throw new Error("C-95 : forme plus basse que la photo toujours tronquée (hauteur non recalculée)");

console.log("C-95 CALQUE ANNOTATIONS PHOTO + HAUTEUR FORMES BASSES OK");
process.exit(0);
