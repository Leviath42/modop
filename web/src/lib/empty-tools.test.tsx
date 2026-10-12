import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EditorPage from "../pages/editor";
import { AuthProvider } from "../auth-context";

// C-24 : MO sans aucune étape — la palette Outils doit s'ouvrir et proposer
// le bouton « + étape ».

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

const WORKFLOW = {
  id: 8, title: "MO vide", reference: "MO-VIDE", description: "", category: "", family: "",
  state: "draft", current_version: 0, review_due: null, owner_email: "", updated_at: "2026-10-11",
  steps: [],   // AUCUNE étape
};

(g as { fetch: unknown }).fetch = async (url: string) => {
  if (String(url).includes("/api/auth/me")) {
    return { ok: true, status: 200, json: async () => ({ id: 1, email: "a@b.c", role: "author" }) } as unknown as Response;
  }
  if (String(url).includes("/api/workflows/8")) {
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
      { initialEntries: ["/workflow/8/edit"] },
      React.createElement(Routes, null, React.createElement(Route, { path: "/workflow/:id/edit", element: React.createElement(EditorPage) }))
    )
  )
);
await new Promise((r) => setTimeout(r, 400));

const doc = dom.window.document;
const html = doc.body.innerHTML;
// C-49 : barre PERMANENTE — le bouton + étape est visible sans aucun clic
const addBtn = [...doc.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Ajouter une étape");
if (!addBtn) throw new Error("bouton + étape absent de la barre permanente (C-49)");
if ([...doc.querySelectorAll("button")].some((b) => b.textContent === "Outils")) {
  throw new Error("le bouton Outils n'existe plus (barre permanente, C-49)");
}
console.log("BARRE SANS ÉTAPE OK (+ étape visible sans clic)");
process.exit(0);
