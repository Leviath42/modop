import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import ListPage from "../pages/list";

// C-43 : la liste regroupe les MO par ÉTAT (Publié avant Brouillon) puis par
// FAMILLE — « Publié : » / famille / cartes, « Brouillon : » / famille / cartes.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
const WFS = [
  { id: 1, title: "MO Brouillon Méca", reference: "B1", description: "", category: "", family: "Mécanique", state: "draft", current_version: 0, updated_at: "" },
  { id: 2, title: "MO Publié Élec", reference: "P1", description: "", category: "", family: "Électrique", state: "published", current_version: 2, updated_at: "" },
  { id: 3, title: "MO Publié Méca", reference: "P2", description: "", category: "", family: "Mécanique", state: "published", current_version: 1, updated_at: "" },
  { id: 4, title: "MO Publié sans famille", reference: "P3", description: "", category: "", family: "", state: "published", current_version: 1, updated_at: "" },
];
g.fetch = (async () => ({ ok: true, status: 200, json: async () => WFS })) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/"] }, React.createElement(ListPage))));
await new Promise((r) => setTimeout(r, 200));
const doc = dom.window.document;
const text = doc.body.textContent ?? "";

// les deux en-têtes d'état, Publié AVANT Brouillon
const pubIdx = text.indexOf("Publié");
const draftIdx = text.indexOf("Brouillon");
if (pubIdx < 0 || draftIdx < 0) throw new Error("en-têtes Publié/Brouillon absents");
if (pubIdx > draftIdx) throw new Error("Publié doit apparaître AVANT Brouillon (C-43)");

// familles triées alphabétiquement dans chaque état, « Sans famille » pour les vides
if (!text.includes("Sans famille")) throw new Error("les MO sans famille doivent être regroupés sous « Sans famille »");
// l'ordre des sections : Publié/Électrique, Publié/Mécanique, Publié/Sans famille, Brouillon/Mécanique
const h3s = Array.from(doc.querySelectorAll('section[aria-label] button[aria-expanded]')).filter((b) => !(b.getAttribute("aria-label") ?? "").startsWith("Publié") && !(b.getAttribute("aria-label") ?? "").startsWith("Brouillon")).map((b) => (b.textContent ?? "").replace(/^[▸\s]+/, "").replace(/\s*\(\d+\)$/, ""));
const expected = ["Électrique", "Mécanique", "Sans famille", "Mécanique"];
if (JSON.stringify(h3s) !== JSON.stringify(expected)) {
  throw new Error(`familles attendues ${JSON.stringify(expected)}, obtenues ${JSON.stringify(h3s)}`);
}
// chaque section contient bien ses cartes
const sections = Array.from(doc.querySelectorAll('section[aria-label]')).map((sec) => ({
  label: sec.getAttribute("aria-label"),
  cards: sec.querySelectorAll("li").length,
}));
if (!sections.some((x) => x.label === "Publié — Électrique" && x.cards === 1)) throw new Error("section Publié/Électrique mal peuplée");
if (!sections.some((x) => x.label?.includes("Mécanique") && x.cards === 1)) throw new Error("sections Mécanique mal peuplées");

// C-44 : replier/déplier les groupes (état et familles) + persistance
const stateBtns = Array.from(doc.querySelectorAll('button[aria-label^="Publié —"], button[aria-label^="Brouillon —"]')) as HTMLElement[];
if (stateBtns.length < 2) throw new Error("en-têtes d'état non cliquables (C-44)");
const pubBtn = stateBtns.find((b) => b.getAttribute("aria-label")?.startsWith("Publié")) as HTMLElement;
pubBtn.click();
await new Promise((r) => setTimeout(r, 60));
// les cartes de l'état publié ont disparu (les familles aussi)
const afterCollapse = doc.body.textContent ?? "";
if (afterCollapse.includes("MO Publié Élec")) throw new Error("replier Publié doit masquer ses MO (C-44)");
if (!afterCollapse.includes("MO Brouillon Méca")) throw new Error("le brouillon doit rester visible (C-44)");
// persistance localStorage
const saved = JSON.parse(dom.window.localStorage.getItem("modop-collapsed-groups") ?? "[]") as string[];
if (!saved.includes("state:published")) throw new Error(`le repli doit être persisté, obtenu ${JSON.stringify(saved)}`);
// déplier remonte les cartes
pubBtn.click();
await new Promise((r) => setTimeout(r, 60));
if (!(doc.body.textContent ?? "").includes("MO Publié Élec")) throw new Error("déplier Publié doit remonter ses MO (C-44)");

// replier une famille seule
const famBtn = Array.from(doc.querySelectorAll('button[aria-label^="Mécanique —"]')).find((b) => (b.closest("section") as HTMLElement)?.getAttribute("aria-label") === "Publié — Mécanique") as HTMLElement | undefined;
if (!famBtn) throw new Error("en-tête de famille non cliquable (C-44)");
famBtn.click();
await new Promise((r) => setTimeout(r, 60));
const t2 = doc.body.textContent ?? "";
if (t2.includes("MO Publié Méca")) throw new Error("replier Mécanique doit masquer ses MO (C-44)");
if (!t2.includes("MO Publié Élec")) throw new Error("les autres familles restent visibles (C-44)");
// le compteur de la famille reste visible
if (!t2.includes("Mécanique")) throw new Error("l'en-tête de famille repliée doit rester affiché avec son compteur (C-44)");

console.log("C-44 GROUPES REPLIABLES + PERSISTANCE OK");
process.exit(0);
