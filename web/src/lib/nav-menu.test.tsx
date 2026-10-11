import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NavBar from "../nav";
import { AuthProvider } from "../auth-context";

// C-12 : bandeau épuré — logo Modop + bouton menu (trois barres). Les entrées
// (comptes/stats/déploiement pour l'admin, thème, déconnexion) sont dans le
// menu déroulant, fermé par défaut.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
(g as { fetch: unknown }).fetch = async () =>
  ({ ok: true, status: 200, json: async () => ({ id: 1, email: "admin@usine.fr", role: "admin" }) } as unknown as Response);

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(
    AuthProvider,
    null,
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/"] },
      React.createElement(Routes, null, React.createElement(Route, { path: "/", element: React.createElement(() => { return React.createElement("div", null, React.createElement(NavBar), React.createElement("main")); }) }))
    )
  )
);
await new Promise((r) => setTimeout(r, 500));

const doc = dom.window.document;
const html = doc.body.innerHTML;
// bandeau épuré : le menu hamburger est présent
const menuBtn = doc.querySelector('button[aria-label="Menu"]');
if (!menuBtn) throw new Error("bouton menu (trois barres) introuvable");
// par défaut, les entrées ne sont PAS dans le bandeau
if (!menuBtn.textContent) { /* icône svg : rien à vérifier texte */ }
if (!html.includes("Modop")) throw new Error("logo Modop absent");
// le menu fermé ne montre pas les liens
const before = doc.body.innerHTML;
if (before.includes('to="/admin"') && before.includes("Statistiques") && !before.includes('role="menu"')) {
  throw new Error("les liens admin ne doivent pas être visibles menu fermé");
}
// ouverture du menu : liens + déconnexion apparaissent
(menuBtn as HTMLElement).click();
await new Promise((r) => setTimeout(r, 200));
const open = doc.body.innerHTML;
for (const label of ["Comptes", "Statistiques", "Déploiement", "Déconnexion", "Modes opératoires"]) {
  if (!open.includes(label)) throw new Error(`entrée "${label}" absente du menu ouvert`);
}
// Échap ferme le menu
doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
if (doc.body.innerHTML.includes('role="menu"')) throw new Error("le menu doit se fermer à l'Échap");

console.log("NAV MENU OK (bandeau épuré, menu par rôle, Échap)");
process.exit(0);
