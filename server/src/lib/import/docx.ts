import mammoth from "mammoth";
import { ImportError, STEP_RE, type ImportStep, type ParseResult } from "./types.js";

// C-101 (V8 #6, RF-78) : extraction docx via mammoth (convertToHtml avec
// images en data URI — HTML simple et prédictible : h1-h6, p, img).
// Structure : les titres (styles Heading) créent les étapes, les paragraphes
// et images suivants les remplissent ; un texte/image AVANT le premier titre
// devient une étape « Préambule ». Sans style de titre : regex Étape/Phase/Step
// sur les paragraphes ; sinon une seule étape avec tout le contenu.

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function innerText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).trim();
}

export async function parseDocx(buf: Buffer): Promise<ParseResult> {
  const { value: html } = await mammoth.convertToHtml(
    { buffer: buf },
    { convertImage: mammoth.images.dataUri }
  );
  const steps: ImportStep[] = [];
  const pre: ImportStep = { title: "Préambule", body: "", images: [] };
  let hasHeading = false;
  let cur: ImportStep | null = null;
  const current = (): ImportStep => (hasHeading && cur ? cur : pre);
  const blockRe =
    /<(h[1-6])>([\s\S]*?)<\/\1>|<p>([\s\S]*?)<\/p>|<img\b[^>]*src="data:image\/([\w.+-]+);base64,([^"]+)"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    if (m[1] !== undefined) {
      hasHeading = true;
      cur = { title: innerText(m[2]).slice(0, 200) || "Étape", body: "", images: [] };
      steps.push(cur);
    } else if (m[3] !== undefined) {
      // mammoth enveloppe les images dans un <p> : les extraire avant innerText.
      for (const im of m[3].matchAll(/<img\b[^>]*src="data:image\/([\w.+-]+);base64,([^"]+)"/g)) {
        current().images.push({ buffer: Buffer.from(im[2], "base64"), alt: "" });
      }
      const text = innerText(m[3]);
      if (!text) continue;
      const sm = STEP_RE.exec(text);
      if (!hasHeading && sm) {
        cur = { title: (sm[1] || "").trim().slice(0, 200) || "Étape", body: "", images: [] };
        steps.push(cur);
      } else {
        const c = current();
        c.body = (c.body ? c.body + "\n" : "") + text;
      }
    } else {
      current().images.push({ buffer: Buffer.from(m[5], "base64"), alt: "" });
    }
  }
  const all = (pre.body || pre.images.length ? [pre] : []).concat(steps);
  const cleaned = all
    .filter((s) => s.title || s.body || s.images.length)
    .map((s) => ({ ...s, body: s.body.trim().slice(0, 50000) }));
  if (!cleaned.length) {
    throw new ImportError("document docx sans contenu exploitable (ni titres, ni texte, ni images)");
  }
  return { steps: cleaned, warnings: [] };
}
