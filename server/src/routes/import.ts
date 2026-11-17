import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import { rateLimiter } from "../auth/security.js";
import { sniffImage, photosDir } from "./photos.js";
import { parseDocx } from "../lib/import/docx.js";
import { parsePdf } from "../lib/import/pdf.js";
import { parsePdfWithAi } from "../lib/import/ai-pdf.js";
import { parseXlsx } from "../lib/import/xlsx.js";
import { ImportError, type ParseResult } from "../lib/import/types.js";
import { aiStatus } from "../lib/ai/client.js";
import { AiError } from "../lib/ai/error.js";

// C-101 (V8 #6, RF-78) — POST /api/import/document (author+) : convertit un
// document existant (docx, pdf, xlsx) en BROUILLON Modop : étapes détectées
// + images extraites (docx). RF-78 : jamais de publication automatique —
// l'auteur relit et publie depuis l'éditeur, comme un MO créé à la main.
// Garde-fous : 20 Mo, 100 étapes, 30 images, sniff magique du contenu.
//
// C-109 (V14 #2) — mode IA : champ form ai=1 (PDF uniquement). Les pages sont
// rendues en images et envoyées au moteur IA (C-108) qui PROPOSE une
// structuration ; validation stricte + tri par les numéros de la SOURCE
// (jamais l'ordre du modèle), a_completer → commentaires d'auteurs. Les PDF
// scannés sont acceptés (vision). Rate-limit dédié : un appel vision coûte.

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// busboy (multer 1 comme 2) décode le filename UTF-8 brut en latin1 :
// « opératoire.docx » arrive mojibake (« opÃ©ratoire »). Le décodage
// WHATWG-escaped de multer >= 2.3 ne couvre que filename*= (RFC 5987).
// Roundtrip latin1→utf8 quand il produit de l'UTF-8 valide, original sinon.
function fixMultipartName(name: string): string {
  const repaired = Buffer.from(name, "latin1").toString("utf8");
  return repaired.includes(String.fromCharCode(65533)) ? name : repaired;
}

const PARSERS: Record<string, (b: Buffer) => Promise<ParseResult>> = {
  ".docx": parseDocx,
  ".pdf": parsePdf,
  ".xlsx": parseXlsx,
};

// C-109 : indications métiers actives (C-97, paramétrables) = liste de pictos
// autorisée pour la proposition IA ; repli sur la liste historique.
function pictoKinds(db: Database.Database): string[] {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'indications'").get() as { value: string } | undefined;
    if (row) {
      const kinds = (JSON.parse(row.value) as { kind?: unknown }[])
        .map((i) => i.kind)
        .filter((k): k is string => typeof k === "string");
      if (kinds.length) return kinds;
    }
  } catch {
    // repli ci-dessous
  }
  return ["attention", "danger", "epi", "electrique", "point-chaud", "outil", "info"];
}

