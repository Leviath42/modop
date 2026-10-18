import crypto from "node:crypto";

// Client OIDC générique — fonctionne avec tout fournisseur respectant
// OpenID Connect Discovery (Entra ID, Keycloak, Google, Okta...).
// Configuration par variables d'environnement (aucun fournisseur codé en dur) :
//   MODOP_OIDC_ISSUER     : URL de base de l'émetteur (ex. https://sso.entreprise.fr)
//   MODOP_OIDC_CLIENT_ID  : client_id enregistré chez l'émetteur
//   MODOP_OIDC_CLIENT_SECRET : si le client est confidentiel (sinon PKCE public)
//   MODOP_OIDC_REDIRECT   : URL de callback de Modop (ex. https://modop.entreprise.fr/api/auth/oidc/callback)
//   MODOP_OIDC_ROLE_CLAIM : claim contenant les groupes (défaut : modop_role)
//   MODOP_OIDC_ADMIN_GROUP / AUTHOR_GROUP : valeurs du claim → rôles

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  roleClaim: string;
  adminGroup: string;
  authorGroup: string;
}

export function getOidcConfig(): OidcConfig | null {
  const issuer = process.env.MODOP_OIDC_ISSUER;
  const clientId = process.env.MODOP_OIDC_CLIENT_ID;
  const redirectUri = process.env.MODOP_OIDC_REDIRECT;
  if (!issuer || !clientId || !redirectUri) return null;
  return {
    issuer: issuer.replace(/\/+$/, ""),
    clientId,
    clientSecret: process.env.MODOP_OIDC_CLIENT_SECRET,
    redirectUri,
    roleClaim: process.env.MODOP_OIDC_ROLE_CLAIM ?? "modop_role",
    adminGroup: process.env.MODOP_OIDC_ADMIN_GROUP ?? "modop-admin",
    authorGroup: process.env.MODOP_OIDC_AUTHOR_GROUP ?? "modop-author",
  };
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
}

let discoveryCache: { doc: Discovery; expiresAt: number } | null = null;

export async function discover(issuer: string): Promise<Discovery> {
  if (discoveryCache && Date.now() < discoveryCache.expiresAt) {
    return discoveryCache.doc;
  }
  const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`discovery OIDC impossible : HTTP ${res.status}`);
  }
  const doc = (await res.json()) as Discovery;
  discoveryCache = { doc, expiresAt: Date.now() + 3600_000 };
  return doc;
}

export function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function makePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

// État anti-CSRF : signé HMAC avec un secret de session en mémoire.
const STATE_SECRET = crypto.randomBytes(32);
export function makeState(): string {
  const nonce = base64url(crypto.randomBytes(16));
  const sig = base64url(crypto.createHmac("sha256", STATE_SECRET).update(nonce).digest());
  return `${nonce}.${sig}`;
}

export function verifyState(state: string | undefined): boolean {
  if (!state || !state.includes(".")) return false;
  const [nonce, sig] = state.split(".");
  const expected = base64url(crypto.createHmac("sha256", STATE_SECRET).update(nonce).digest());
  return sig === expected;
}

export type Role = "reader" | "author" | "admin";

// Mapping groupes SSO → rôle Modop (le plus élevé l'emporte).
export function roleFromClaims(claims: Record<string, unknown>, cfg: OidcConfig): Role {
  const raw = claims[cfg.roleClaim];
  const groups = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? [raw] : [];
  if (groups.includes(cfg.adminGroup)) return "admin";
  if (groups.includes(cfg.authorGroup)) return "author";
  return "reader";
}

export interface TokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in?: number;
}

export async function exchangeCode(
  cfg: OidcConfig,
  code: string,
  verifier: string
): Promise<TokenResponse> {
  const doc = await discover(cfg.issuer);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`échange de code OIDC : HTTP ${res.status}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function fetchUserInfo(
  cfg: OidcConfig,
  accessToken: string
): Promise<{ email: string; claims: Record<string, unknown> }> {
  const doc = await discover(cfg.issuer);
  if (!doc.userinfo_endpoint) {
    throw new Error("le fournisseur OIDC n'expose pas userinfo_endpoint");
  }
  const res = await fetch(doc.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`userinfo OIDC : HTTP ${res.status}`);
  }
  const claims = (await res.json()) as Record<string, unknown>;
  const email = String(claims.email ?? claims.preferred_username ?? "");
  if (!email) throw new Error("le fournisseur OIDC n'a pas renvoyé d'email");
  return { email: email.toLowerCase(), claims };
}
