import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EditorPage from "../pages/editor";
import { AuthProvider } from "../auth-context";
import type { Step } from "../api";

// Palette d'outils (spec docs/spec-palette-outils.md, C-67) :
// - le bandeau documentaire (nom d'étape, Publier, replier) reste sticky ;
// - les outils d'insertion vivent dans la BARRE BASSE FIXE (role="toolbar") :
//   Étape, Photos, Formes, Indications — visibles sans clic ;
// - le flyout Formes s'ouvre au clic, liste flèche/zone/texte + couleurs,
//   se referme à Échap ;
// - les actions dangereuses sont contextuelles (1 étape = pas de
//   « Supprimer l'étape »).

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
const doc = dom.window.document;
const html = doc.body.innerHTML;

// 0. bandeau documentaire : nom de l'étape, Publier, réduire/développer, sticky
if (!html.includes("Dévisser")) throw new Error("nom de l'étape active absent du bandeau");
if (!/Publier( V\d)?</.test(html)) throw new Error("bouton Publier absent du bandeau");
if (!/(▾|▸)</.test(html)) throw new Error("bouton réduire/développer absent du bandeau");
// Sticky exprimé en classe Tailwind (refonte UI C-65).
if (!/class="[^"]*\bsticky\b/.test(html)) throw new Error("bandeau non sticky");

// 1. barre basse fixe : outils visibles SANS clic
const toolbar = doc.querySelector('div[role="toolbar"][aria-label="Outils d\'édition"]');
if (!toolbar) throw new Error("barre basse d'outils (role=toolbar) absente");
for (const label of ["Ajouter une étape", "Photos", "Formes", "Indications"]) {
  if (!toolbar.querySelector(`button[aria-label="${label}"]`)) throw new Error(`outil "${label}" absent de la barre basse`);
}

// 2. contextualité : une seule étape -> pas de bouton Supprimer l'étape
if ([...toolbar.querySelectorAll("button")].some((b) => b.textContent?.includes("Supprimer l'étape"))) {
  throw new Error("Supprimer l'étape ne doit pas apparaître avec une seule étape");
}

// 3. flyout Formes : ouverture au clic, items flèche/zone/texte + sélection
const shapesBtn = toolbar.querySelector('button[aria-label="Formes"]') as HTMLElement;
shapesBtn.click();
await new Promise((r) => setTimeout(r, 150));
const flyout = doc.querySelector('div[role="menu"][aria-label="Formes"]');
if (!flyout) throw new Error("flyout Formes non ouvert au clic");
const arrowItem = Array.from(flyout.querySelectorAll("button")).find((b) => b.textContent?.includes("Flèche")) as HTMLElement;
if (!arrowItem) throw new Error("outil flèche absent du flyout");
arrowItem.click();
await new Promise((r) => setTimeout(r, 150));
// la sélection d'un outil coche l'item et marque le bouton parent actif
if (arrowItem.getAttribute("aria-checked") !== "true") throw new Error("flèche non cochée après sélection");
if (!shapesBtn.className.includes("border-primary")) throw new Error("bouton Formes non marqué actif après sélection");

// 4. Échap referme le flyout (règle 4 de la spec)
doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
if (doc.querySelector('div[role="menu"][aria-label="Formes"]')) throw new Error("le flyout Formes doit se fermer à l'Échap");

console.log("BARRE BASSE OUTILS OK (bandeau sticky, outils visibles, flyout formes, Échap, contextualité)");
process.exit(0);
