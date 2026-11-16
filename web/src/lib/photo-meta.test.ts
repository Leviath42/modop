import { JSDOM } from "jsdom";
import type { Photo } from "../api";

// C-98 (V13 #5) : composant PhotoMeta — alt + description de la photo
// sélectionnée, sauvegarde automatique à la sortie du champ.
// NB : globales jsdom posées AVANT l'import de react-dom (onChange fiable).

const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { url: "http://localhost/workflow/1" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
let PHOTO: Photo = { id: 12, filename: "p.jpg", alt: "vue avant", image_description: "" };

g.fetch = (async (url: unknown, init?: { method?: string; body?: string }) => {
  const u = String(url);
  const method = init?.method ?? "GET";
  let body: Record<string, unknown> | undefined;
  if (init?.body) { try { body = JSON.parse(init.body) as Record<string, unknown>; } catch { /* ignore */ } }
  calls.push({ method, url: u, body });
  if (u.includes("/api/photos/12/meta") && method === "PUT") {
    PHOTO = { ...PHOTO, ...(body as Partial<Photo>) };
    return { ok: true, status: 200, json: async () => ({ ...PHOTO }) } as unknown as Response;
  }
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
}) as unknown as typeof fetch;

const { createRoot } = await import("react-dom/client");
const React = (await import("react")).default;
const { PhotoMeta } = await import("../photo-meta");

const saved: unknown[] = [];
const root = createRoot(dom.window.document.getElementById("root")!);
const renderPhoto = (photo: Photo) =>
  root.render(React.createElement(PhotoMeta, { photo, onSaved: (p: unknown) => saved.push(p) }));
renderPhoto(PHOTO);
await new Promise((r) => setTimeout(r, 150));
const doc = dom.window.document;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// valeurs initiales rendues
const input = doc.querySelector("input") as HTMLInputElement | null;
const area = doc.querySelector("textarea") as HTMLTextAreaElement | null;
if (!input || !area) throw new Error("champs alt/description absents");
if (String(input.value) !== "vue avant") throw new Error("alt initial attendu « vue avant », obtenu « " + input.value + " »");
if (area.value !== "") throw new Error("description initiale attendue vide");

// modification + sortie de champ → PUT automatique avec les deux valeurs
// (setter natif AVANT le dispatch input, sinon React ignore le changement)
const setInputValue = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  const proto = el instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
};
setInputValue(input, "vue après");
setInputValue(area, "armoire ouverte, rangées de fusibles");
input.dispatchEvent(new dom.window.Event("focusout", { bubbles: true }));
await wait(150);
const put = calls.find((c) => c.method === "PUT" && c.url.includes("/api/photos/12/meta"));
if (!put) throw new Error("PUT /api/photos/12/meta non déclenché au blur");
if (put.body?.alt !== "vue après" || put.body?.image_description !== "armoire ouverte, rangées de fusibles")
  throw new Error("body PUT inattendu : " + JSON.stringify(put.body));
if (!(doc.body.textContent ?? "").includes("Enregistré")) throw new Error("confirmation d'enregistrement absente");
if (saved.length !== 1) throw new Error("onSaved attendu 1 fois, obtenu " + saved.length);

// sans modification : aucun PUT supplémentaire (l'éditeur réel re-rend avec
// la photo mise à jour via onSaved — simulé ici par renderPhoto)
renderPhoto(PHOTO);
await wait(100);
const before = calls.length;
input.dispatchEvent(new dom.window.Event("focusout", { bubbles: true }));
await wait(100);
if (calls.length !== before) throw new Error("PUT ne doit pas partir sans modification");

// sélection d'une autre photo → champs re-synchronisés
renderPhoto({ id: 13, filename: "q.jpg", alt: "autre vue", image_description: "déjà décrite" });
await wait(150);
if (String(input.value) !== "autre vue") throw new Error("alt non resynchronisé : « " + input.value + " »");
if (String(area.value) !== "déjà décrite") throw new Error("description non resynchronisée : « " + area.value + " »");

console.log("photo-meta.test : OK (rendu, autosave PUT, re-sync)");
