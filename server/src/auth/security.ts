import type { Request, Response, NextFunction } from "express";

// En-têtes de sécurité appliqués à toutes les réponses (durcissement standard).
export function securityHeaders(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
    // HSTS uniquement si TLS actif (sinon le dev local http:// serait bloqué).
    if (req.secure || req.headers["x-forwarded-proto"] === "https") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    // CSP : scripts/styles du seul domaine courant ; 'unsafe-inline' requis
    // pour le style inline React de la V1 (à resserrer avec Tailwind v2).
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    next();
  };
}

// Rate limiting en mémoire : par IP + email, fenêtre glissante.
const attempts = new Map<string, number[]>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

export function loginRateLimiter() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip ?? "?"}:${String(req.body?.email ?? "").toLowerCase()}`;
    const now = Date.now();
    const list = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (list.length >= MAX_ATTEMPTS) {
      res.status(429).json({
        error: "too_many_requests",
        message: "Trop de tentatives — réessayez dans 15 minutes",
      });
      return;
    }
    list.push(now);
    attempts.set(key, list);
    next();
  };
}

// Cookies « secure » quand derrière TLS (proxy) : détection via header.
export function cookieSecure(): boolean {
  return process.env.MODOP_SECURE_COOKIES === "1";
}
