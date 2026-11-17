import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { requireAuth } from "../auth/middleware.js";
import { auditLog } from "../auth/audit.js";
import { sniffImage, photosDir } from "./photos.js";
import { parseDocx } from "../lib/import/docx.js";
import { parsePdf } from "../lib/import/pdf.js";
import { parseXlsx } from "../lib/import/xlsx.js";
import { ImportError, type ParseResult } from "../lib/import/types.js";

// C-101 (V8 #6, RF-78) — POST /api/import/document (author+) : convertit un
// document existant (docx, pdf, xlsx) en BROUILLON Modop : étapes détectées
// + images extraites (docx). RF-78 : jamais de publication automatique —
// l'auteur relit et publie depuis l'éditeur, comme un MO créé à la main.
// Garde-fous : 20 Mo, 100 étapes, 30 images, sniff magique du contenu.

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

export function importRouter(db: Database.Database): Router {
  const r = Router();

  r.post("/document", requireAuth("author"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(422).json({ error: "validation", message: "fichier requis" });
        return;
      }
      const name = path.basename(fixMultipartName(req.file.originalname || "import"));
      const ext = path.extname(name).toLowerCase();
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

      const parsed = await parser(buf);
      const warnings = [...parsed.warnings];
      let steps = parsed.steps;
      if (steps.length > 100) {
        steps = steps.slice(0, 100);
        warnings.push("seules les 100 premières étapes ont été importées");
      }

      const title = (name.slice(0, -ext.length) || "Document importé").trim().slice(0, 200);
      // Référence provisoire unique — l'auteur la remplace dans l'éditeur
      // (unicité vérifiée en direct, casse ignorée, comme à la création).
      let reference = "";
      for (let i = 0; i < 8; i++) {
        reference = "IMP-" + crypto.randomBytes(3).toString("hex").toUpperCase();
        if (!db.prepare("SELECT 1 FROM workflows WHERE reference = ? COLLATE NOCASE").get(reference)) break;
      }

      const dir = photosDir();
      let photosCreated = 0;
      let imagesSkipped = 0;
      const create = db.transaction((): number => {
        const info = db
          .prepare("INSERT INTO workflows (title, reference, description, category, family) VALUES (?, ?, ?, ?, ?)")
          .run(title, reference, "Importé depuis « " + name + " » — à relire avant publication", "", "");
        const wfId = Number(info.lastInsertRowid);
        const insStep = db.prepare("INSERT INTO steps (workflow_id, position, title, body) VALUES (?, ?, ?, ?)");
        const insPhoto = db.prepare("INSERT INTO photos (step_id, filename, alt) VALUES (?, ?, ?)");
        steps.forEach((st, i) => {
          const si = insStep.run(wfId, i, st.title.slice(0, 200), st.body);
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
        (req as { user?: { email: string } }).user?.email ?? "?",
        "import_document",
        "workflow:" + wfId,
        ext + " " + steps.length + " étape(s), " + photosCreated + " photo(s)"
      );
      res.status(201).json({ workflow, steps_created: steps.length, photos_created: photosCreated, warnings });
    } catch (e) {
      if (e instanceof ImportError) {
        res.status(422).json({ error: "validation", message: e.message });
        return;
      }
      console.error("import error", e);
      res.status(500).json({ error: "internal", message: "import impossible" });
    }
  });

  return r;
}
