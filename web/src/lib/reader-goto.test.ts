import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import ReaderPage from "../pages/reader";

// C-34 : le sélecteur « Aller à » du lecteur suit la même logique que
// l'éditeur — sélecteur CONTRÔLÉ : l'étape active est marquée « ▶ » dans la
// liste, le choix déclenche le scroll, et re-sélectionner la même étape
// fonctionne (value toujours synchronisée, plus de value="" jetable).

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
        id: 1, title: "MO Test", reference: "R1", description: "", category: "", family: "",
        state: "draft", current_version: 0, updated_at: "",
        steps: [
          { id: 11, workflow_id: 1, position: 0, title: "Étape une", body: "", pictos: [], photos: [] },
          { id: 12, workflow_id: 1, position: 1, title: "Étape deux", body: "", pictos: [], photos: [] },
        ],
      },
})) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
g.Image = class { naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null; constructor() { setTimeout(() => this.onload?.(), 0); } };
// jsdom n'implémente pas scrollIntoView — stub non-op
(dom.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/workflow/1/read"] }, React.createElement(ReaderPage))));
await new Promise((r) => setTimeout(r, 150));
const doc = dom.window.document;

const select = doc.querySelector('select[title^="Étape active"]') as HTMLSelectElement | null;
if (!select) throw new Error("sélecteur Aller à introuvable (C-34)");
if (select.value !== "0") throw new Error(`valeur initiale attendue 0, obtenue ${select.value}`);
const opt0 = select.options[0] as HTMLOptionElement;
if (!opt0.textContent?.startsWith("▶ ")) throw new Error("l'étape active doit être marquée ▶ (C-34)");
if (select.options.length !== 2) throw new Error(`2 étapes attendues, ${select.options.length} options`);

// choisir l'étape 2 : valeur synchronisée + ▶ déplacé
select.value = "1";
select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
if (select.value !== "1") throw new Error(`après choix : valeur attendue 1, obtenue ${select.value}`);
const opt1 = select.options[1] as HTMLOptionElement;
if (!opt1.textContent?.startsWith("▶ ")) throw new Error("le marqueur ▶ doit suivre l'étape choisie (C-34)");
if ((select.options[0] as HTMLOptionElement).textContent?.startsWith("▶ ")) throw new Error("l'ancienne étape ne doit plus porter ▶ (C-34)");

console.log("C-34 LECTEUR ALLER-À = SÉLECTEUR CONTRÔLÉ (▶ + scroll) OK");
process.exit(0);
