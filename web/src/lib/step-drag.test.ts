import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EditorPage from "../pages/editor";
import { AuthProvider } from "../auth-context";

// C-03 : le réordonnancement des étapes passe en Pointer Events (le drag HTML5
// ne fonctionne pas au tactile — cause du signalement « drag n drop ne
// fonctionne pas »). Preuve : pointerdown sur la poignée ⠿ de l'étape 1,
// pointerup au-dessus de la carte de l'étape 2 → PUT /steps/reorder envoyé
// avec les ids réordonnés.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/",
});

const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

const WORKFLOW = {
  id: 7, title: "Remontage pompe", reference: "MO-007", description: "", category: "Maintenance",
  family: "Mécanique", state: "draft", current_version: 0, updated_at: "2026-10-11",
  steps: [
    { id: 101, workflow_id: 7, position: 0, title: "Étape A", body: "", pictos: [], photos: [] },
    { id: 202, workflow_id: 7, position: 1, title: "Étape B", body: "", pictos: [], photos: [] },
  ],
};

let reorderBody: unknown = null;
let fetchCalls: string[] = [];
(g as { fetch: unknown }).fetch = async (url: string, init?: RequestInit) => {
  if (String(url).includes("/steps/reorder")) {
    reorderBody = JSON.parse(String(init?.body));
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  }
  if (String(url).includes("/api/auth/me")) {
    fetchCalls.push("me");
    return { ok: true, status: 200, json: async () => ({ id: 1, email: "a@b.c", role: "author" }) } as unknown as Response;
  }
  if (String(url).includes("/api/workflows/7")) {
    return { ok: true, status: 200, json: async () => WORKFLOW } as unknown as Response;
  }
  fetchCalls.push(String(url));
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
};

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(
    AuthProvider,
    null,
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/workflow/7/edit"] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, { path: "/workflow/:id/edit", element: React.createElement(EditorPage) })
      )
    )
  )
);
await new Promise((r) => setTimeout(r, 300));

const doc = dom.window.document;
const handle = doc.querySelector('[aria-label="Réordonner l\'étape 1 (glisser)"]');
if (!handle) throw new Error("poignée de drag introuvable");
if ((handle as HTMLElement).hasAttribute("draggable")) throw new Error("la poignée ne doit plus utiliser le drag HTML5");

// Localiser les deux cartes d'étape comme cibles de drop
const cards = doc.querySelectorAll("li");
if (cards.length < 2) throw new Error("cartes d'étapes introuvables");

// Simuler le drag Pointer Events : down sur la poignée, up sur la carte 2
const rect2 = { left: 10, top: 200, width: 300, height: 80 } as DOMRect;
const elementFromPoint = dom.window.document.elementFromPoint;
(dom.window.document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint =
  (_x: number, _y: number) => dom.window.document.getElementById("edit-step-202") as unknown as Element;
void rect2;

// jsdom n'implémente pas la capture de pointeur : no-op sur le prototype.
g.window = dom.window;
(dom.window.HTMLElement.prototype as unknown as { setPointerCapture?: unknown; releasePointerCapture?: unknown }).setPointerCapture = () => {};
(dom.window.HTMLElement.prototype as unknown as { releasePointerCapture?: unknown }).releasePointerCapture = () => {};

function mk(type: string, x: number, y: number): Event {
  const ev = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "pointerId", { value: 1 });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  Object.defineProperty(ev, "button", { value: 0 });
  Object.defineProperty(ev, "clientX", { value: x });
  Object.defineProperty(ev, "clientY", { value: y });
  return ev;
}

handle.dispatchEvent(mk("pointerdown", 5, 50));
await new Promise((r) => setTimeout(r, 100));
dom.window.dispatchEvent(mk("pointermove", 10, 200));
dom.window.dispatchEvent(mk("pointerup", 10, 200));

await new Promise((r) => setTimeout(r, 300));

if (reorderBody === null) {
  console.error("fetch calls vues par le mock:", fetchCalls);
  throw new Error("PUT /steps/reorder n'a pas été envoyé");
}
const ordered = (reorderBody as { orderedIds: number[] }).orderedIds;
if (JSON.stringify(ordered) !== JSON.stringify([202, 101])) {
  throw new Error(`ordre attendu [202,101], reçu ${JSON.stringify(ordered)}`);
}

console.log("DRAG POINTER EVENTS OK (étape 1 → position 2, PUT reorder envoyé)");
process.exit(0);
