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

// 1. bandeau : outils présents
if (!html.includes("📷")) throw new Error("bouton photo absent du bandeau");
if (!html.includes("➶")) throw new Error("outil flèche absent du bandeau");
if (!html.includes("▭")) throw new Error("outil zone absent du bandeau");
if (!html.includes("Attention")) throw new Error("pictos d'attention absents du bandeau");

// 2. zone d'étape : plus de bouton "Photo(s)…" ni de presets pictos en double
const photoBtnCount = (html.match(/Photo\(s\)…/g) || []).length;
if (photoBtnCount !== 0) throw new Error(`bouton photo encore présent dans la zone d'étape (${photoBtnCount})`);

// 3. les pictos d'attention ne doivent apparaître qu'une fois (bandeau),
//    pas aussi dans le corps d'étape
const attentionCount = (html.match(/>Attention</g) || []).length;
if (attentionCount !== 1) throw new Error(`picto Attention apparaît ${attentionCount} fois (attendu 1 : bandeau uniquement)`);

console.log("U-OUTILS DANS LE BANDEAU OK");
process.exit(0);
