import { createCanvas } from "@napi-rs/canvas";
import type Database from "better-sqlite3";
import { AiError } from "../ai/error.js";
import { aiChat, aiStatus } from "../ai/client.js";
import { pdfTextLines } from "./pdf.js";
import type { ImportStep, ImportTodo, ParseResult } from "./types.js";

// C-109 (V14 #2) — import PDF assisti par IA (vision). Rendu des pages en
// images (pdf.js legacy + @napi-rs/canvas, déjà dépendances du serveur),
// envoi au moteur IA (C-108) avec la couche texte brute en aide, puis
// VALIDATION STRICTE de la proposition. Garde-fou REX MO 25 : l'ordre final
// est décidé par les NUMÉROS D'ÉTAPES LUS DANS LA SOURCE, jamais par l'ordre
// de génération du modèle. Les PDF scannés sont importables (l'OCR est fait
// par le modèle vision). Jamais de publication d'office (RF-78).

const MAX_PAGES = 10;
const SCALE = 1.5;
const JPEG_QUALITY = 0.75;
const TEXT_AID_MAX = 30000;

// --- rendu des pages -------------------------------------------------------

interface PdfViewport {
  width: number;
  height: number;
}
interface RenderablePdfPage {
  getViewport(o: { scale: number }): PdfViewport;
  render(p: { canvasContext: unknown; viewport: unknown; canvas?: unknown }): Promise<void>;
  cleanup(): void;
}
interface RenderablePdfDocument {
  numPages: number;
  getPage(n: number): Promise<RenderablePdfPage>;
}
interface RenderableTask {
  promise: Promise<RenderablePdfDocument>;
  destroy(): Promise<void>;
}

// CanvasFactory maison (pdf.js n'a pas de DOM en Node) — castée au plus bas.
class NapiCanvasFactory {
  create(w: number, h: number) {
    const canvas = createCanvas(w, h);
    return { canvas, context: canvas.getContext("2d") };
  }
  destroy(): void {
    // Canvas @napi-rs : pas de libération explicite dans cette version (GC).
  }
}

async function renderPdfPages(buf: Buffer): Promise<Buffer[]> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument(src: {
      data: Uint8Array;
      isEvalSupported?: boolean;
      canvasFactory?: unknown;
    }): RenderableTask;
  };
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    canvasFactory: new NapiCanvasFactory(),
  });
  const doc = await task.promise;
  const out: Buffer[] = [];
  try {
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      // Fond blanc : un PDF n'a pas de fond, le JPEG sinon noir/transparent.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas });
      out.push(await canvas.encode("jpeg", JPEG_QUALITY));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return out;
}

// --- prompt ----------------------------------------------------------------

function systemPrompt(pictoKinds: string[]): string {
  const kinds = pictoKinds.join(", ");
  return [
    "Tu es un assistant d'import de fiches industrielles (modes opératoires, fiches de poste).",
    "Tu reçois le rendu image des pages d'un document et, si disponible, sa couche texte brute (qui peut être désordonnée : les colonnes y sont interfoliées).",
    "Ta tâche : proposer une structuration en étapes. Réponds UNIQUEMENT avec un objet JSON valide, aucun texte autour.",
    "Règles obligatoires :",
    "1. RECOPIE les textes VERBATIM, fautes du document incluses. N'invente RIEN, ne reformule pas, ne complète pas.",
    "2. ORDRE : appuie-toi sur les NUMÉROS D'ÉTAPES visibles dans le document. Le champ number de chaque étape = le numéro LU dans le document ; s'il n'y en a aucun, numérote 1,2,3… dans l'ordre de lecture.",
    "3. Chaque étape : title = titre court (≤ 120 caractères), body = le texte de consigne complet de l'étape.",
    "4. pictos : liste parmi [" + kinds + "] UNIQUEMENT si le document le justifie clairement (ex. mention d'EPI, d'outillage spécifique, d'un danger). Sinon [].",
    "5. reference = la référence du document si visible (ex. FP262 A), sinon chaîne vide. title = la désignation du document si visible, sinon chaîne vide. description = une phrase de résumé factuelle des étapes, sinon chaîne vide.",
    "6. Si une information est illisible, incertaine ou manquante (critère de contrôle, valeur, photo), ajoute une entrée dans a_completer avec step = le numéro de l'étape concernée (ou null si global) et question = ce qu'il faut vérifier/compléter. Ne devine jamais à la place.",
    "7. Ne décris pas les images et ne tente pas de les extraire : la mise en place des photos se fait après import.",
    'Schéma de réponse exact : {"title":string,"reference":string,"description":string,"steps":[{"number":number,"title":string,"body":string,"pictos":string[]}],"a_completer":[{"step":number|null,"question":string}]}',
  ].join("\n");
}

// --- validation ------------------------------------------------------------

interface RawStep {
  number?: unknown;
  title?: unknown;
  body?: unknown;
  pictos?: unknown;
}

