import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import ListPage from "../pages/list";
import { AuthProvider } from "../auth-context";
import { BrowserRouter } from "react-router-dom";

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(
    AuthProvider,
    null,
    React.createElement(BrowserRouter, null, React.createElement(ListPage))
  )
);
await new Promise((r) => setTimeout(r, 200));
const html = dom.window.document.getElementById("root")!.innerHTML;

if (!html.includes("Modes op")) throw new Error("titre absent");
if (!html.includes("Rechercher")) throw new Error("recherche absente");
if (!html.includes('type="search"')) throw new Error("champ recherche absent");
if (!html.includes("Publi")) throw new Error("filtre état absent");
if (html.includes("+ Cr")) throw new Error("le bouton Créer ne doit pas apparaître pour un utilisateur non connecté");

console.log("U2 LISTE RENDU OK");
process.exit(0);
