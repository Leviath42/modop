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
// 1. le bouton Outils existe et la rangée est affichée
const toolsBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Outils");
if (!toolsBtn) throw new Error("bouton Outils introuvable sur un MO sans étape");
// 2. clic : la palette s'ouvre
(toolsBtn as HTMLElement).click();
await new Promise((r) => setTimeout(r, 200));
const open = doc.body.innerHTML;
if (!open.includes("Créez d'abord une étape")) throw new Error("palette sans message d'accueil");
// 3. le bouton + étape est là
const addBtn = [...doc.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Ajouter une étape");
if (!addBtn) throw new Error("bouton + étape absent de la palette");
console.log("OUTILS SANS ÉTAPE OK (palette ouvre, + étape présent)");
process.exit(0);