function asString(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function parseStructureProposal(
  raw: string,
  pictoKinds: string[]
): { steps: ImportStep[]; warnings: string[]; reference: string; title: string; description: string; todo: ImportTodo[]; numbers: number[] } {
  let text = raw.trim();
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text);
  if (fenced) text = fenced[1];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AiError("réponse du moteur IA illisible (JSON invalide)", 502);
  }
  if (typeof data !== "object" || data === null) throw new AiError("réponse du moteur IA inattendue", 502);
  const o = data as Record<string, unknown>;
  const rawSteps = Array.isArray(o.steps) ? (o.steps as RawStep[]) : [];
  if (!rawSteps.length) throw new AiError("le moteur IA n'a proposé aucune étape", 502);

  const valid = new Set(pictoKinds);
  const steps: ImportStep[] = [];
  const numbers: number[] = [];
  for (const rs of rawSteps.slice(0, 100)) {
    const title = asString(rs.title, 200).trim();
    const body = asString(rs.body, 50000);
    if (!title && !body) continue;
    const pictos =
      Array.isArray(rs.pictos) ? [...new Set((rs.pictos as unknown[]).filter((p): p is string => typeof p === "string" && valid.has(p)))] : [];
    let num = typeof rs.number === "number" && Number.isInteger(rs.number) && rs.number > 0 && rs.number < 1000 ? rs.number : 0;
    if (!num) num = steps.length + 1;
    numbers.push(num);
    steps.push({ title: title || "Étape", body, images: [], pictos });
  }
  if (!steps.length) throw new AiError("le moteur IA n'a proposé aucune étape exploitable", 502);

  const warnings: string[] = [];
  const dup = new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i));
  if (dup.size) warnings.push("numéros d'étapes en double dans la proposition IA : ordre à vérifier avant publication");
  const autoNumbered = rawSteps.some((rs) => typeof rs.number !== "number");
  if (autoNumbered) warnings.push("certains numéros d'étapes n'étaient pas lisibles : ordre à vérifier avant publication");
  // GARDE-FOU : l'ordre vient des numéros de la SOURCE, pas du modèle.
  const pairs = steps.map((s, i) => ({ s, n: numbers[i] }));
  pairs.sort((a, b) => a.n - b.n);
  steps.length = 0;
  pairs.forEach((p) => steps.push(p.s));

  const todo: ImportTodo[] = [];
  if (Array.isArray(o.a_completer)) {
    for (const t of (o.a_completer as Record<string, unknown>[]).slice(0, 20)) {
      const question = asString(t.question, 500).trim();
      if (!question) continue;
      todo.push({
        step: typeof t.step === "number" && Number.isInteger(t.step) ? t.step : null,
        question,
      });
    }
  }
  return {
    steps,
    warnings,
    reference: asString(o.reference, 200).trim(),
    title: asString(o.title, 200).trim(),
    description: asString(o.description, 2000).trim(),
    todo,
    numbers: pairs.map((p2) => p2.n),
  };
}

// --- entrée ----------------------------------------------------------------

export async function parsePdfWithAi(buf: Buffer, name: string, pictoKinds: string[], db: Database.Database): Promise<ParseResult> {
  const status = aiStatus(db);
  if (!status.configured) {
    throw new AiError("moteur IA non activé — activez-le dans Paramètres (admin) ou MODOP_AI_* côté serveur", 422);
  }
  const images = await renderPdfPages(buf);
  if (!images.length) throw new AiError("PDF illisible (aucune page rendue)", 422);
  const warnings: string[] = [];
  if (images.length >= MAX_PAGES) warnings.push("seules les " + MAX_PAGES + " premières pages ont été envoyées au moteur IA");

  let textAid = "";
  try {
    const lines = await pdfTextLines(buf);
    const text = lines.filter((l) => l.trim()).join("\n");
    if (text.trim()) textAid = text.slice(0, TEXT_AID_MAX);
  } catch {
    // PDF scanné : pas de couche texte, la vision suffit.
  }
  if (!textAid) warnings.push("PDF sans couche texte : lecture visuelle seule (scan)");

  const user = [
    "Document : « " + name + " » (" + images.length + " page(s)).",
    textAid ? "Couche texte brute du document (peut être désordonnée) :" + "\n" + textAid : "Pas de couche texte : lis les pages images.",
    "Propose la structuration en JSON strict conformément au schéma.",
  ].join("\n");

  const reply = await aiChat({ system: systemPrompt(pictoKinds), user, images, json: true, maxTokens: 4000 }, db);
  const parsed = parseStructureProposal(reply, pictoKinds);
  return {
    steps: parsed.steps,
    warnings: [...warnings, ...parsed.warnings, "structure proposée par le moteur IA (" + status.model + ") : vérifiez l'ordre, les textes et les pictos avant publication"],
    reference: parsed.reference,
    title: parsed.title,
    description: parsed.description,
    todo: parsed.todo,
    step_numbers: parsed.numbers,
    ai_used: true,
  };
}
