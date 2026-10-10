// Routes de déploiement — adaptées du mécanisme meal_plan (app/actions/deploy.ts).
// Sécurité : seul un admin (rôle revalidé à chaque requête via requireAuth)
// peut déclencher. Les commandes sont figées (update.sh / update.sh rollback) :
// aucun argument utilisateur n'atteint le shell.
// État dans server/data/ :
//   deploy-status.json : { mode, startedAt, pid }
//   deploy.pid / deploy.log / deploy-exit.code : écrits par le script détaché

import { execSync, spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Router } from "express";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";

interface CommitSummary {
  hash: string;
  subject: string;
  author: string;
  date: string;
}

interface DeployStatus {
  isAdmin: boolean;
  currentCommit: string | null;
  commitSubject: string | null;
  commitAuthor: string | null;
  commitDate: string | null;
  recentCommits: CommitSummary[];
  running: boolean;
  mode: "update" | "rollback" | null;
  startedAt: string | null;
  exitCode: number | null;
  finishedAt: string | null;
  logTail: string | null;
}

function repoRoot(): string {
  return path.resolve(process.cwd(), "..");
}

function dataPath(name: string): string {
  return path.join(process.cwd(), "data", name);
}

function readStatusFile(): { mode: "update" | "rollback"; startedAt: string; pid?: number } | null {
  try {
    return JSON.parse(readFileSync(dataPath("deploy-status.json"), "utf8"));
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function tail(file: string, lines: number): string | null {
  try {
    const size = statSync(file).size;
    const start = Math.max(0, size - 16384);
    const fd = openSync(file, "r");
    try {
      const buffer = Buffer.alloc(size - start);
      readSync(fd, buffer, 0, buffer.length, start);
      const content = buffer.toString("utf8").trimEnd();
      if (!content) return null;
      return content.split("\n").slice(-lines).join("\n");
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

function readPid(): number | null {
  try {
    const raw = readFileSync(dataPath("deploy.pid"), "utf8").trim();
    const pid = parseInt(raw, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function readExitCode(): number | null {
  try {
    const raw = readFileSync(dataPath("deploy-exit.code"), "utf8").trim();
    const code = parseInt(raw, 10);
    return Number.isNaN(code) ? null : code;
  } catch {
    return null;
  }
}

const GIT_INFO_TTL_MS = 30_000;
let gitInfoCache: {
  commit: string | null;
  headDetail: { subject: string | null; author: string | null; date: string | null };
  recentCommits: CommitSummary[];
  expiresAt: number;
} | null = null;

function getGitInfo() {
  if (gitInfoCache && Date.now() < gitInfoCache.expiresAt) {
    return gitInfoCache;
  }
  let commit: string | null = null;
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: repoRoot(), encoding: "utf8" }).trim();
  } catch {
    commit = null;
  }
  let headDetail = { subject: null, author: null, date: null } as {
    subject: string | null; author: string | null; date: string | null;
  };
  try {
    const out = execSync("git show -s --format=%s%x1f%an%x1f%aI HEAD", {
      cwd: repoRoot(), encoding: "utf8",
    }).trim();
    const [subject, author, date] = out.split("\x1f");
    headDetail = {
      subject: subject?.trim() || null,
      author: author?.trim() || null,
      date: date?.trim() || null,
    };
  } catch {
    /* hors dépôt git : détail indisponible */
  }
  let recentCommits: CommitSummary[] = [];
  try {
    const out = execSync("git log -5 --format=%h%x1f%s%x1f%an%x1f%aI", {
      cwd: repoRoot(), encoding: "utf8",
    }).trim();
    if (out) {
      recentCommits = out.split("\n").map((line) => {
        const [hash, subject, author, date] = line.split("\x1f");
        return {
          hash: hash?.trim() ?? "",
          subject: subject?.trim() ?? "",
          author: author?.trim() ?? "",
          date: date?.trim() ?? "",
        };
      });
    }
  } catch {
    /* hors dépôt git */
  }
  gitInfoCache = { commit, headDetail, recentCommits, expiresAt: Date.now() + GIT_INFO_TTL_MS };
  return gitInfoCache;
}

export function deployRouter(db: Database.Database): Router {
  const r = Router();

  // Statut : accessible à tout utilisateur connecté (la version n'est pas
  // sensible) ; le journal (chemins serveur, sortie npm) est réservé admin.
  r.get("/status", requireAuth("reader"), (req, res) => {
    const user = (req as { user?: { role: string } }).user!;
    const isAdmin = user.role === "admin";
    const git = getGitInfo();
    const statusFile = readStatusFile();
    const exitCode = readExitCode();
    const pid = readPid() ?? statusFile?.pid ?? null;
    const running = pid !== null && pidAlive(pid) && exitCode === null;

    let finishedAt: string | null = null;
    if (statusFile && !running && exitCode !== null) {
      try {
        finishedAt = statSync(dataPath("deploy-exit.code")).mtime.toISOString();
      } catch {
        finishedAt = null;
      }
    }

    const status: DeployStatus = {
      isAdmin,
      currentCommit: git.commit,
      commitSubject: git.headDetail.subject,
      commitAuthor: git.headDetail.author,
      commitDate: git.headDetail.date,
      recentCommits: git.recentCommits,
      running,
      mode: statusFile?.mode ?? null,
      startedAt: statusFile?.startedAt ?? null,
      exitCode,
      finishedAt,
      logTail: isAdmin ? tail(dataPath("deploy.log"), 60) : null,
    };
    res.json(status);
  });

  // Déclenchement : admin uniquement.
  r.post("/trigger", requireAuth("admin"), (req, res) => {
    const mode = (req.body as { mode?: string })?.mode;
    if (mode !== "update" && mode !== "rollback") {
      res.status(422).json({ error: "validation", message: "mode doit être 'update' ou 'rollback'" });
      return;
    }
    const previous = readStatusFile();
    if (previous && previous.pid && pidAlive(previous.pid) && readExitCode() === null) {
      res.status(409).json({ error: "conflict", message: "Un déploiement est déjà en cours" });
      return;
    }
    if (!existsSync(path.join(repoRoot(), "update.sh"))) {
      res.status(404).json({
        error: "not_found",
        message: "update.sh est introuvable sur ce serveur (déploiement possible uniquement sur le CT)",
      });
      return;
    }
    try {
      rmSync(dataPath("deploy-exit.code"), { force: true });
      rmSync(dataPath("deploy.pid"), { force: true });

      // Double-fork : le processus détaché survit au pm2 stop de update.sh.
      const scriptArg = mode === "rollback" ? " rollback" : "";
      const inner = `echo $$ > server/data/deploy.pid; cd '${repoRoot()}' && bash update.sh${scriptArg} > server/data/deploy.log 2>&1; echo $? > server/data/deploy-exit.code`;
      const command = `nohup setsid bash -c '${inner}' >/dev/null 2>&1 & disown`;
      const child = spawn("bash", ["-c", command], {
        cwd: repoRoot(),
        detached: true,
        stdio: "ignore",
      });
      child.unref();

      let pid: number | null = null;
      for (let i = 0; i < 30 && pid === null; i++) {
        pid = readPid();
        if (pid === null) {
          const until = Date.now() + 100;
          while (Date.now() < until) { /* attente active courte */ }
        }
      }
      writeFileSync(
        dataPath("deploy-status.json"),
        JSON.stringify({ mode, startedAt: new Date().toISOString(), ...(pid !== null ? { pid } : {}) })
      );
      res.json({
        success: true,
        message:
          mode === "update"
            ? "Mise à jour lancée : le serveur va redémarrer pendant le build"
            : "Retour arrière lancé : la dernière sauvegarde de la base est restaurée",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Échec du lancement : ${error instanceof Error ? error.message : "erreur inconnue"}`,
      });
    }
  });

  return r;
}
