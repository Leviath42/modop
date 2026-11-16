import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import ReaderPage from "../pages/reader";

// C-93 (Vague 12 #1) : le texte de l'étape s'affiche SOUS les images —
// dans l'ordre du DOM, le conteneur du canevas précède le paragraphe.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/workflow/1/read" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
g.fetch = (async (url: string) => ({
  ok: true, status: 200,
  json: async () => String(url).includes("/versions")
    ? []
    : {
        id: 1, title: "MO Ordre", reference: "R1", description: "", category: "", family: "",
        state: "draft", current_version: 0, updated_at: "",
        steps: [
          {
            id: 11, workflow_id: 1, position: 0, title: "Étape avec photo",
            body: "TEXTE DE L ETAPE", pictos: [], canvas: [],
            photos: [{ id: 21, filename: "p1.jpg", alt: "photo", annotations: [], display_size: "medium", display_align: "center", display_x: 0, display_y: 0.05, display_w: 1 }],
          },
        ],
      },
})) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
g.Image = class { naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null; constructor() { setTimeout(() => this.onload?.(), 0); } };
(dom.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/workflow/1/read"] }, React.createElement(ReaderPage))));
await new Promise((r) => setTimeout(r, 200));
const doc = dom.window.document;

const article = doc.querySelector("article");
if (!article) throw new Error("étape introuvable");
const kids = Array.from(article.children) as HTMLElement[];
const idxCanvas = kids.findIndex((el) => (el.className ?? "").includes("gap-2.5"));
const idxBody = kids.findIndex((el) => (el.className ?? "").includes("whitespace-pre-wrap"));
if (idxCanvas < 0) throw new Error("conteneur du canevas (images) introuvable");
if (idxBody < 0) throw new Error("paragraphe de texte introuvable");
if (idxCanvas > idxBody) throw new Error(`C-93 : les images (${idxCanvas}) doivent précéder le texte (${idxBody})`);
if (!kids[idxBody].textContent?.includes("TEXTE DE L ETAPE")) throw new Error("le texte de l'étape n'est pas rendu");

console.log("C-93 TEXTE SOUS LES IMAGES (ordre DOM : canevas puis texte) OK");
process.exit(0);
