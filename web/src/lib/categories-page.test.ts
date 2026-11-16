import { JSDOM } from "jsdom";

// C-94 : page Arborescence — l'arbre est rendu en ordre préfixe avec
// indentation (parent → enfant → petit-enfant), et le formulaire de
// création envoie le parent choisi (POST /api/categories).
// NB : globales jsdom posées AVANT l'import de react-dom (onChange fiable).

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/categories" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const CATS = [
  { id: 1, parent_id: null, name: "Maintenance", slug: "maintenance", position: 0 },
  { id: 2, parent_id: 1, name: "Mécanique", slug: "mecanique", position: 0 },
  { id: 3, parent_id: 2, name: "Courroies", slug: "courroies", position: 0 },
];
const posts: { url: string; body: Record<string, unknown> }[] = [];

(g as { fetch: unknown }).fetch = async (url: unknown, init?: { method?: string; body?: string }) => {
  const u = String(url);
  if (init?.method === "POST") {
    try { posts.push({ url: u, body: JSON.parse(init.body ?? "{}") as Record<string, unknown> }); } catch { /* ignore */ }
  }
  return {
    ok: true, status: 200,
    json: async () => {
      if (u.includes("/auth/me")) return { id: 1, email: "boss@x.fr", role: "admin" };
      if (u.includes("/api/categories")) return [...CATS];
      if (u.includes("/api/workflows")) return [];
      return {};
    },
  } as unknown as Response;
};

const { createRoot } = await import("react-dom/client");
const React = (await import("react")).default;
const { MemoryRouter } = await import("react-router-dom");
const { AuthProvider } = await import("../auth-context");
const { default: CategoriesPage } = await import("../pages/categories");

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, { initialEntries: ["/categories"] }, React.createElement(CategoriesPage))));
await new Promise((r) => setTimeout(r, 300));
const doc = dom.window.document;
const text = doc.body.textContent ?? "";

// Titre + formulaire de création présents
if (!text.includes("Arborescence documentaire")) throw new Error("titre de page absent");
const nameInput = doc.querySelector('input[aria-label="Titre de la catégorie"]') as HTMLInputElement | null;
if (!nameInput) throw new Error("champ titre du formulaire absent");
const parentSelect = doc.querySelector('select[aria-label="Catégorie parente"]') as HTMLSelectElement | null;
if (!parentSelect) throw new Error("select parent absent du formulaire");
if (parentSelect.options.length !== 4) throw new Error(`4 options attendues (racine + 3 catégories), obtenu ${parentSelect.options.length}`);

// Ordre préfixe : racine, puis enfant, puis petit-enfant + marqueur d'indentation
for (const name of ["Maintenance", "Mécanique", "Courroies"]) {
  if (!text.includes(name)) throw new Error(`catégorie « ${name} » absente du rendu`);
}
const [i1, i2, i3] = ["Maintenance", "Mécanique", "Courroies"].map((n) => text.indexOf(n));
if (!(i1 < i2 && i2 < i3)) throw new Error("l'arbre doit être rendu en ordre préfixe (parent avant enfants)");
if (!text.includes("↳")) throw new Error("marqueur d'indentation ↳ absent");

// Boutons d'action admin par nœud
if (!doc.querySelector('button[aria-label="Renommer Mécanique"]')) throw new Error("bouton renommer absent");
if (!doc.querySelector('button[aria-label="Déplacer Courroies"]')) throw new Error("bouton déplacer absent");

// Création d'une catégorie enfant : POST avec le parent choisi
const inputSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
inputSetter.call(nameInput, "Hydraulique");
nameInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
const selectSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!;
selectSetter.call(parentSelect, "2");
parentSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
const createBtn = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent === "Créer") as HTMLElement | undefined;
if (!createBtn) throw new Error("bouton Créer absent");
createBtn.click();
await new Promise((r) => setTimeout(r, 200));
const post = posts.find((p) => p.url.includes("/api/categories"));
if (!post) throw new Error("POST /api/categories non envoyé");
if (post.body.name !== "Hydraulique") throw new Error(`nom attendu Hydraulique, obtenu ${String(post.body.name)}`);
if (post.body.parent_id !== 2) throw new Error(`parent_id attendu 2, obtenu ${String(post.body.parent_id)}`);

console.log("C-94 PAGE ARBORESCENCE OK (arbre préfixe indenté + création enfant)");
