import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import EditorPage from "../pages/editor";

// C-42 : le bouton Photos propose GALERIE ou APPAREIL PHOTO (capture natif
// du navigateur, sans couche supplémentaire) ; le bandeau « pas de photo »
// de l'étape porte aussi les deux actions directes.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/workflow/1/edit" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
g.fetch = (async (url: string) => ({
  ok: true, status: 200,
  json: async () => String(url).includes("/versions") || String(url).includes("/feedback")
    ? []
    : {
        id: 1, title: "MO", reference: "R1", description: "", category: "", family: "",
        state: "draft", current_version: 0, updated_at: "",
        steps: [{ id: 11, workflow_id: 1, position: 0, title: "Étape un", body: "", pictos: [], photos: [], canvas: [] }],
      },
})) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
g.Image = class { naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null; constructor() { setTimeout(() => this.onload?.(), 0); } };
(dom.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/workflow/1/edit"] }, React.createElement(EditorPage))));
await new Promise((r) => setTimeout(r, 200));
const doc = dom.window.document;

// déplier l'étape 1
const toggle = doc.querySelector('button[aria-label^="Ouvrir l\'étape"]') as HTMLElement | null;
if (!toggle) throw new Error("bouton d'ouverture d'étape introuvable");
toggle.click();
await new Promise((r) => setTimeout(r, 100));

// C-49 : la barre est permanente — le bouton Photos est visible sans ouvrir quoi que ce soit
const photoBtn = doc.querySelector('button[aria-label="Photos"]') as HTMLElement | null;
if (!photoBtn) throw new Error("bouton Photos introuvable");
photoBtn.click();
await new Promise((r) => setTimeout(r, 80));

const menu = doc.querySelector('div[role="menu"][aria-label="Source de la photo"]');
if (!menu) throw new Error("menu source de la photo absent (C-42)");
const items = Array.from((menu as HTMLElement).querySelectorAll("button"));
if (!items.some((b) => b.textContent?.includes("Depuis la galerie"))) throw new Error("option galerie absente");
if (!items.some((b) => b.textContent?.includes("Prendre une photo"))) throw new Error("option appareil photo absente");

// l'input capture doit exister avec capture=environment
const cameraInput = Array.from(doc.querySelectorAll('input[type="file"]')).find((i) => i.getAttribute("capture") === "environment") as HTMLInputElement | undefined;
if (!cameraInput) throw new Error("input capture=environment absent (C-42)");
const galleryInput = Array.from(doc.querySelectorAll('input[type="file"][multiple]')).find((i) => !i.hasAttribute("capture")) as HTMLInputElement | undefined;
if (!galleryInput) throw new Error("input galerie (multiple, sans capture) absent");

// le bandeau « pas de photo » porte les deux boutons directs
const note = doc.querySelector('div[role="note"]');
if (!note) throw new Error("bandeau pas-de-photo introuvable");
const noteBtns = Array.from((note as HTMLElement).querySelectorAll("button"));
if (!noteBtns.some((b) => b.textContent?.includes("Galerie"))) throw new Error("bouton Galerie absent du bandeau (C-42)");
if (!noteBtns.some((b) => b.textContent?.includes("Prendre une photo"))) throw new Error("bouton Prendre une photo absent du bandeau (C-42)");

// cliquer « Prendre une photo » du bandeau : l'input capture doit être cliqué
// (on intercepte .click() pour prouver le branchement)
let cameraClicked = false;
cameraInput.click = () => { cameraClicked = true; };
const camBtn = noteBtns.find((b) => b.textContent?.includes("Prendre une photo")) as HTMLElement;
camBtn.click();
await new Promise((r) => setTimeout(r, 50));
if (!cameraClicked) throw new Error("le bouton Prendre une photo ne déclenche pas l'input capture (C-42)");

console.log("C-42 PHOTOS : GALERIE OU APPAREIL PHOTO + BANDEAU D'ACTION OK");
process.exit(0);
