// Client HTTP loopback du serveur MCP : tous les outils MCP passent par
// l'API REST interne (127.0.0.1), session svc-mcp classique. Aucune
// logique métier dupliquée — validations, audit et rate limits de l'API
// s'appliquent par construction (C-90).
import { MODOP_MCP_EMAIL, MODOP_MCP_PASSWORD, getMcpBaseUrl } from "./config.js";

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

export class ModopClient {
  private cookie: string | null = null;

  /** POST /api/auth/login et capture du cookie de session. */
  async login(): Promise<void> {
    const res = await fetch(`${getMcpBaseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: MODOP_MCP_EMAIL(), password: MODOP_MCP_PASSWORD() }),
    });
    if (res.status !== 200) {
      const detail = await res.text().catch(() => "");
      throw new Error(`login svc-mcp échoué (HTTP ${res.status}) ${detail.slice(0, 200)}`);
    }
    const setCookies =
      typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const session = setCookies.find((c) => c.startsWith("modop_session="));
    if (!session) throw new Error("login svc-mcp : cookie modop_session absent");
    this.cookie = session.split(";")[0] ?? null;
  }

  /** Premier appel : ouvrir la session si besoin. */
  private async ensureSession(): Promise<void> {
    if (this.cookie === null) await this.login();
  }

  /**
   * Appel API avec re-login unique sur 401 (session expirée entre deux
   * appels d'outils). Les erreurs ne remontent pas en exception : le
   * statut et le corps sont laissés à l'outil pour un message utile.
   */
  async call(method: string, path: string, body?: unknown): Promise<ApiResult> {
    await this.ensureSession();
    const doFetch = async (): Promise<Response> =>
      fetch(`${getMcpBaseUrl()}${path}`, {
        method,
        headers: {
          ...(this.cookie ? { cookie: this.cookie } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    let res = await doFetch();
    if (res.status === 401 && this.cookie !== null) {
      await this.login();
      res = await doFetch();
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = (await res.json()) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    return { status: res.status, body: parsed };
  }

  /**
   * Upload multipart d'une photo (FormData/Blob natifs Node 22).
   * binary : Buffer brut (magic numbers déjà contrôlés côté API).
   */
  async callUpload(path: string, filename: string, binary: Buffer, alt?: string, imageDescription?: string): Promise<ApiResult> {
    await this.ensureSession();
    const doFetch = async (): Promise<Response> => {
      const form = new FormData();
      const ext = filename.toLowerCase().split(".").pop() ?? "";
      const mime =
        ext === ".png" || ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg";
      form.append("file", new Blob([new Uint8Array(binary)], { type: mime }), filename);
      if (alt !== undefined) form.append("alt", alt);
      if (imageDescription !== undefined) form.append("image_description", imageDescription);
      return fetch(`${getMcpBaseUrl()}${path}`, {
        method: "POST",
        headers: this.cookie ? { cookie: this.cookie } : {},
        body: form,
      });
    };
    let res = await doFetch();
    if (res.status === 401 && this.cookie !== null) {
      await this.login();
      res = await doFetch();
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = (await res.json()) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    return { status: res.status, body: parsed };
  }

  /**
   * Appel attendant un corps binaire (export docx). Re-login sur 401
   * comme call(). Renvoie null si la réponse n'est pas binaire.
   */
  async callBinary(
    method: string,
    path: string,
  ): Promise<{ status: number; binary: Buffer | null; contentType: string; filename: string | null }> {
    await this.ensureSession();
    const doFetch = async (): Promise<Response> =>
      fetch(`${getMcpBaseUrl()}${path}`, {
        method,
        headers: this.cookie ? { cookie: this.cookie } : {},
      });
    let res = await doFetch();
    if (res.status === 401 && this.cookie !== null) {
      await this.login();
      res = await doFetch();
    }
    const disposition = res.headers.get("content-disposition");
    const match = disposition ? /filename="?([^"]+)"?/.exec(disposition) : null;
    const ctype = res.headers.get("content-type") ?? "";
    const isBinary = ctype.includes("octet-stream") || ctype.includes("vnd.openxmlformats") || ctype.includes("zip");
    if (!isBinary) {
      return { status: res.status, binary: null, contentType: ctype, filename: match?.[1] ?? null };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, binary: buf, contentType: "application/octet-stream", filename: match?.[1] ?? null };
  }

  /**
   * C-105 (V13 #6) : appel attendant un corps texte (export Markdown).
   * Re-login sur 401 comme call(). Renvoie null si non textuel.
   */
  async callText(method: string, path: string): Promise<{ status: number; text: string | null; contentType: string }> {
    await this.ensureSession();
    const doFetch = async (): Promise<Response> =>
      fetch(`${getMcpBaseUrl()}${path}`, {
        method,
        headers: this.cookie ? { cookie: this.cookie } : {},
      });
    let res = await doFetch();
    if (res.status === 401 && this.cookie !== null) {
      await this.login();
      res = await doFetch();
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/")) {
      return { status: res.status, text: null, contentType: ctype };
    }
    return { status: res.status, text: await res.text(), contentType: ctype };
  }
}
