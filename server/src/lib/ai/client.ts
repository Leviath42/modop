import { AiError } from "./error.js";
export { AiError } from "./error.js";

// C-108 (V14 #1) — socle moteur IA : client HTTP compatible OpenAI
// (chat/completions), sans SDK (fetch natif — même logique supply-chain que
// le lecteur xlsx maison). Point d'entrée UNIQUE pour tout appel IA serveur.
// Couvre Mistral AI, OpenAI, Ollama, vLLM, LM Studio… via MODOP_AI_BASE_URL.
// La clé vit dans l'environnement : jamais en base, jamais en log, jamais
// renvoyée par l'API (seul le booléen key_set est exposé).

export interface AiStatus {
  configured: boolean;
  base_url: string;
  model: string;
  key_set: boolean;
  timeout_ms: number;
}

interface AiEnv {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export function readAiEnv(): AiEnv {
  return {
    baseUrl: (process.env.MODOP_AI_BASE_URL ?? "").trim().replace(/\/+$/, ""),
    apiKey: (process.env.MODOP_AI_API_KEY ?? "").trim(),
    model: (process.env.MODOP_AI_MODEL ?? "").trim(),
    timeoutMs: Math.max(5000, Number(process.env.MODOP_AI_TIMEOUT_MS ?? 90000) || 90000),
  };
}

export function aiStatus(): AiStatus {
  const e = readAiEnv();
  return {
    configured: Boolean(e.baseUrl && e.model),
    base_url: e.baseUrl,
    model: e.model,
    key_set: e.apiKey.length > 0,
    timeout_ms: e.timeoutMs,
  };
}

// Vision OpenAI-compatible : images passées en data URI base64.
export interface AiChatOptions {
  system: string;
  user: string;
  images?: Buffer[];
  json?: boolean;
  maxTokens?: number;
}

export async function aiChat(o: AiChatOptions): Promise<string> {
  const e = readAiEnv();
  if (!e.baseUrl || !e.model) {
    throw new AiError("moteur IA non configuré — renseignez MODOP_AI_BASE_URL et MODOP_AI_MODEL", 422);
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
  const timer = setTimeout(() => ctrl.abort(), e.timeoutMs);
  let res: Response;
  try {
    res = await fetch(e.baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(e.apiKey ? { authorization: "Bearer " + e.apiKey } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "?";
    if ((err as Error)?.name === "AbortError") {
      throw new AiError("moteur IA trop lent (timeout " + Math.round(e.timeoutMs / 1000) + " s)", 504);
    }
    throw new AiError("moteur IA injoignable : " + msg, 504);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // Pas de corps brut en erreur : il peut échoïner la requête (images).
    throw new AiError("moteur IA : HTTP " + res.status, res.status === 401 || res.status === 403 ? 502 : 502);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const out = data.choices?.[0]?.message?.content;
  if (!out || !out.trim()) throw new AiError("réponse du moteur IA vide");
  return out;
}
