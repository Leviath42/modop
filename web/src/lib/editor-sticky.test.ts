import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EditorPage from "../pages/editor";
import { AuthProvider } from "../auth-context";

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

// Mock API : workflow existant avec 2 étapes -> l'éditeur affiche la section Étapes
const WORKFLOW = {
  id: 7, title: "Remontage pompe", reference: "MO-007", description: "", category: "Maintenance",
  family: "Mécanique", state: "draft", current_version: 0, updated_at: "2026-10-11",
  steps: [
    { id: 1, workflow_id: 7, position: 0, title: "Étape A", body: "", pictos: [], photos: [] },
    { id: 2, workflow_id: 7, position: 1, title: "Étape B", body: "", pictos: [], photos: [] },
  ],
};
(g as { fetch: unknown }).fetch = async (url: string) => {
  if (String(url).includes("/api/auth/me")) {
    return { ok: true, status: 200, json: async () => ({ id: 1, email: "a@b.c", role: "author" }) } as unknown as Response;
  }
  if (String(url).includes("/api/workflows/7")) {
    return { ok: true, status: 200, json: async () => WORKFLOW } as unknown as Response;
  }
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
const html = dom.window.document.getElementById("root")!.innerHTML;

// Sticky exprimé en classe Tailwind depuis la refonte UI (au lieu d'un style inline).
if (!/class="[^"]*\bsticky\b/.test(html)) throw new Error("bandeau non sticky");
// Chevrons Lucide depuis la refonte icônes (C-68) : les boutons de pli
// sont identifiés par leur aria-label.
if (!/Replier l'étape|Ouvrir l'étape/.test(html)) throw new Error("bouton réduire/développer absent");
if (!/Tout (ouvrir|replier)/.test(html)) throw new Error("title réduire/développer absent");
// C-21 : le nom d'étape EST la liste déroulante (rôle Aller à intégré).
if (!/aria-label="Étape affichée/.test(html)) throw new Error("sélecteur d'étape absent");
if (html.includes(" Aller à")) { /* plus de bouton séparé */ }
if (!html.includes("Remontage pompe")) throw new Error("titre du document absent du bandeau");
console.log("BANDEAU ÉDITEUR STICKY OK (titre, tout ouvrir/replier, aller à)");
process.exit(0);
