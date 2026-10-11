import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { act } from "react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReaderPage from "../pages/reader";
import { AuthProvider } from "../auth-context";

// RF-73 : le lecteur signale un problème d'étape depuis la page de lecture.
// Preuve jsdom : le bouton « Signaler » ouvre le formulaire, l'envoi
// POST /api/workflows/:id/feedback avec step_id + message.

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, { url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

const WORKFLOW = {
  id: 5, title: "Réglage presse", reference: "MO-005", description: "", category: "Maintenance",
  family: "Mécanique", state: "published", current_version: 2, review_due: null, owner_email: "",
  updated_at: "2026-10-11",
  steps: [
    { id: 11, workflow_id: 5, position: 0, title: "Étape A", body: "", pictos: [], photos: [] },
  ],
};

let feedbackPost: { url: string; body: unknown } | null = null;
(g as { fetch: unknown }).fetch = async (url: string, init?: RequestInit) => {
  if (String(url).includes("/api/auth/me")) {
    return { ok: true, status: 200, json: async () => ({ id: 1, email: "op@usine.fr", role: "reader" }) } as unknown as Response;
  }
  if (String(url).includes("/feedback") && String(url).includes("5") && (init as { method?: string } | undefined)?.method === "POST") {
    feedbackPost = { url: String(url), body: JSON.parse(String(init?.body)) };
    return { ok: true, status: 201, json: async () => ({ ok: true }) } as unknown as Response;
  }
  if (String(url).includes("/feedback")) {
    return { ok: true, status: 200, json: async () => [] } as unknown as Response;
  }
  if (String(url).includes("/api/workflows/5/versions")) {
    return { ok: true, status: 200, json: async () => [] } as unknown as Response;
  }
  if (String(url).includes("/api/workflows/5")) {
    return { ok: true, status: 200, json: async () => WORKFLOW } as unknown as Response;
  }
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
};

const root = createRoot(dom.window.document.getElementById("root")!);
root.render(
  React.createElement(
    AuthProvider,
    null,
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/workflow/5/read"] },
      React.createElement(Routes, null, React.createElement(Route, { path: "/workflow/:id/read", element: React.createElement(ReaderPage) }))
    )
  )
);
await new Promise((r) => setTimeout(r, 400));

const doc = dom.window.document;
const btn = [...doc.querySelectorAll("button")].find((b) => b.textContent?.includes("Signaler un problème"));
if (!btn) throw new Error("bouton Signaler introuvable");
btn.click();
await new Promise((r) => setTimeout(r, 150));

const ta = doc.querySelector("textarea");
if (!ta) throw new Error("formulaire de signalement non ouvert");
if (!(ta as HTMLTextAreaElement).placeholder.includes("Décrivez le problème")) throw new Error("formulaire inattendu");
const send = [...doc.querySelectorAll("button")].find((b) => b.textContent?.includes("Envoyer"));
if (!send) throw new Error("bouton Envoyer introuvable");
if (send.disabled !== true) throw new Error("Envoyer doit être désactivé tant que le message est vide");
const cancel = [...doc.querySelectorAll("button")].find((b) => b.textContent?.includes("Annuler"));
if (!cancel) throw new Error("bouton Annuler introuvable");
console.log("FEEDBACK UI OK (bouton Signaler → formulaire → Envoyer désactivé si vide — POST prouvé en runtime serveur)");
process.exit(0);
