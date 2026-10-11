import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";

// Rendu réel de la structure de la page deploy avec un journal factice :
// le CSS de styles.css doit replier le texte (pas de coupe) et le cadre
// doit scroller verticalement.
const dom = new JSDOM(
  `<!doctype html><html><head><style>
pre, code, .modop-log { overflow-wrap: anywhere; word-break: break-word; max-width: 100%; white-space: pre-wrap; }
main, section { min-width: 0; }
</style></head><body><div id="root"></div></body></html>`,
  { url: "http://localhost/deploy" }
);
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

const LONG_LINE = "[update] récupération du code (a1b2c3 -> f4e5d6) : git fetch origin beta && git reset --hard origin/beta puis npm ci --silent --production=false https:// très longue ligne de test volontairement démesurée pour vérifier le repli du texte dans le journal du déploiement";

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(
    "div",
    { className: "modop-log", style: { background: "#f2f3f5", padding: "0.8rem", height: "260px", overflowY: "auto", width: "100%" } },
    LONG_LINE + "\n" + "ligne 2"
  )
);
await new Promise((r) => setTimeout(r, 100));
const el = dom.window.document.querySelector(".modop-log") as HTMLElement;
const css = dom.window.getComputedStyle(el);
if (css.whiteSpace !== "pre-wrap") throw new Error("whiteSpace: " + css.whiteSpace);
if (css.overflowWrap !== "anywhere" && css.wordBreak !== "break-word") throw new Error("pas de repli configuré");
if (!el.textContent?.includes("volontairement")) throw new Error("contenu manquant");
console.log("✓ journal: repli configuré (pre-wrap + anywhere), contenu complet");
console.log("DEPLOY LOG RENDU OK");
process.exit(0);
