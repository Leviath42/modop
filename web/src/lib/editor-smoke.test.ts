import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EditorPage from "../pages/editor";
import { AuthProvider } from "../auth-context";

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/workflow/new/edit",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

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

if (!html.includes("Nouveau mode op")) throw new Error("titre création absent");
if (!html.includes("MO-")) throw new Error("placeholder référence absent");
if (html.includes("Ajouter une")) throw new Error("les étapes ne doivent pas apparaître avant création");

console.log("U3 EDITEUR RENDU OK");
process.exit(0);
