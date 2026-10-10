import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { attachAuth } from "./auth/middleware.js";
import { authRouter } from "./routes/auth.js";
import { workflowRouter, stepRouter } from "./routes/workflows.js";
import { listRouter } from "./routes/list.js";
import { photoRouter, staticPhotos, deletePhotoRouter } from "./routes/photos.js";
import { publishRouter } from "./routes/publish.js";
import { exportRouter } from "./routes/export.js";
import { deployRouter } from "./routes/deploy.js";

export function createApp(db: Database.Database, webDist?: string): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachAuth(db));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter(db));
  app.use("/api/workflows", workflowRouter(db));
  app.use("/api/workflows", listRouter(db));
  app.use("/api/workflows", publishRouter(db));
  app.use("/api/workflows", exportRouter(db));
  app.use("/api/steps", stepRouter(db));
  app.use("/api/steps", photoRouter(db));
  app.use("/api/photos", deletePhotoRouter(db));
  app.use("/api/deploy", deployRouter(db));
  app.get("/photos/:filename", staticPhotos());

  if (webDist && fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api|\/photos).*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }
  return app;
}
