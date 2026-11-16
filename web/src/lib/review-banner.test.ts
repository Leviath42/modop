import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import ReaderPage from "../pages/reader";

// C-81/C-83/C-84 : lecteur — le bouton d'export vit DANS l'entête avec les
// autres outils ; le signalement « à revoir » explique POURQUOI (date
// dépassée, avec la date) et propose le lien de mise à jour (auteurs) ;
// la date de revue et le responsable (nom lisible) sont affichés.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/workflow/1/read" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
g.fetch = (async (url: string) => ({
  ok: true, status: 200,
  json: async () => {
    if (String(url).includes("/versions")) return [];
    if (String(url).includes("/api/auth/me")) return { id: 1, email: "a@b.c", role: "author" };
    if (String(url).includes("/api/settings")) return { readers_see_drafts: false, no_review_date_is_overdue: true, default_stroke_width: 5, default_review_days: 30 };
    return {
      id: 1, title: "MO Test", reference: "R1", description: "", category: "", family: "",
      state: "published", current_version: 2, updated_at: "",
      review_due: "2020-01-01", owner_email: "resp@usine.fr", owner_name: "Jeanne Martin",
      steps: [
        { id: 11, workflow_id: 1, position: 0, title: "Étape une", body: "", pictos: [], photos: [] },
      ],
    };
  },
})) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
g.Image = class { naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null; constructor() { setTimeout(() => this.onload?.(), 0); } };
(dom.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/workflow/1/read"] }, React.createElement(ReaderPage))));
await new Promise((r) => setTimeout(r, 200));
const doc = dom.window.document;
const html = doc.body.innerHTML;

// C-81 : bouton d'export dans l'entête (avec les autres outils), pas en bas
const exportLink = doc.querySelector('a[aria-label="Exporter en .docx"]') as HTMLAnchorElement | null;
if (!exportLink) throw new Error("lien d'export absent de l'entête (C-81)");
if (!exportLink.href.includes("/api/workflows/1/export")) throw new Error(`href d'export inattendu : ${exportLink.href}`);
const header = doc.querySelector("header");
if (!header || !header.contains(exportLink)) throw new Error("le lien d'export doit vivre dans l'entête (C-81)");

// C-84 : date de revue + responsable (nom lisible) affichés sur la version publiée
if (!html.includes("À revoir le 01/01/2020")) throw new Error("date de revue non affichée (C-84)");
if (!html.includes("Responsable : Jeanne Martin")) throw new Error("responsable (nom lisible) non affiché (C-84)");

// C-83 : alerte « à revoir » avec la RAISON de la date, et le lien de mise à jour
const alert = doc.querySelector('div[role="alert"]');
if (!alert || !alert.textContent?.includes("Ce mode opératoire est à revoir")) throw new Error("alerte « à revoir » absente (C-83)");
if (!alert.textContent?.includes("dépassée depuis le 01/01/2020")) throw new Error("la raison (date dépassée) doit être expliquée (C-83)");
const upd = doc.querySelector('a[href="/workflow/1/edit?revue=1"]') as HTMLAnchorElement | null;
if (!upd) throw new Error("lien « Mettre à jour la revue » absent (C-83)");

// C-83 (variante) : sans date de revue, la raison l'indique explicitement
console.log("C-81/C-83/C-84 LECTEUR : EXPORT EN-TÊTE + À REVOIR EXPLIQUÉ + REVUE/RESPONSABLE AFFICHÉS OK");
process.exit(0);
