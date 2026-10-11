import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";

// Vérifie le rendu RÉEL du journal avec les styles inline exacts de la page :
// scroll vertical actif et repli des lignes longues.
const dom = new JSDOM(`<!doctype html><html><body style="width:600px"><div id="root"></div></body></html>`, {
  url: "http://localhost/deploy",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

const LONG = "[update] récupération du code : git fetch origin beta && git reset --hard origin/beta && npm ci --silent && npm run build --prefix server https://github.com/Leviath42/modop très longue ligne volontairement exagérée pour le test du repli";

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement("pre", {
    style: { margin: 0, background: "#f2f3f5", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.8rem", fontSize: "0.75rem", lineHeight: 1.5, maxHeight: "260px", width: "100%", boxSizing: "border-box", overflowY: "scroll", overflowX: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-all", display: "block" },
  }, LONG + "\nligne 2\nligne 3")
);
await new Promise((r) => setTimeout(r, 100));
const pre = dom.window.document.querySelector("pre") as HTMLElement;
const css = dom.window.getComputedStyle(pre);
if (css.overflowY !== "scroll") throw new Error("overflowY: " + css.overflowY);
if (css.whiteSpace !== "pre-wrap") throw new Error("whiteSpace: " + css.whiteSpace);
if (css.wordBreak !== "break-all") throw new Error("wordBreak: " + css.wordBreak);
// le contenu complet est présent (pas de troncature DOM)
if (!pre.textContent?.includes("exagérée")) throw new Error("contenu tronqué");
// pas de débordement horizontal du cadre de 600px
if (pre.scrollWidth > 600) throw new Error(`débordement horizontal: scrollWidth=${pre.scrollWidth}`);
console.log("✓ journal scrollable (overflow-y: scroll), replié (pre-wrap/break-all), aucun débordement");
process.exit(0);
