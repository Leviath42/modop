import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { attachAuth } from "./auth/middleware.js";
import { securityHeaders, loginRateLimiter } from "./auth/security.js";
import { purgeExpiredSessions } from "./auth/sessions.js";
import { purgeAudit } from "./auth/audit.js";
import { authRouter } from "./routes/auth.js";
import { workflowRouter, stepRouter } from "./routes/workflows.js";
import { listRouter } from "./routes/list.js";
import { photoRouter, staticPhotos, deletePhotoRouter } from "./routes/photos.js";
import { publishRouter } from "./routes/publish.js";
import { exportRouter } from "./routes/export.js";
import { deployRouter } from "./routes/deploy.js";
import { adminRouter } from "./routes/admin.js";
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
  app.use(securityHeaders());
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachAuth(db));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth/login", loginRateLimiter() as never);
  app.use("/api/auth", authRouter(db));
  app.use("/api/workflows", workflowRouter(db));
  app.use("/api/workflows", listRouter(db));
  app.use("/api/workflows", publishRouter(db));
  app.use("/api/workflows", exportRouter(db));
  app.use("/api/steps", stepRouter(db));
  app.use("/api/steps", photoRouter(db));
  app.use("/api/photos", deletePhotoRouter(db));
  app.use("/api/deploy", process.env.MODOP_DEPLOY === "off" ? disabledDeployRouter() : deployRouter(db));
  app.use("/api/admin", adminRouter(db));
  app.use("/api/stats", statsRouter(db));
  app.get("/photos/:filename", staticPhotos());

  if (webDist && fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api|\/photos).*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }
  return app;
}
