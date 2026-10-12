import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth-context";
import AdminPage from "../pages/admin";

// C-47 : les comptes existants (sans nom) peuvent être édités inline —
// bouton ✎ -> champs Prénom/Nom -> ✓ envoie PUT avec first_name/last_name.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/admin" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
const puts: unknown[] = [];
g.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
  if (init?.method === "PUT") { try { puts.push({ url: String(url), body: JSON.parse(init.body ?? "{}") }); } catch { /* ignore */ } }
  return {
    ok: true, status: 200,
    json: async () => {
      if (String(url).includes("/auth/me")) return { id: 1, email: "boss@x.fr", role: "admin" };
      return [
        { id: 10, email: "vieux@usine.fr", first_name: "", last_name: "", role: "author", active: 1, auth_provider: "local", created_at: "" },
      ];
    },
  };
}) as unknown as typeof fetch;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/admin"] }, React.createElement(AdminPage))));
await new Promise((r) => setTimeout(r, 250));
const doc = dom.window.document;

// le compte sans nom affiche « (sans nom) »
if (!(doc.body.textContent ?? "").includes("(sans nom)")) throw new Error("un compte sans nom doit afficher « (sans nom) »");

// bouton ✎ d'édition
const editBtn = doc.querySelector('button[aria-label^="Modifier le nom de"]') as HTMLElement | null;
if (!editBtn) throw new Error("bouton ✎ d'édition du nom introuvable (C-47)");
editBtn.click();
await new Promise((r) => setTimeout(r, 60));

const first = doc.querySelector('input[aria-label^="Prénom de"]') as HTMLInputElement | null;
const last = doc.querySelector('input[aria-label^="Nom de"]') as HTMLInputElement | null;
if (!first || !last) throw new Error("champs Prénom/Nom non ouverts en édition (C-47)");
void first; void last;

// renseigner et valider
const setVal = (el: HTMLInputElement, v: string) => {
  // Approche React 19 : écrase le value via le setter PROTOTYPE (React garde
  // son propre setter sur l'instance), puis dispatch input + change.
  const desc = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value");
  if (desc?.set) desc.set.call(el, v); else el.value = v;
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
};
// saisir champ par champ, en RE-SÉLECTIONNANT l'input à chaque étape :
// le re-render après chaque frappe peut remplacer les nœuds (React recrée
// les éléments dans le span édité).
const q1 = () => doc.querySelector('input[aria-label^="Prénom de"]') as HTMLInputElement;
const q2 = () => doc.querySelector('input[aria-label^="Nom de"]') as HTMLInputElement;
setVal(q1(), "Jean");
await new Promise((r) => setTimeout(r, 60));
setVal(q2(), "Moulin");
await new Promise((r) => setTimeout(r, 100));
if (q1().value !== "Jean") throw new Error(`saisie Prénom non conservée après re-render: ${q1().value}`);
// re-sélectionner le bouton ✓ du rendu COURANT (le re-render après saisie
// a remplacé les nœuds — le bouton du rendu précédent portait l'ancienne closure)
const okBtn = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent === "✓") as HTMLElement;
if (!okBtn) throw new Error("bouton ✓ introuvable après saisie");
okBtn.click();
await new Promise((r) => setTimeout(r, 120));

const put = puts.find((p) => String((p as { url: string }).url).includes("/api/admin/users/10")) as { body: { first_name?: string; last_name?: string } } | undefined;
if (!put) throw new Error("PUT de mise à jour du nom non envoyé (C-47)");
if (typeof put.body.first_name !== "string" || typeof put.body.last_name !== "string") {
  throw new Error(`PUT doit transporter first_name/last_name, obtenu ${JSON.stringify(put.body)}`);
}
console.log("C-47 ÉDITION INLINE DU NOM DES COMPTES OK");
process.exit(0);
