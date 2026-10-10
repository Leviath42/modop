import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import React from "react";
import LoginPage from "../pages/login";
import { AuthProvider } from "../auth-context";
import { BrowserRouter } from "react-router-dom";

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/",
});

const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(
    AuthProvider,
    null,
    React.createElement(BrowserRouter, null, React.createElement(LoginPage))
  )
);
await new Promise((r) => setTimeout(r, 150));
const html = dom.window.document.getElementById("root")!.innerHTML;

if (!html.includes("Se connecter")) throw new Error("bouton absent");
if (!html.includes('type="email"')) throw new Error("champ email absent");
if (!html.includes('type="password"')) throw new Error("champ password absent");

console.log("U1 LOGIN RENDU OK");
process.exit(0);
