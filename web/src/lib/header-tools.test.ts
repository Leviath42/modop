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
(g as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
class FakeImage { onload: (() => void) | null = null; naturalWidth = 0; naturalHeight = 0; src = ""; }
(g as { Image: unknown }).Image = FakeImage;
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

// C-49 : barre d'outils PERMANENTE — groupes Étape | Insertion | Indications | Actions
// 0. le header contient : nom de l'étape, Publier, réduire/développer
if (!html.includes("Dévisser")) throw new Error("nom de l'étape active absent du header");
if (!/Publier( V\d)?</.test(html)) throw new Error("bouton Publier absent du header");
if (!/(▾|▸)</.test(html)) throw new Error("bouton réduire/développer absent du header");
if (!/position: sticky/.test(html)) throw new Error("header non sticky");

// 1. la barre d'outils est VISIBLE SANS clic (plus de bouton « Outils »)
if (!html.includes('aria-label="Photos"')) throw new Error("bouton Photos absent (barre permanente attendue, C-49)");
if (!/title="Flèche"/.test(html)) throw new Error("outil flèche absent (barre permanente)");
if (!/title="Zone"/.test(html)) throw new Error("outil zone absent (barre permanente)");
if (!/title="Texte"/.test(html)) throw new Error("outil texte absent (barre permanente)");
if (!/title="Indications de l'étape/.test(html)) throw new Error("bouton pictos absent (barre permanente)");
if (!/aria-label="Ajouter une étape"/.test(html)) throw new Error("bouton + Étape absent (barre permanente)");
// le sélecteur de couleur compact est présent (pastille courante + chevron)
if (!/Couleur : /.test(html)) throw new Error("sélecteur de couleur compact absent (C-49)");
// plus de bouton « Outils » qui ouvre/ferme
const btns = Array.from(dom.window.document.querySelectorAll("button"));
if (btns.some((b) => b.getAttribute("aria-label") === "Outils")) throw new Error("le bouton Outils doit disparaître (barre permanente, C-49)");

// 2. les 4 couleurs ne sont PAS étalées (elles sont dans le popover)
const colorSwatches = (html.match(/aria-label="Couleur #/g) || []).length;
if (colorSwatches !== 0) throw new Error(`les pastilles couleur doivent être dans le popover, pas étalées (${colorSwatches})`);

// 3. zone d'étape : plus de bouton "Photo(s)…"
const photoBtnCount = (html.match(/Photo\(s\)…/g) || []).length;
if (photoBtnCount !== 0) throw new Error(`bouton photo encore présent dans la zone d'étape (${photoBtnCount})`);

// 4. ouvrir le popover couleurs : les 4 pastilles y apparaissent
const colorBtn = btns.find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Couleur :")) as HTMLElement;
if (!colorBtn) throw new Error("bouton couleur introuvable");
colorBtn.click();
await new Promise((r) => setTimeout(r, 60));
const html2 = dom.window.document.getElementById("root")!.innerHTML;
const inPopover = (html2.match(/aria-label="Couleur #/g) || []).length;
if (inPopover < 4) throw new Error(`les 4 couleurs doivent être dans le popover ouvert (${inPopover})`);

console.log("C-49 BARRE D'OUTILS PERMANENTE (groupes, popover couleurs) OK");
process.exit(0);