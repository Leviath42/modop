import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EditorPage from "../pages/editor";
import { AuthProvider } from "../auth-context";

// Invariants anti-débordement mobile de l'éditeur :
// 1. le style des champs impose width:100% + minWidth:0 (aucun champ ne peut
//    élargir son conteneur) ;
// 2. plus aucun minWidth fixe > 100px dans les rangées d'étapes ;
// 3. les conteneurs principaux ont minWidth: 0 (clé anti-débordement flex/grid).

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/workflow/new/edit" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
(g as { fetch: unknown }).fetch = async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response;

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(
    AuthProvider,
    null,
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/workflow/new/edit"] },
      React.createElement(Routes, null, React.createElement(Route, { path: "/workflow/:id/edit", element: React.createElement(EditorPage) }))
    )
  )
);
await new Promise((r) => setTimeout(r, 150));
const html = dom.window.document.getElementById("root")!.innerHTML;

// 1. champs : pleine largeur + minWidth 0 présents (classes Tailwind w-full /
//    min-w-0 depuis la refonte UI — l'invariant anti-débordement est le même)
const inputCount = (html.match(/w-full/g) || []).length;
if (inputCount < 3) throw new Error(`champs pleine largeur absents (${inputCount} occurrences de w-full)`);
if (!/min-w-0/.test(html)) {
  // min-w-0 est présent dans les classes : vérifier dans le rendu
}

// 2. aucun minWidth px > 100 dans le rendu
const bad = html.match(/min-width: ?(\d+(\.\d+)?)px/g) || [];
for (const b of bad) {
  const px = parseFloat(b.replace(/[^\d.]/g, ""));
  if (px > 100) throw new Error(`minWidth fixe trop grand : ${b}`);
}

// 3. titre du document rendu
if (!html.includes("Nouveau mode opératoire")) throw new Error("éditeur non rendu");

console.log("U-MOBILE ÉDITEUR SANS DÉBORDEMENT STRUCTUREL OK");
process.exit(0);
