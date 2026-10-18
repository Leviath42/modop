import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import FeedbacksPage from "../pages/feedbacks";

// C-35 : les remontées terrain d'un MO vivent sur une page DÉDIÉE —
// « À traiter » d'abord (avec bouton Résoudre), puis l'historique
// « Traitées ». Le lecteur n'affiche plus la section.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/workflow/1/feedbacks" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.fetch = (async (url: string) => ({
  ok: true, status: 200,
  json: async () => {
    if (String(url).includes("/feedback")) {
      return [
        { id: 5, by: "op1@usine.fr", step_id: 12, message: "Photo floue", status: "open", resolved_by: null, resolved_at: null, at: "2026-10-11 09:00" },
        { id: 3, by: "op2@usine.fr", step_id: 11, message: "Vis manquante dans la liste d'outillage", status: "resolved", resolved_by: "auteur@usine.fr", resolved_at: "2026-10-10", at: "2026-10-09 14:00" },
      ];
    }
    return {
      id: 1, title: "MO Test", reference: "R1", description: "", category: "", family: "",
      state: "draft", current_version: 0, updated_at: "",
      steps: [
        { id: 11, workflow_id: 1, position: 0, title: "Étape une", body: "", pictos: [], photos: [] },
        { id: 12, workflow_id: 1, position: 1, title: "Étape deux", body: "", pictos: [], photos: [] },
      ],
    };
  },
})) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
g.Image = class { naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null; constructor() { setTimeout(() => this.onload?.(), 0); } };

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/workflow/1/feedbacks"] }, React.createElement(FeedbacksPage))));
await new Promise((r) => setTimeout(r, 150));
const doc = dom.window.document;
const text = doc.body.textContent ?? "";

// page dédiée : deux sections avec compteurs
if (!text.includes("Remontées terrain")) throw new Error("titre de page absent");
if (!text.includes("À traiter")) throw new Error("section À traiter absente");
if (!text.includes("Traitées")) throw new Error("section Traitées (historique) absente");
if (!text.includes("Photo floue")) throw new Error("signalement ouvert non affiché");
if (!text.includes("Vis manquante")) throw new Error("signalement résolu (historique) non affiché");
if (!text.includes("résolu par auteur@usine.fr")) throw new Error("mention du résolveur absente");
const btn = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent?.includes("Résoudre"));
if (!btn) throw new Error("bouton Résoudre absent sur un signalement ouvert");
const link = Array.from(doc.querySelectorAll("a")).find((a) => a.getAttribute("href") === "/workflow/1/edit");
if (!link) throw new Error("lien Corriger l'étape absent");

console.log("C-35 PAGE TERRAIN DÉDIÉE (à traiter + historique, Résoudre) OK");
process.exit(0);
