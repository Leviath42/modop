import express from "express";
import cookieParser from "cookie-parser";
import type Database from "better-sqlite3";
import { attachAuth } from "./auth/middleware.js";
import { authRouter } from "./routes/auth.js";

export function createApp(db: Database.Database): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachAuth(db));
  app.use("/api/auth", authRouter(db));
  return app;
}
