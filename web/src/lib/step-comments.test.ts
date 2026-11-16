import { JSDOM } from "jsdom";

// C-96 (V12 #7) : composant StepComments — liste au chargement, ajout par
// POST /api/steps/:id/comments, suppression réservée à l'auteur du
// commentaire (ou admin). Jamais publié : voir test serveur.
// NB : globales jsdom posées AVANT l'import de react-dom (onChange fiable).

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/workflow/1" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
let COMMENTS = [
  { id: 1, by: "a@x.fr", message: "Photo à refaire avant publication", at: "16/11 09:00" },
  { id: 2, by: "b@x.fr", message: "Consigne de sécurité vérifiée", at: "16/11 09:30" },
];

g.fetch = (async (url: unknown, init?: { method?: string; body?: string }) => {
  const u = String(url);
  const method = init?.method ?? "GET";
  let body: Record<string, unknown> | undefined;
  if (init?.body) { try { body = JSON.parse(init.body) as Record<string, unknown>; } catch { /* ignore */ } }
  calls.push({ method, url: u, body });
  if (u.includes("/auth/me")) return { ok: true, status: 200, json: async () => ({ id: 1, email: "a@x.fr", role: "author" }) } as unknown as Response;
  if (u.includes("/api/steps/7/comments")) {
    if (method === "POST") {
      const c = { id: 3, by: "a@x.fr", message: String(body?.message ?? ""), at: "16/11 10:00" };
      COMMENTS = [...COMMENTS, c];
      return { ok: true, status: 200, json: async () => c } as unknown as Response;
    }
    if (method === "DELETE") {
      const id = Number(u.split("/").pop());
      COMMENTS = COMMENTS.filter((c) => c.id !== id);
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => [...COMMENTS] } as unknown as Response;
  }
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
}) as unknown as typeof fetch;

const { createRoot } = await import("react-dom/client");
const React = (await import("react")).default;
const { AuthProvider } = await import("../auth-context");
const { default: StepComments } = await import("../step-comments");

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(React.createElement(AuthProvider, null, React.createElement(StepComments, { stepId: 7 })));
await new Promise((r) => setTimeout(r, 250));
const doc = dom.window.document;
const text = () => doc.body.textContent ?? "";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Section repliée : compteur visible, contenu masqué
const toggle = doc.querySelector('button[aria-expanded="false"]') as HTMLElement | null;
if (!toggle) throw new Error("toggle de la section commentaires absent");
if (!toggle.textContent?.includes("(2)")) throw new Error(`compteur (2) attendu, obtenu « ${toggle.textContent} »`);
if (text().includes("Photo à refaire")) throw new Error("la section repliée ne doit pas montrer les messages");

// Ouverture : les 2 messages sont rendus
toggle.click();
await wait(80);
if (!text().includes("Photo à refaire avant publication")) throw new Error("commentaire 1 absent après ouverture");
if (!text().includes("Consigne de sécurité vérifiée")) throw new Error("commentaire 2 absent après ouverture");

// Suppression : bouton UNIQUEMENT pour son propre commentaire (a@x.fr)
const delBtns = doc.querySelectorAll('button[aria-label^="Supprimer le commentaire de"]');
if (delBtns.length !== 1) throw new Error(`1 seul bouton de suppression attendu (propriétaire), obtenu ${delBtns.length}`);
const ta = doc.querySelector('textarea[aria-label="Nouveau commentaire de rédaction"]') as HTMLTextAreaElement | null;
if (!ta) throw new Error("textarea de saisie absente");
if (ta.getAttribute("maxlength") !== "1000") throw new Error("borne 1000 caractères absente");

// Saisie + ajout : POST puis rendu immédiat
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")?.set;
setter?.call(ta, "Vérifier la cote du pivot");
ta.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
await wait(50);
const addBtn = Array.from(doc.querySelectorAll("button")).find((b) => b.textContent === "Ajouter") as HTMLElement;
if (!addBtn) throw new Error("bouton Ajouter absent");
addBtn.click();
await wait(150);
const post = calls.find((c) => c.method === "POST" && c.url.includes("/api/steps/7/comments"));
if (!post) throw new Error("POST /api/steps/7/comments non envoyé");
if (post.body?.message !== "Vérifier la cote du pivot") throw new Error(`message transporté incorrect : ${JSON.stringify(post.body)}`);
if (!text().includes("Vérifier la cote du pivot")) throw new Error("commentaire ajouté non affiché");
if (!text().includes("(3)")) throw new Error("compteur doit passer à (3)");

// Suppression de son propre commentaire : DELETE + retrait du DOM
(delBtns[0] as HTMLElement).click();
await wait(150);
const del = calls.find((c) => c.method === "DELETE" && c.url.includes("/api/steps/7/comments/1"));
if (!del) throw new Error("DELETE /api/steps/7/comments/1 non envoyé");
if (text().includes("Photo à refaire avant publication")) throw new Error("commentaire supprimé encore affiché");
if (!text().includes("Vérifier la cote du pivot")) throw new Error("les autres commentaires doivent rester affichés");

console.log("C-96 COMMENTAIRES D'AUTEURS PAR ÉTAPE OK");
