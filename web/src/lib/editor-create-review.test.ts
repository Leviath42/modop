import { JSDOM } from "jsdom";

// C-87 : robustesse des champs date de revue + responsable en CRÉATION.
// - la date « À revoir le » est préremplie (J+30, paramètre) dès la création ;
// - le champ responsable est une RECHERCHE en création (suggestions des
//   comptes actifs) ;
// - « Créer » transmet review_due + owner_email : les valeurs saisies
//   survivent au passage en mode édition (avant : champs vidés).
//
// NB : les globales jsdom (window/document) sont posées AVANT l'import de
// react-dom — sinon react-dom s'initialise en mode « sans DOM » et le
// onChange des champs texte (tracker de valeurs) ne se déclenche jamais
// sur un événement « input » dispatché.

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

const ACCOUNTS = [
  { id: 1, email: "resp@usine.fr", first_name: "Jeanne", last_name: "Martin", role: "reader" },
  { id: 2, email: "other@usine.fr", first_name: "Paul", last_name: "Durand", role: "author" },
];
const SETTINGS = { readers_see_drafts: false, no_review_date_is_overdue: true, default_stroke_width: 5, default_review_days: 30 };
let createdBody: Record<string, unknown> | null = null;

const resp = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as unknown as Response;
(g as { fetch: unknown }).fetch = async (url: unknown, init?: RequestInit) => {
  const u = String(url);
  if (u.includes("/api/auth/me")) return resp({ id: 1, email: "a@b.c", role: "author" });
  if (u.includes("/api/users")) return resp(ACCOUNTS);
  if (u.includes("/api/settings")) return resp(SETTINGS);
  if (u.includes("/api/workflows") && init?.method === "POST") {
    createdBody = JSON.parse(String(init.body));
    return resp({
      id: 7, title: "MO créé", reference: "MO-NEW", description: "", category: "", family: "",
      state: "draft", current_version: 0, updated_at: "",
      review_due: (createdBody as { review_due?: string | null }).review_due ?? null,
      owner_email: (createdBody as { owner_email?: string | null }).owner_email ?? "",
    });
  }
  if (u.includes("/api/workflows/7")) {
    return resp({
      id: 7, title: "MO créé", reference: "MO-NEW", description: "", category: "", family: "",
      state: "draft", current_version: 0, updated_at: "",
      review_due: (createdBody as { review_due?: string | null } | null)?.review_due ?? null,
      owner_email: (createdBody as { owner_email?: string | null } | null)?.owner_email ?? "",
      steps: [],
    });
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

// saisie d'une valeur dans un input React (setter natif + événement input)
function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

const byPlaceholder = (ph: string) => [...doc.querySelectorAll("input")].find((i) => i.placeholder === ph) as HTMLInputElement | undefined;

// 1. la date de revue est PRÉREMPLIE en création (J+30)
const dateInput = doc.querySelector('input[type="date"]') as HTMLInputElement | null;
if (!dateInput) throw new Error("champ « À revoir le » absent en mode création");
const m = /^\d{4}-\d{2}-\d{2}$/.exec(dateInput.value);
if (!m) throw new Error(`date de revue non préremplie en création (valeur : "${dateInput.value}")`);
const prefilledDate = dateInput.value;

// 2. le champ responsable est une recherche : taper filtre les comptes actifs
const ownerInput = doc.querySelector('input[aria-label^="Responsable"]') as HTMLInputElement | null;
if (!ownerInput) throw new Error("champ responsable absent en mode création");
setInput(ownerInput, "jea");
await new Promise((r) => setTimeout(r, 150));
const option = [...doc.querySelectorAll('[role="option"]')].find((b) => b.textContent?.includes("Jeanne Martin")) as HTMLElement | undefined;
if (!option) throw new Error("aucune suggestion de responsable en mode création (C-87)");
option.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
await new Promise((r) => setTimeout(r, 100));
if (ownerInput.value !== "Jeanne Martin") throw new Error(`suggestion non posée : "${ownerInput.value}"`);

// 3. titre + référence puis « Créer »
const titleInput = byPlaceholder("Remplacement courroie");
const refInput = byPlaceholder("MO-001");
if (!titleInput || !refInput) throw new Error("champs titre/référence introuvables");
setInput(titleInput, "MO créé");
setInput(refInput, "MO-NEW");
const createBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Créer") as HTMLButtonElement | undefined;
if (!createBtn) throw new Error("bouton Créer introuvable");
if (createBtn.disabled) throw new Error("bouton Créer désactivé malgré titre + référence");
createBtn.click();
await new Promise((r) => setTimeout(r, 400));

// 4. le POST a transmis la date et le responsable saisis en création
if (!createdBody) throw new Error("POST /api/workflows non émis");
if ((createdBody as { review_due?: string | null }).review_due !== prefilledDate) {
  throw new Error(`review_due non transmis à la création : ${JSON.stringify(createdBody)}`);
}
if ((createdBody as { owner_email?: string }).owner_email !== "resp@usine.fr") {
  throw new Error(`owner_email non transmis à la création : ${JSON.stringify(createdBody)}`);
}

// 5. en mode édition, les deux champs conservent leurs valeurs
const dateAfter = doc.querySelector('input[type="date"]') as HTMLInputElement | null;
if (!dateAfter || dateAfter.value !== prefilledDate) throw new Error(`date de revue vide en édition après création ("${dateAfter?.value ?? "absent"}")`);
const ownerAfter = doc.querySelector('input[aria-label^="Responsable"]') as HTMLInputElement | null;
if (!ownerAfter || ownerAfter.value !== "Jeanne Martin") throw new Error(`responsable vide en édition après création ("${ownerAfter?.value ?? "absent"}")`);

console.log("C-87 CRÉATION→ÉDITION : DATE PRÉREMPLIE + RECHERCHE RESPONSABLE + VALEURS TRANSMISES OK");
process.exit(0);
