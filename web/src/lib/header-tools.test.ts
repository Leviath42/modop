import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EditorPage from "../pages/editor";
import { AuthProvider } from "../auth-context";
import type { Step, WorkflowDetail } from "../api";

// Le bandeau d'édition doit contenir la rangée d'outils d'insertion :
// 📷 photos, ➶ flèche, ▭ zone, T texte, et les pictos d'attention —
// et la zone d'étape ne doit plus contenir le bouton photo ni les presets.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/workflow/42/edit",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

const step: Step = {
  id: 7, workflow_id: 42, position: 1, title: "Dévisser", body: "", pictos: [], photos: [], canvas: [],
};
(g as { fetch: unknown }).fetch = async (url: string) => {
  if (String(url).includes("/api/workflows/42")) {
    return { ok: true, status: 200, json: async () => ({ id: 42, reference: "MO-001", title: "Test", description: "", state: "draft", current_version: 0, family: "", category: "", steps: [step] }) } as unknown as Response;
  }
  return { ok: true, status: 200, json: async () => ({ user: { email: "a@b.c", role: "author" } }) } as unknown as Response;
};

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(
    AuthProvider,
    null,
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/workflow/42/edit"] },
      React.createElement(Routes, null, React.createElement(Route, { path: "/workflow/:id/edit", element: React.createElement(EditorPage) }))
    )
  )
);
await new Promise((r) => setTimeout(r, 250));
const html = dom.window.document.getElementById("root")!.innerHTML;

// 0. le header contient : nom de l'étape, Publier, réduire/développer, Insertion(+)
if (!html.includes("Dévisser")) throw new Error("nom de l'étape active absent du header");
if (!/Publier( V\d)?</.test(html)) throw new Error("bouton Publier absent du header");
if (!/(▾|▸)</.test(html)) throw new Error("bouton réduire/développer absent du header");
const plusBtns = (html.match(/aria-expanded="(true|false)"/g) || []).length;
if (plusBtns < 1) throw new Error("bouton d'insertion (palette) absent du header");

// le header doit être sticky (il défile avec la page)
if (!/position: sticky/.test(html)) throw new Error("header non sticky");

// 1. la palette est fermée par défaut : pas d'outils visibles
if (html.includes("📷")) throw new Error("palette d'outils ouverte par défaut (attendu fermée)");

// 2. ouverture de la palette par le bouton + : outils présents
const btns = Array.from(dom.window.document.querySelectorAll("button"));
const plusBtn = btns.find((b) => b.textContent === "+" && b.getAttribute("aria-expanded") !== null) as HTMLElement;
if (!plusBtn) throw new Error("bouton palette introuvable");
plusBtn.click();
await new Promise((r) => setTimeout(r, 60));
const html2 = dom.window.document.getElementById("root")!.innerHTML;
if (!html2.includes("📷")) throw new Error("bouton photo absent de la palette");
if (!html2.includes("➶")) throw new Error("outil flèche absent de la palette");
if (!html2.includes("▭")) throw new Error("outil zone absent de la palette");
if (!html2.includes("Attention")) throw new Error("pictos d'attention absents de la palette");

// 3. zone d'étape : plus de bouton "Photo(s)…"
const photoBtnCount = (html2.match(/Photo\(s\)…/g) || []).length;
if (photoBtnCount !== 0) throw new Error(`bouton photo encore présent dans la zone d'étape (${photoBtnCount})`);

console.log("U-OUTILS DANS LE BANDEAU OK");
process.exit(0);
