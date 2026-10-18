import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import EditorPage from "../pages/editor";

// C-46 : suppression d'un MO — la case de confirmation est DÉCOCHÉE par
// défaut à l'étape finale, et la section de suppression n'est visible que
// des ADMINS.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/workflow/1/edit" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
// /api/auth/me renvoie un ADMIN ; le reste renvoie le MO
let asAdmin = false;
g.fetch = (async (url: string) => ({
  ok: true, status: 200,
  json: async () => {
    if (String(url).includes("/auth/me")) {
      return asAdmin ? { id: 9, email: "boss@x.fr", role: "admin" } : { id: 8, email: "writer@x.fr", role: "author" };
    }
    if (String(url).includes("/versions") || String(url).includes("/feedback")) return [];
    return { id: 1, title: "MO", reference: "R1", description: "", category: "", family: "", state: "draft", current_version: 0, updated_at: "", steps: [{ id: 11, workflow_id: 1, position: 0, title: "S", body: "", pictos: [], photos: [], canvas: [] }] };
  },
})) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
g.Image = class { naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null; constructor() { setTimeout(() => this.onload?.(), 0); } };
(dom.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

async function mount() {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const r = createRoot(host);
  r.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/workflow/1/edit"] }, React.createElement(EditorPage))));
  await new Promise((res) => setTimeout(res, 250));
  return r;
}

// ===== 1/2 : non-admin -> section cachée =====
const r1 = await mount();
if (dom.window.document.querySelector('section[aria-label="Suppression du mode opératoire"]')) {
  throw new Error("C-46 : la section suppression ne doit pas être visible d'un non-admin");
}
r1.unmount();
dom.window.document.querySelectorAll("body > div:not(#root)").forEach((d) => d.remove());
console.log("C-46 (1/2) : section invisible d'un non-admin OK");

// ===== 2/2 : ADMIN -> section visible, case DÉCOCHÉE, bouton désactivé =====
asAdmin = true;
await mount();
const doc = dom.window.document;
const section = doc.querySelector('section[aria-label="Suppression du mode opératoire"]');
if (!section) throw new Error("C-46 : la section suppression doit être visible d'un admin");
const btnStart = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent?.includes("Supprimer le mode opératoire")) as HTMLElement;
if (!btnStart) throw new Error("bouton Supprimer… introuvable");
btnStart.click();
await new Promise((r) => setTimeout(r, 60));
(Array.from(doc.querySelectorAll("button")).find((b) => b.textContent?.includes("Continuer")) as HTMLElement).click();
await new Promise((r) => setTimeout(r, 60));
const box = doc.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
if (!box) throw new Error("case de confirmation introuvable");
if (box.checked) throw new Error("C-46 : la case de confirmation doit être DÉCOCHÉE par défaut");
const btnDel = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent?.includes("Supprimer définitivement")) as HTMLButtonElement;
if (!btnDel) throw new Error("bouton Supprimer définitivement introuvable");
if (!btnDel.disabled) throw new Error("C-46 : le bouton doit être désactivé tant que la case n'est pas cochée");
console.log("C-46 (2/2) : ADMIN — case DÉCOCHÉE par défaut, bouton désactivé OK");
process.exit(0);
