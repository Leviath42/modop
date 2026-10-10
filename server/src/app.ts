import express from "express";
import cookieParser from "cookie-parser";
import type Database from "better-sqlite3";
import { attachAuth } from "./auth/middleware.js";
import { authRouter } from "./routes/auth.js";
import { workflowRouter, stepRouter } from "./routes/workflows.js";

export function createApp(db: Database.Database): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachAuth(db));
  app.use("/api/auth", authRouter(db));
  app.use("/api/workflows", workflowRouter(db));
  app.use("/api/steps", stepRouter(db));
  return app;
}
