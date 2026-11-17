// C-101 (V8 #6, RF-78) — import de documents existants (docx, pdf, xlsx).
// Types partagés par les trois parseurs ; la route consomme ParseResult.
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export interface ImportImage {
  buffer: Buffer;
  alt: string;
}

export interface ImportStep {
  title: string;
  body: string;
  images: ImportImage[];
}

export interface ParseResult {
  steps: ImportStep[];
  warnings: string[];
}

// Détection d'étape dans le texte brut : « Étape 1 : … », « Phase 2 - … »,
// « Step 3. … ». Le groupe capture le titre après le préfixe.
export const STEP_RE = /^\s*(?:étape|etape|step|phase)\s*\d*\s*[:.\-–]?\s*(.*)$/i;
