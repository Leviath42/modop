// C-101 (V8 #6, RF-78) — import de documents existants (docx, pdf, xlsx).
// Types partagés par les parseurs ; la route consomme ParseResult.
// C-109 (V14 #2) : champs optionnels pour l'étage IA — pictos (indications
// métiers posées d'office), reference/title/description détectés, todo
// (points à compléter → commentaires d'auteurs), ai_used (marqueur).
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
  pictos?: string[];
}

export interface ImportTodo {
  step: number | null;
  question: string;
}

export interface ParseResult {
  steps: ImportStep[];
  warnings: string[];
  reference?: string;
  title?: string;
  description?: string;
  todo?: ImportTodo[];
  // C-109 : numéros d'étape de la SOURCE, alignés sur steps (après tri) —
  // utilisés par la route pour cibler les commentaires « à compléter ».
  step_numbers?: number[];
  ai_used?: boolean;
}

// Détection d'étape dans le texte brut : « Étape 1 : … », « Phase 2 - … »,
// « Step 3. … ». Le groupe capture le titre après le préfixe.
export const STEP_RE = /^\s*(?:étape|etape|step|phase)\s*\d*\s*[:.\-–]?\s*(.*)$/i;