export function importRouter(db: Database.Database): Router {
  const r = Router();

  // Rate limit uniquement quand le mode IA est demandé (multer a déjà décodé
  // req.body quand ce mini-middleware s'exécute).
  const aiLimit = rateLimiter("import-ai", 10 * 60_000, 5);
  const aiLimitMaybe = (req: Request, _res: Response, next: NextFunction): void => {
    if ((req as { body?: { ai?: unknown } }).body?.ai === "1") {
      aiLimit(req, _res, next);
      return;
    }
    next();
  };

  r.post("/document", requireAuth("author"), upload.single("file"), aiLimitMaybe, async (req, res) => {
    try {
      if (!req.file) {
        res.status(422).json({ error: "validation", message: "fichier requis" });
        return;
      }
      const name = path.basename(fixMultipartName(req.file.originalname || "import"));
      const ext = path.extname(name).toLowerCase();
      const aiMode = (req as { body?: { ai?: unknown } }).body?.ai === "1";
      if (aiMode && ext !== ".pdf") {
        res.status(422).json({
          error: "validation",
          message: "le mode IA couvre les PDF en v1 — pour un docx/xlsx, utilisez l'import classique",
        });
        return;
      }
      if (aiMode && !aiStatus(db).configured) {
        res.status(422).json({
          error: "validation",
          message: "moteur IA non activé — activez-le dans Paramètres (admin)",
        });
        return;
      }
      const parser = PARSERS[ext];
      if (!parser) {
        res.status(422).json({
          error: "validation",
          message: "format non supporté (docx, pdf, xlsx) — .xls ancien format binaire : convertir en .xlsx d'abord",
        });
        return;
      }
      const buf = req.file.buffer;
      const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
      const isPdf = buf.length > 4 && buf.subarray(0, 4).toString("latin1") === "%PDF";
      if ((ext === ".pdf" && !isPdf) || (ext !== ".pdf" && !isZip)) {
        res.status(422).json({ error: "validation", message: "contenu du fichier non conforme à son extension" });
        return;
      }

      const parsed = aiMode ? await parsePdfWithAi(buf, name, pictoKinds(db), db) : await parser(buf);
      const warnings = [...parsed.warnings];
      let steps = parsed.steps;
      if (steps.length > 100) {
        steps = steps.slice(0, 100);
        warnings.push("seules les 100 premières étapes ont été importées");
      }

      // C-109 : titre/référence/description proposés par l'IA (si présents).
      const title =
        (parsed.title || name.slice(0, -ext.length) || "Document importé").trim().slice(0, 200) || "Document importé";
      // Référence : celle proposée par l'IA si elle est LIBRE, sinon provisoire
      // unique — l'auteur la remplace dans l'éditeur (unicité en direct).
      let reference = "";
      const proposedRef = (parsed.reference || "").trim().slice(0, 200);
      if (proposedRef && !db.prepare("SELECT 1 FROM workflows WHERE reference = ? COLLATE NOCASE").get(proposedRef)) {
        reference = proposedRef;
      } else if (proposedRef) {
        warnings.push("référence « " + proposedRef + " » déjà utilisée : référence provisoire générée, à corriger dans l'éditeur");
      }
      if (!reference) {
        for (let i = 0; i < 8; i++) {
          reference = "IMP-" + crypto.randomBytes(3).toString("hex").toUpperCase();
          if (!db.prepare("SELECT 1 FROM workflows WHERE reference = ? COLLATE NOCASE").get(reference)) break;
        }
      }
      const description = parsed.ai_used
        ? "Import assisté par IA depuis « " + name + " » — À RELIRE AVANT PUBLICATION (structure proposée par le moteur IA)." +
          (parsed.description ? " " + parsed.description : "")
        : "Importé depuis « " + name + " » — à relire avant publication";

      const dir = photosDir();
      let photosCreated = 0;
      let imagesSkipped = 0;
      const actor = (req as { user?: { email: string } }).user?.email ?? "?";
      const stepNumbers = parsed.step_numbers ?? [];
      const create = db.transaction((): number => {
        const info = db
          .prepare("INSERT INTO workflows (title, reference, description, category, family) VALUES (?, ?, ?, ?, ?)")
          .run(title, reference, description, "", "");
        const wfId = Number(info.lastInsertRowid);
        const insStep = db.prepare("INSERT INTO steps (workflow_id, position, title, body, pictos) VALUES (?, ?, ?, ?, ?)");
        const insPhoto = db.prepare("INSERT INTO photos (step_id, filename, alt) VALUES (?, ?, ?)");
        const insComment = db.prepare("INSERT INTO step_comments (step_id, by_email, message) VALUES (?, ?, ?)");
        const stepIds: number[] = [];
        steps.forEach((st, i) => {
          const si = insStep.run(wfId, i, st.title.slice(0, 200), st.body, JSON.stringify(st.pictos ?? []));
          stepIds.push(Number(si.lastInsertRowid));
          for (const img of st.images) {
            if (photosCreated >= 30) {
              imagesSkipped++;
              continue;
            }
            const real = sniffImage(img.buffer);
            if (!real || real === "image/webp") {
              imagesSkipped++;
              continue;
            }
            if (img.buffer.length > 15 * 1024 * 1024) {
              imagesSkipped++;
              continue;
            }
            const filename = crypto.randomBytes(16).toString("hex") + (real === "image/png" ? ".png" : ".jpg");
            fs.writeFileSync(path.join(dir, filename), img.buffer);
            insPhoto.run(Number(si.lastInsertRowid), filename, img.alt.slice(0, 200));
            photosCreated++;
          }
        });
        // C-109 : points à compléter → commentaires d'auteurs (C-96, jamais
        // publiés) sur l'étape concernée (numéro → position), étape 1 sinon.
        for (const t of parsed.todo ?? []) {
          const idx = t.step != null ? stepNumbers.indexOf(t.step) : -1;
          const sid = stepIds[idx >= 0 ? idx : 0];
          insComment.run(sid, actor, "À COMPLÉTER (import IA) : " + t.question.slice(0, 500));
        }
        return wfId;
      });
      const wfId = create();
      if (imagesSkipped > 0) {
        warnings.push(imagesSkipped + " image(s) ignorée(s) (format non supporté ou limite de 30 atteinte)");
      }
      db.prepare("UPDATE workflows SET updated_at = datetime('now') WHERE id = ?").run(wfId);
      const workflow = db.prepare("SELECT * FROM workflows WHERE id = ?").get(wfId);
      auditLog(
        db,
        actor,
        parsed.ai_used ? "import_ai" : "import_document",
        "workflow:" + wfId,
        ext + " " + steps.length + " étape(s), " + photosCreated + " photo(s)" +
          (parsed.ai_used ? ", modèle " + aiStatus(db).model : "")
      );
      res.status(201).json({
        workflow,
        steps_created: steps.length,
        photos_created: photosCreated,
        warnings,
        ai_used: parsed.ai_used ?? false,
      });
    } catch (e) {
      if (e instanceof ImportError) {
        res.status(422).json({ error: "validation", message: e.message });
        return;
      }
      if (e instanceof AiError) {
        res.status(e.status).json({ error: "ai", message: e.message });
        return;
      }
      console.error("import error", e);
      res.status(500).json({ error: "internal", message: "import impossible" });
    }
  });

  return r;
}
