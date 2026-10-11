import type { Request, Response, NextFunction } from "express";

// Anti-CSRF : sur toute requête mutante (POST/PUT/DELETE/PATCH), l'origine
// doit correspondre à l'hôte servi. sameSite=lax bloque déjà les POST
// cross-site top-level ; c'est la défense en profondeur pour le reste
// (navigations, outils non navigateur). Absence d'Origin acceptée pour les
// clients same-origin qui n'en envoient pas (curl, tests).
export function assertSameOrigin(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const host = req.headers.host;
    const origin = req.headers.origin;
    const fetchSite = req.headers["sec-fetch-site"];
    if (typeof fetchSite === "string" && fetchSite !== "same-origin" && fetchSite !== "none") {
      res.status(403).json({ error: "forbidden", message: "Requête cross-site refusée" });
      return;
    }
    if (typeof origin === "string" && origin !== "null" && host) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      if (originHost !== host) {
        res.status(403).json({ error: "forbidden", message: "Requête cross-site refusée" });
        return;
      }
    }
    next();
  };
}
