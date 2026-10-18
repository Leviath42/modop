import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import AdminPage from "../pages/admin";

// C-48 : fenêtre d'édition complète du compte — le ✎ ouvre une modale avec
// Prénom/Nom, rôle et activation ; Enregistrer envoie le PUT complet.
// (Bug C-47 corrigé au passage : GET /api/admin/users renvoie désormais
// first_name/last_name — le listing les omettait, d'où « sans nom » persistant.)

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/admin" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
const puts: unknown[] = [];
const USERS: { id: number; email: string; first_name: string; last_name: string; role: string; active: number; auth_provider: string; created_at: string }[] = [
  { id: 10, email: "vieux@usine.fr", first_name: "", last_name: "", role: "author", active: 1, auth_provider: "local", created_at: "" },
];
g.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
  if (init?.method === "PUT") {
    try {
      const body = JSON.parse(init.body ?? "{}") as { first_name?: string; last_name?: string };
      puts.push({ url: String(url), body });
      // appliquer comme le vrai serveur (le bug C-47 : le GET ne renvoyait pas les noms)
      const u = USERS.find((x) => String(url).includes(`/users/${x.id}`));
      if (u) { u.first_name = body.first_name ?? ""; u.last_name = body.last_name ?? ""; }
    } catch { /* ignore */ }
  }
  return {
    ok: true, status: 200,
    json: async () => {
      if (String(url).includes("/auth/me")) return { id: 1, email: "boss@x.fr", role: "admin" };
      return [...USERS];
    },
  };
}) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/admin"] }, React.createElement(AdminPage))));
await new Promise((r) => setTimeout(r, 250));
const doc = dom.window.document;

// compte sans nom
if (!(doc.body.textContent ?? "").includes("(sans nom)")) throw new Error("un compte sans nom doit afficher « (sans nom) »");

// ✎ ouvre la MODALE (pas d'édition inline)
const editBtn = doc.querySelector('button[aria-label^="Modifier le compte"]') as HTMLElement | null;
if (!editBtn) throw new Error("bouton ✎ introuvable (C-48)");
editBtn.click();
await new Promise((r) => setTimeout(r, 60));
const dialog = doc.querySelector('div[role="dialog"]') as HTMLElement | null;
if (!dialog) throw new Error("modale d'édition du compte non ouverte (C-48)");
const first = dialog.querySelector('input[placeholder="Prénom"]') as HTMLInputElement | null;
const last = dialog.querySelector('input[placeholder="Nom"]') as HTMLInputElement | null;
const role = dialog.querySelector("select") as HTMLSelectElement | null;
const active = dialog.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
if (!first || !last || !role || !active) throw new Error("champs de la modale incomplets (C-48)");
if (role.value !== "author") throw new Error(`rôle pré-rempli attendu author, obtenu ${role.value}`);
if (!active.checked) throw new Error("compte actif attendu coché");

// Enregistrer : PUT complet vers le bon compte
const save = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Enregistrer") as HTMLElement;
save.click();
await new Promise((r) => setTimeout(r, 150));
const put = puts.find((p) => String((p as { url: string }).url).includes("/api/admin/users/10")) as { body: Record<string, unknown> } | undefined;
if (!put) throw new Error("PUT d'édition du compte non envoyé (C-48)");
if (typeof put.body.first_name !== "string" || typeof put.body.last_name !== "string") {
  throw new Error(`PUT doit transporter first_name/last_name, obtenu ${JSON.stringify(put.body)}`);
}
if (put.body.role !== "author") throw new Error("PUT doit transporter le rôle (C-48)");
if (put.body.active !== 1) throw new Error("PUT doit transporter l'état actif (C-48)");

// après refresh : la modale est fermée et le nom RENVOYÉ s'affiche (bug C-47 corrigé)
if (doc.querySelector('div[role="dialog"]')) throw new Error("la modale doit se fermer après enregistrement");
console.log("C-48 FENÊTRE D'ÉDITION COMPLÈTE DU COMPTE OK");
process.exit(0);
