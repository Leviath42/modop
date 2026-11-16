import { JSDOM } from "jsdom";

// C-88 : deux documents ne peuvent pas partager le même numéro ; Familles =
// liste de recherche.
// - en création, taper un numéro déjà pris affiche l'erreur en direct et
//   désactive « Créer » (vérification debounced via ?reference=, casse
//   ignorée) ; un numéro libre réactive le bouton ;
// - le champ Famille propose les familles existantes filtrées par mot-clé
//   (casse ignorée), le clic pose la valeur (saisie libre toujours possible).
//
// NB : globales jsdom posées AVANT l'import de react-dom (sinon le onChange
// des champs texte ne se déclenche pas — voir editor-create-review.test.ts).

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/workflow/new/edit" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
class FakeImage { onload: (() => void) | null = null; naturalWidth = 0; naturalHeight = 0; src = ""; }
g.Image = FakeImage;

const { createRoot } = await import("react-dom/client");
const React = (await import("react")).default;
const { MemoryRouter, Route, Routes } = await import("react-router-dom");
const { AuthProvider } = await import("../auth-context");
const { default: EditorPage } = await import("../pages/editor");

const resp = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as unknown as Response;
(g as { fetch: unknown }).fetch = async (url: unknown) => {
  const u = String(url);
  if (u.includes("/api/auth/me")) return resp({ id: 1, email: "a@b.c", role: "author" });
  if (u.includes("/api/users")) return resp([]);
  if (u.includes("/api/settings")) return resp({ readers_see_drafts: false, no_review_date_is_overdue: true, default_stroke_width: 5, default_review_days: 30 });
  // vérification d'unicité : MO-001 (toute casse) est pris, le reste est libre
  if (u.includes("reference=MO-001")) return resp([{ id: 99, title: "Ancien", reference: "MO-001", state: "published" }]);
  if (u.includes("reference=")) return resp([]);
  // liste complète (familles existantes)
  if (u.includes("/api/workflows")) {
    return resp([
      { id: 1, title: "A", reference: "MO-001", family: "Mécanique", state: "published" },
      { id: 2, title: "B", reference: "MO-002", family: "Électrique", state: "draft" },
    ]);
  }
  return resp({});
};

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
await new Promise((r) => setTimeout(r, 300));
const doc = dom.window.document;

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}
const createBtn = () => [...doc.querySelectorAll("button")].find((b) => b.textContent === "Créer") as HTMLButtonElement;

// 1. référence DÉJÀ UTILISÉE : erreur en direct + Créer désactivé
const refInput = [...doc.querySelectorAll("input")].find((i) => i.placeholder === "MO-001") as HTMLInputElement;
if (!refInput) throw new Error("champ référence introuvable en création");
const titleInput = [...doc.querySelectorAll("input")].find((i) => i.placeholder === "Remplacement courroie") as HTMLInputElement;
setInput(titleInput, "Nouveau MO");
setInput(refInput, "MO-001");
await new Promise((r) => setTimeout(r, 700)); // debounce 400 ms
const alert = doc.querySelector('p[role="alert"]');
if (!alert || !alert.textContent?.includes("déjà utilisée")) throw new Error("l'erreur « référence déjà utilisée » doit s'afficher en direct (C-88)");
if (!createBtn().disabled) throw new Error("Créer doit être désactivé quand la référence est prise (C-88)");

// 2. référence LIBRE : l'erreur disparaît, Créer réactivé
setInput(refInput, "MO-777");
await new Promise((r) => setTimeout(r, 700));
if (doc.querySelector('p[role="alert"]')) throw new Error("l'erreur doit disparaître pour un numéro libre (C-88)");
if (createBtn().disabled) throw new Error("Créer doit être réactivé pour un numéro libre (C-88)");

// 3. Famille : recherche par mot-clé (casse ignorée) + clic pour poser
const familyInput = doc.querySelector('input[aria-label^="Famille"]') as HTMLInputElement | null;
if (!familyInput) throw new Error("champ famille introuvable");
setInput(familyInput, "méca");
await new Promise((r) => setTimeout(r, 150));
const famOption = [...doc.querySelectorAll('[role="option"]')].find((b) => b.textContent?.trim() === "Mécanique") as HTMLElement | undefined;
if (!famOption) throw new Error("la famille « Mécanique » doit être suggérée pour le mot-clé « méca » (C-88)");
famOption.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
await new Promise((r) => setTimeout(r, 100));
if (familyInput.value !== "Mécanique") throw new Error(`valeur non posée : "${familyInput.value}"`);

console.log("C-88 CRÉATION : RÉFÉRENCE UNIQUE VÉRIFIÉE EN DIRECT + FAMILLE EN LISTE DE RECHERCHE OK");
process.exit(0);
