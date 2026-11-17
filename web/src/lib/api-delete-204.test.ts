import { JSDOM } from "jsdom";
import { api } from "../api";

// C-111 : une réponse 204 sans corps ne doit PAS faire échouer handle().
// REX C-107 : la suppression d'un compte désactivé RÉUSSISSAIT côté serveur
// mais le front affichait « Suppression impossible » (res.json() sur un corps
// vide lève une SyntaxError). Le mock ci-dessous n'expose volontairement PAS
// de méthode json() : tout appel échouerait.

const dom = new JSDOM(`<!doctype html><html><body></body></html>`, { url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;

let calls = 0;
g.fetch = (async () => {
  calls++;
  return {
    ok: true,
    status: 204,
    // volontairement PAS de json()
    text: async () => "",
  };
}) as unknown as typeof fetch;

await api.adminDeleteUser(42);
if (calls !== 1) throw new Error("un appel fetch attendu, obtenu " + calls);
console.log("OK C-111 : 204 sans corps → adminDeleteUser résout sans erreur");
