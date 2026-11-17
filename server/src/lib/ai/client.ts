import type Database from "better-sqlite3";
import { AiError } from "./error.js";
export { AiError } from "./error.js";

// C-108 (V14 #1) — socle moteur IA : client HTTP compatible OpenAI
// (chat/completions), sans SDK (fetch natif). Point d'entrée UNIQUE pour tout
// appel IA serveur : Mistral AI, OpenAI, Ollama, vLLM, LM Studio…
//
// C-110 (V14 #3) : la configuration vit dans la table settings (clé
// « ai_engine »), éditable depuis la page Paramètres (admin) avec un toggle
// « activé » qui verrouille l'option SANS retirer la config. L'environnement
// (MODOP_AI_*) reste le repli quand rien n'est en base. La clé n'est jamais
// renvoyée par l'API (seul le booléen key_set), jamais loguée.

export const DEFAULT_AI_TIMEOUT_MS = 90000;
const SETTINGS_KEY = "ai_engine";

export interface AiEngineConfig {
  enabled: boolean;
  base_url: string;
  model: string;
  api_key: string;
  timeout_ms: number;
}

export interface AiStatus {
  configured: boolean;
  enabled: boolean;
  base_url: string;
  model: string;
  key_set: boolean;
  timeout_ms: number;
}

