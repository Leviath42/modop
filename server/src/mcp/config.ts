// Configuration du serveur MCP (C-90) : accès env + base URL loopback.
// L'env est la source de vérité (pattern seed.ts) — aucun secret en base.

export function mcpEnabled(): boolean {
  return Boolean(process.env.MODOP_MCP_TOKEN);
}

export function MODOP_MCP_TOKEN(): string {
  const v = process.env.MODOP_MCP_TOKEN;
  if (!v) throw new Error("MODOP_MCP_TOKEN absent : serveur MCP désactivé");
  return v;
}

export function MODOP_MCP_EMAIL(): string {
  const v = process.env.MODOP_MCP_EMAIL;
  if (!v) throw new Error("MODOP_MCP_EMAIL absent : serveur MCP désactivé");
  return v;
}

export function MODOP_MCP_PASSWORD(): string {
  const v = process.env.MODOP_MCP_PASSWORD;
  if (!v) throw new Error("MODOP_MCP_PASSWORD absent : serveur MCP désactivé");
  return v;
}

export function MODOP_MCP_ROLE(): string {
  return process.env.MODOP_MCP_ROLE || "author";
}

// Base URL loopback de l'API interne. Posée par index.ts après listen()
// (et par les tests après server.listen(0)).
let mcpBaseUrl = "http://127.0.0.1:3000";

export function setMcpBaseUrl(url: string): void {
  mcpBaseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getMcpBaseUrl(): string {
  return mcpBaseUrl;
}
