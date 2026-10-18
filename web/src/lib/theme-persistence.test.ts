import { JSDOM } from "jsdom";
import { applyTheme, getStoredTheme, toggleTheme } from "../theme";

// Persistance du thème : localStorage → <html data-theme> → localStorage,
// y compris la mise à jour du meta theme-color mobile.

const dom = new JSDOM(`<!doctype html><html><head><meta name="theme-color" content="#517485"></head><body></body></html>`, {
  url: "http://localhost/",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
(g as { localStorage: unknown }).localStorage = dom.window.localStorage;
(g as { matchMedia: unknown }).matchMedia = dom.window.matchMedia?.bind(dom.window) ?? ((q: string) => ({ matches: false, media: q }));

const html = dom.window.document.documentElement;
const meta = dom.window.document.querySelector('meta[name="theme-color"]');

// 1. persistance : applyTheme écrit localStorage + dataset
applyTheme("dark");
if (html.dataset.theme !== "dark") throw new Error("dataset.theme non appliqué");
if (dom.window.localStorage.getItem("modop-theme") !== "dark") throw new Error("thème non persisté dans localStorage");
if (meta?.getAttribute("content") !== "#15191d") throw new Error("meta theme-color non mis à jour en sombre");

// 2. relecture : getStoredTheme retourne la valeur persistée
if (getStoredTheme() !== "dark") throw new Error("getStoredTheme ne relit pas la valeur persistée");

// 3. toggle : dark → light, persisté aussi
const next = toggleTheme();
if (next !== "light") throw new Error(`toggle attendu light, obtenu ${next}`);
if (dom.window.localStorage.getItem("modop-theme") !== "light") throw new Error("toggle non persisté");
if (meta?.getAttribute("content") !== "#517485") throw new Error("meta theme-color non mis à jour en clair");

// 4. retour arrière : light → dark
if (toggleTheme() !== "dark") throw new Error("toggle light→dark échoué");

console.log("U-THEME PERSISTANCE + META THEME-COLOR OK");
process.exit(0);
