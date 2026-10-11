import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import PhotoAnnotator from "../photo-annotator";

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(PhotoAnnotator, {
    photoId: 1,
    filename: "test.png",
    alt: "photo de test",
    initialAnnotations: [],
  })
);
await new Promise((r) => setTimeout(r, 150));
const html = dom.window.document.getElementById("root")!.innerHTML;

if (!html.includes('draggable="false"')) throw new Error("l'image doit être draggable=false (sinon le drag natif déplace la photo)");
if (!html.includes("Flèche")) throw new Error("outil Flèche absent");
if (!html.includes("Zone")) throw new Error("outil Zone absent");
if (!html.includes("Texte")) throw new Error("outil Texte absent");
if (!html.includes("/photos/test.png")) throw new Error("photo non rendue");

console.log("ANNOTATOR RENDU OK (draggable=false, outils présents)");
process.exit(0);
