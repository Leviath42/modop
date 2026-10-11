import type { Request, Response, NextFunction } from "express";

// Anti-CSRF : sur toute requête mutante (POST/PUT/DELETE/PATCH), l'origine
// doit correspondre à l'hôte servi. sameSite=lax bloque déjà les POST
// cross-site top-level ; c'est la défense en profondeur pour le reste
// (navigations, outils non navigateur). Absence d'Origin acceptée pour les
// clients same-origin qui n'en envoient pas (curl, tests).
//
// Hôte de référence : X-Forwarded-Host (reverse proxy/tunnel Cloudflare qui
// préserve l'hôte public) sinon Host. La config du tunnel ne doit PAS
// réécrire le Host (httpHostHeader) — cf. scripts/hardening-tunnel.sh.
// S-A2 : X-Forwarded-Host n'est pas signé par le client direct — si une
// allowlist est configurée (MODOP_ALLOWED_HOSTS, hôtes séparés par des
// virgules), une valeur absente de la liste est ignorée (retour au Host).
function allowedForwardedHosts(): Set<string> | null {
  const raw = process.env.MODOP_ALLOWED_HOSTS;
  if (!raw) return null;
  return new Set(raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
}

function forwardedHost(req: Request): string | null {
  const xfh = req.headers["x-forwarded-host"];
  const first = Array.isArray(xfh) ? xfh[0] : xfh;
  if (typeof first === "string" && first.trim()) {
    const host = first.split(",")[0].trim().toLowerCase();
    const allow = allowedForwardedHosts();
    if (!allow || allow.has(host)) return host;
  }
  const host = req.headers.host;
  return typeof host === "string" ? host.toLowerCase() : null;
}

export function assertSameOrigin(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const origin = req.headers.origin;
    const fetchSite = req.headers["sec-fetch-site"];
    if (typeof fetchSite === "string" && fetchSite !== "same-origin" && fetchSite !== "none") {
      res.status(403).json({ error: "forbidden", message: "Requête cross-site refusée" });
      return;
    }
    if (typeof origin === "string" && origin !== "null") {
      const refHost = forwardedHost(req);
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {
        originHost = null;
      }
      if (!refHost || !originHost || originHost !== refHost) {
        res.status(403).json({ error: "forbidden", message: "Requête cross-site refusée" });
        return;
      }
    }
    next();
  };
}