function envConfig(): AiEngineConfig {
  const base_url = (process.env.MODOP_AI_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const model = (process.env.MODOP_AI_MODEL ?? "").trim();
  return {
    enabled: Boolean(base_url && model),
    base_url,
    model,
    api_key: (process.env.MODOP_AI_API_KEY ?? "").trim(),
    timeout_ms: Math.max(5000, Number(process.env.MODOP_AI_TIMEOUT_MS ?? DEFAULT_AI_TIMEOUT_MS) || DEFAULT_AI_TIMEOUT_MS),
  };
}

// Settings en base si présents (PRIMAIRES, y compris enabled=false — le toggle
// verrouille sans retirer la config), sinon repli env.
export function readAiConfig(db: Database.Database): AiEngineConfig {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as { value: string } | undefined;
  if (!row) return envConfig();
  try {
    const s = JSON.parse(row.value) as Partial<AiEngineConfig>;
    const base_url = typeof s.base_url === "string" ? s.base_url.trim().replace(/\/+$/, "").slice(0, 500) : "";
    const model = typeof s.model === "string" ? s.model.trim().slice(0, 200) : "";
    return {
      enabled: s.enabled === true,
      base_url,
      model,
      api_key: typeof s.api_key === "string" ? s.api_key.slice(0, 500) : "",
      timeout_ms:
        typeof s.timeout_ms === "number" && s.timeout_ms >= 5000 && s.timeout_ms <= 600000
          ? Math.round(s.timeout_ms)
          : DEFAULT_AI_TIMEOUT_MS,
    };
  } catch {
    return envConfig();
  }
}

export function aiStatus(db: Database.Database): AiStatus {
  const e = readAiConfig(db);
  return {
    configured: e.enabled && Boolean(e.base_url && e.model),
    enabled: e.enabled,
    base_url: e.base_url,
    model: e.model,
    key_set: e.api_key.length > 0,
    timeout_ms: e.timeout_ms,
  };
}

// C-116 — diagnostic « Tester la connexion » en 2 étapes : 1) GET /models
// teste la joignabilité ET la clé sans consommer de tokens (401/403 = clé
// refusée, message immédiat) ; un moteur sans /models ou non-JSON n'est pas
// disqualifié. Si le catalogue est lisible et que le modèle configuré en
// est absent, erreur actionnable AVANT tout appel de tokens (vécu :
// pixtral-large-latest retiré du catalogue Mistral, affiché en 502 muet).
// 2) ping réel « réponds OK » (comportement inchangé).
export interface AiTestCheck {
  step: string;
  ok: boolean;
  note: string;
}
export interface AiTestOutcome {
  ok: boolean;
  latency_ms: number;
  reply: string;
  checks: AiTestCheck[];
}

// Catalogue du moteur : liste d'identifiants si lisible, "unauthorized" si
// 401/403, null si route absente ou réponse non-JSON (on ne disqualifie pas
// les moteurs compatibles OpenAI sans /models).
async function fetchCatalog(e: AiEngineConfig): Promise<string[] | "unauthorized" | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(e.base_url + "/models", {
      headers: e.api_key ? { authorization: "Bearer " + e.api_key } : {},
      signal: ctrl.signal,
    });
    if (r.status === 401 || r.status === 403) {
      await r.text(); // C-116 : drainer le corps — une socket keep-alive non drainée corrompt le pool undici (la requête suivante pend jusqu au timeout)
      return "unauthorized";
    }
    if (!r.ok) {
      await r.text(); // drainer avant de rendre la socket au pool
      return null;
    }
    const j = (await r.json()) as { data?: { id?: unknown }[] };
    if (!Array.isArray(j.data)) return null;
    return j.data.map((m) => (typeof m?.id === "string" ? m.id : "")).filter(Boolean);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function aiTestConnection(db: Database.Database): Promise<AiTestOutcome> {
  const e = readAiConfig(db);
  const checks: AiTestCheck[] = [];
  const t0 = Date.now();
  const catalog = await fetchCatalog(e);
  if (catalog === "unauthorized") {
    throw new AiError("clé API refusée par le moteur (HTTP 401) — vérifiez la clé", 502);
  }
  if (Array.isArray(catalog)) {
    if (!e.model || !catalog.includes(e.model)) {
      throw new AiError("modèle « " + e.model + " » absent du catalogue du moteur (" + catalog.length + " modèles) — vérifiez le nom du modèle", 422);
    }
    checks.push({ step: "catalog", ok: true, note: "modèle présent au catalogue" });
  } else {
    checks.push({ step: "catalog", ok: true, note: "catalogue non lisible (/models absent), ignoré" });
  }
  const reply = (await aiChat({ system: "Réponds exactement OK, rien d'autre.", user: "ping" }, db)).trim();
  const ok = /^ok\b/i.test(reply);
  return { ok, latency_ms: Date.now() - t0, reply: reply.slice(0, 100), checks };
}
// Vision OpenAI-compatible : images passées en data URI base64.
export interface AiChatOptions {
  system: string;
  user: string;
  images?: Buffer[];
  json?: boolean;
  maxTokens?: number;
}

export async function aiChat(o: AiChatOptions, db: Database.Database): Promise<string> {
  const e = readAiConfig(db);
  if (!e.enabled || !e.base_url || !e.model) {
    throw new AiError("moteur IA non activé — configurez-le dans Paramètres (ou MODOP_AI_* côté serveur)", 422);
  }
  const content: unknown[] = [{ type: "text", text: o.user }];
  for (const b of o.images ?? []) {
    const isPng = b.length > 8 && b[0] === 0x89 && b[1] === 0x50;
    content.push({
      type: "image_url",
      image_url: { url: "data:image/" + (isPng ? "png" : "jpeg") + ";base64," + b.toString("base64") },
    });
  }
  const body: Record<string, unknown> = {
    model: e.model,
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.images?.length ? content : o.user },
    ],
  };
  if (o.maxTokens) body.max_tokens = o.maxTokens;
  if (o.json) body.response_format = { type: "json_object" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), e.timeout_ms);
  let res: Response;
  try {
    res = await fetch(e.base_url + "/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(e.api_key ? { authorization: "Bearer " + e.api_key } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "?";
    if ((err as Error)?.name === "AbortError") {
      throw new AiError("moteur IA trop lent (timeout " + Math.round(e.timeout_ms / 1000) + " s)", 504);
    }
    throw new AiError("moteur IA injoignable : " + msg, 504);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // C-116 : extraire le MESSAGE du moteur (JSON), jamais le corps brut
    // (il peut échoïer la requête, images incluses) ; puis guider le
    // diagnostic : 401/403 = clé refusée, 404 = URL de base, sinon le
    // message moteur (vécu : « Invalid model » affiché en 502 muet).
    let detail = "";
    try {
      const j = (await res.json()) as { message?: unknown; error?: { message?: unknown } };
      const raw = typeof j.message === "string" ? j.message : typeof j.error?.message === "string" ? j.error.message : "";
      detail = raw.replace(/\s+/g, " ").trim().slice(0, 200);
    } catch {
      // corps non JSON : pas de détail disponible
    }
    const hint =
      res.status === 401 || res.status === 403
        ? " — clé API refusée par le moteur ?"
        : res.status === 404
          ? " — route inconnue : URL de base invalide ?"
          : detail
            ? " — " + detail
            : "";
    throw new AiError("moteur IA : HTTP " + res.status + hint, 502);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const out = data.choices?.[0]?.message?.content;
  if (!out || !out.trim()) throw new AiError("réponse du moteur IA vide");
  return out;
}
