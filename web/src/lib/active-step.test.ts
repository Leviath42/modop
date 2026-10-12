import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import EditorPage from "../pages/editor";

// C-41 : l'étape active du sélecteur suit automatiquement les interactions —
// cliquer dans le CANEVAS de l'étape 2 (sans toucher au sélecteur) doit
// rendre l'étape 2 active : le sélecteur l'affiche avec le marqueur ▶.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/workflow/1/edit" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
g.fetch = (async (url: string) => ({
  ok: true, status: 200,
  json: async () => {
    if (String(url).includes("/versions")) return [];
    if (String(url).includes("/feedback")) return [];
    return {
      id: 1, title: "MO", reference: "R1", description: "", category: "", family: "",
      state: "draft", current_version: 0, updated_at: "",
      steps: [
        { id: 11, workflow_id: 1, position: 0, title: "Étape un", body: "", pictos: [], photos: [], canvas: [] },
        { id: 12, workflow_id: 1, position: 1, title: "Étape deux", body: "", pictos: [], photos: [], canvas: [] },
      ],
    };
  },
})) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
g.Image = class { naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null; constructor() { setTimeout(() => this.onload?.(), 0); } };
Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
(dom.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/workflow/1/edit"] }, React.createElement(EditorPage))));
await new Promise((r) => setTimeout(r, 200));
const doc = dom.window.document;

// déplier les deux étapes (clic sur les boutons ▸)
const toggles = Array.from(doc.querySelectorAll('button[aria-label^="Ouvrir l\'étape"]')) as HTMLElement[];
if (toggles.length < 2) throw new Error(`boutons d'ouverture attendus (2), trouvés ${toggles.length}`);
toggles[0].click();
await new Promise((r) => setTimeout(r, 50));
toggles[1].click();
await new Promise((r) => setTimeout(r, 100));

// le sélecteur doit montrer l'étape 2 active (le dépliement l'active déjà)
const select = doc.querySelector('select[aria-label^="Étape affichée"]') as HTMLSelectElement | null;
if (!select) throw new Error("sélecteur d'étape introuvable");
if (select.value !== "12") throw new Error(`après dépliement de l'étape 2 : valeur attendue 12, obtenue ${select.value}`);

// revenir à l'étape 1 via le sélecteur, puis CLIQUER DANS LE CANEVAS de l'étape 2
select.value = "11";
select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
await new Promise((r) => setTimeout(r, 80));
if ((select.value as string) !== "11") throw new Error("pré-condition : étape 1 active");

// le canevas de l'étape 2 : le div position:relative du StepCanvas de l'étape 2
const canvases = Array.from(doc.querySelectorAll('div')).filter((d) =>
  (d as HTMLElement).style?.position === "relative" && (d as HTMLElement).style?.width === "100%" && (d as HTMLElement).style?.background?.includes("surface-2"));
if (canvases.length < 2) throw new Error(`2 canevas attendus, trouvés ${canvases.length}`);
const canvas2 = canvases[canvases.length - 1] as HTMLElement; // celui de la dernière étape = étape 2
canvas2.dispatchEvent(new dom.window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 400, clientY: 100 }));
await new Promise((r) => setTimeout(r, 80));

if ((select.value as string) !== "12") {
  throw new Error(`C-41 : le clic dans le canevas de l'étape 2 doit la rendre active (attendu 12, obtenu ${select.value as string})`);
}
console.log("C-41 ÉTAPE ACTIVE SUIVANT L'INTERACTION = OK");
process.exit(0);
