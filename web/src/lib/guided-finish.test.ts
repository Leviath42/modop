import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import GuidedReaderPage from "../pages/guided-reader";

// B-A1 : le bouton « Terminé ✓ » de la lecture guidée doit QUITTER la page
// (naviguer vers la lecture classique) — avant, setSearchParams({}) ne
// faisait rien sur la route /workflow/:id/guided.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/workflow/1/guided" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.fetch = (async () => ({
  ok: true, status: 200,
  json: async () => ({
    id: 1, title: "MO", reference: "R1", description: "", category: "", family: "",
    state: "draft", current_version: 0, updated_at: "",
    steps: [
      { id: 11, workflow_id: 1, position: 0, title: "Étape 1", body: "", pictos: [], photos: [] },
      { id: 12, workflow_id: 1, position: 1, title: "Étape 2", body: "", pictos: [], photos: [] },
    ],
  }),
})) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
g.Image = class { naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null; constructor() { setTimeout(() => this.onload?.(), 0); } };

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/workflow/1/guided"] }, React.createElement(GuidedReaderPage))));
await new Promise((r) => setTimeout(r, 100));
const doc = dom.window.document;

// avancer jusqu'à la dernière étape
const next = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent?.includes("Suivant")) as HTMLElement;
if (!next) throw new Error("bouton Suivant introuvable");
next.click();
await new Promise((r) => setTimeout(r, 30));

const finish = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent?.includes("Terminé")) as HTMLElement;
if (!finish) throw new Error("bouton Terminé introuvable (dernière étape attendue)");
finish.click();
await new Promise((r) => setTimeout(r, 100));

// le composant doit avoir navigué : plus de boutons de navigation guidée dans le rendu
const stillGuided = Array.from(doc.querySelectorAll("button")).some((b) => b.textContent?.includes("Suivant"));
if (stillGuided) throw new Error("le bouton Terminé doit naviguer hors de la lecture guidée (B-A1)");
console.log("B-A1 TERMINÉ GUIDE = NAVIGATION OK");
process.exit(0);
