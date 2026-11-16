import { JSDOM } from "jsdom";

// C-97 (V12 #8) : page Paramètres, section « Indications métiers » —
// liste active chargée, modification de libellé, ajout, suppression, et
// PUT /api/settings/indications au clic sur « Enregistrer ».
// NB : globales jsdom posées AVANT l'import de react-dom (onChange fiable).

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/settings" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const puts: { url: string; body: Record<string, unknown> }[] = [];
const ACTIVE = [
  { kind: "attention", label: "Attention", color: "#f5a623" },
  { kind: "risque-coupe", label: "Risque de coupe", color: "#c2410c" },
];

g.fetch = (async (url: unknown, init?: { method?: string; body?: string }) => {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (method === "PUT") {
    try { puts.push({ url: u, body: JSON.parse(init?.body ?? "{}") as Record<string, unknown> }); } catch { /* ignore */ }
  }
  return {
    ok: true, status: 200,
    json: async () => {
      if (u.includes("/auth/me")) return { id: 1, email: "boss@x.fr", role: "admin" };
      if (u.includes("/api/settings/indications")) return [...ACTIVE];
      if (u.includes("/api/settings")) return { readers_see_drafts: false, no_review_date_is_overdue: true, default_stroke_width: 5, default_review_days: 30 };
      return {};
    },
  } as unknown as Response;
}) as unknown as typeof fetch;

const { createRoot } = await import("react-dom/client");
const React = (await import("react")).default;
const { MemoryRouter } = await import("react-router-dom");
const { AuthProvider } = await import("../auth-context");
const { default: SettingsPage } = await import("../pages/settings");

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/settings"] }, React.createElement(SettingsPage))));
await new Promise((r) => setTimeout(r, 300));
const doc = dom.window.document;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Section rendue avec les 2 indications actives
const title = doc.body.textContent ?? "";
if (!title.includes("Indications métiers")) throw new Error("section Indications métiers absente");
let labels = doc.querySelectorAll('input[aria-label^="Libellé de l\'indication "]');
if (labels.length !== 2) throw new Error(`2 indications attendues, obtenu ${labels.length}`);
if ((labels[0] as HTMLInputElement).value !== "Attention") throw new Error("libellé initial incorrect");

// Modification du premier libellé + Enregistrer → PUT
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
setter?.call(labels[0], "Vigilance");
labels[0].dispatchEvent(new dom.window.Event("input", { bubbles: true }));
await wait(60);
const saveBtn = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent === "Enregistrer") as HTMLElement;
if (!saveBtn) throw new Error("bouton Enregistrer absent");
saveBtn.click();
await wait(150);
const put = puts.find((p) => p.url.includes("/api/settings/indications"));
if (!put) throw new Error("PUT /api/settings/indications non envoyé");
const list = put.body as unknown as { kind: string; label: string }[];
if (list.length !== 2 || list[0].label !== "Vigilance") throw new Error(`PUT doit transporter le libellé modifié, obtenu ${JSON.stringify(put.body)}`);

// Ajout d'une indication → 3 rangées
const addBtn = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent === "Ajouter une indication") as HTMLElement;
if (!addBtn) throw new Error("bouton Ajouter absent");
addBtn.click();
await wait(80);
labels = doc.querySelectorAll('input[aria-label^="Libellé de l\'indication "]');
if (labels.length !== 3) throw new Error(`3 indications attendues après ajout, obtenu ${labels.length}`);

// Suppression → retour à 2 rangées
const delBtn = doc.querySelector('button[aria-label="Supprimer l\'indication attention"]') as HTMLElement | null;
if (!delBtn) throw new Error("bouton de suppression absent");
delBtn.click();
await wait(80);
labels = doc.querySelectorAll('input[aria-label^="Libellé de l\'indication "]');
if (labels.length !== 2) throw new Error(`2 indications attendues après suppression, obtenu ${labels.length}`);

console.log("C-97 INDICATIONS MÉTIERS (SETTINGS) OK");
