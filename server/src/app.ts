import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { attachAuth, requireAuth } from "./auth/middleware.js";
import { securityHeaders, loginRateLimiter, rateLimiter } from "./auth/security.js";
import { assertSameOrigin } from "./auth/origin.js";
import { purgeExpiredSessions } from "./auth/sessions.js";
import { purgeAudit } from "./auth/audit.js";
import { authRouter } from "./routes/auth.js";
import { workflowRouter, stepRouter } from "./routes/workflows.js";
import { listRouter } from "./routes/list.js";
import { photoRouter, staticPhotos, deletePhotoRouter, annotationsRouter, photoLayoutRouter, purgeOrphanPhotos } from "./routes/photos.js";
import { publishRouter } from "./routes/publish.js";
import { exportRouter } from "./routes/export.js";
import { restoreRouter } from "./routes/restore.js";
import { deployRouter } from "./routes/deploy.js";
import { adminRouter } from "./routes/admin.js";
import { duplicateRouter } from "./routes/duplicate.js";
import { statsRouter } from "./routes/stats.js";

function disabledDeployRouter() {
  const r = express.Router();
  r.use((_req, res) => {
    res.status(403).json({ error: "forbidden", message: "Déploiement distant désactivé sur ce serveur" });
  });
  return r;
}

export function createApp(db: Database.Database, webDist?: string): express.Express {
  const app = express();
  if (process.env.MODOP_DEPLOY === "off") {
    console.log("déploiement distant DÉSACTIVÉ (MODOP_DEPLOY=off)");
  }
  purgeExpiredSessions(db);
  purgeAudit(db);
  purgeOrphanPhotos(db, process.env.MODOP_PHOTOS_DIR ?? path.resolve("data/photos"));
  app.use(securityHeaders());
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachAuth(db));
  app.use(assertSameOrigin());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth/login", loginRateLimiter() as never);
  app.use("/api/auth", authRouter(db));
  app.use("/api/workflows", workflowRouter(db));
  app.use("/api/workflows", listRouter(db));
  app.use("/api/workflows", publishRouter(db));
  app.use("/api/workflows", exportRouter(db));
  app.use("/api/workflows", restoreRouter(db));
  app.use("/api/steps", stepRouter(db));
  app.use("/api/steps", photoRouter(db));
  app.use("/api/photos", deletePhotoRouter(db));
  app.use("/api/photos", annotationsRouter(db));
  app.use("/api/photos", photoLayoutRouter(db));
  app.use("/api/deploy", process.env.MODOP_DEPLOY === "off" ? disabledDeployRouter() : deployRouter());
  app.use("/api/admin", adminRouter(db));
  app.use("/api/stats", statsRouter(db));
  app.use("/api/workflows", duplicateRouter(db));
  app.use("/api/stats", statsRouter(db));
  // S-A4 : anti-spam sur les signalements terrain (20/15 min par IP).
  app.use("/api/workflows", (req, res, next) => {
    if (req.method === "POST" && /\/feedback$/.test(req.path)) {
      rateLimiter("feedback", 15 * 60_000, 20)(req, res, next);
      return;
    }
    next();
  });
  app.get("/photos/:filename", requireAuth("reader"), staticPhotos());

  // Handler d'erreurs : la cause est logguée côté serveur ; le client ne
  // reçoit jamais le détail (chemins, erreurs SQLite) — message générique.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[500]", err);
    res.status(500).json({ error: "internal", message: "Erreur interne — consultez les logs du serveur" });
  });

  if (webDist && fs.existsSync(webDist)) {
    // Le HTML ne doit JAMAIS venir du cache HTTP navigateur : il porte le
    // script inline de thème (localStorage lu avant le premier rendu). Un HTML
    // périmé fait "sauter" le thème au rafraîchissement. Les assets /assets/*
    // sont empreintés (hash) : cache long sans risque.
    app.use("/assets", express.static(path.join(webDist, "assets"), { maxAge: "1y", immutable: true }));
    // Toute navigation (HTML, y compris servi par express.static à la racine)
    // part sans cache navigateur : le script inline de thème doit être frais.
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/assets/") && !path.extname(req.path)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
      next();
    });
    app.use(express.static(webDist, { index: false }));
    // Thème persistant côté SERVEUR : le cookie modop-theme (posé par le front
    // à chaque bascule) est injecté dans le <html> du document — le premier
    // rendu part déjà avec le bon thème, quoi que fassent les caches (CDN,
    // proxy, HTTP). Le script inline reste en repli (localStorage) pour la
    // toute première visite.
    const indexHtml = fs.readFileSync(path.join(webDist, "index.html"), "utf8");
    app.get(/^(?!\/api|\/photos).*/, (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      const cookieTheme = /(?:^|;\s*)modop-theme=(dark|light)(?:;|$)/.exec(req.headers.cookie ?? "");
      if (cookieTheme) {
        res.send(indexHtml.replace("<html lang=\"fr\">", `<html lang="fr" data-theme="${cookieTheme[1]}">`));
      } else {
        res.send(indexHtml);
      }
    });
  }
  return app;
}
