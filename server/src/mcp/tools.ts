// Outils MCP de modop (C-90). Chaque outil appelle l'API REST interne via
// ModopClient : les validations de l'API (C-88, magic numbers, rate
// limits, audit) s'appliquent donc à l'identique. Une réponse API en
// erreur devient une erreur d'outil MCP avec le message du serveur.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ModopClient, type ApiResult } from "./modop-client.js";

interface ToolResult {
  // Index signature exigée par le type de retour du SDK.
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
}

/** Réponse API → contenu texte JSON pour l'agent. */
function asText(body: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}

/** Appel API attendu OK ; sinon lève une erreur explicite pour l'agent. */
async function expectOk(
  client: ModopClient,
  ok: number[],
  action: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ToolResult> {
  const res = await client.call(method, path, body);
  if (!ok.includes(res.status)) throw new Error(apiError(action, res));
  return asText(res.body);
}

function apiError(action: string, res: ApiResult): string {
  const message =
    typeof res.body.message === "string" ? res.body.message : JSON.stringify(res.body).slice(0, 300);
  return `modop : ${action} a échoué (HTTP ${res.status}) — ${message}`;
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function registerModopTools(server: McpServer, client: ModopClient): void {
  // ---- Session ----
  server.registerTool(
    "whoami",
    {
      description: "Identité du compte de service MCP (rôle, nom, email).",
      inputSchema: {},
    },
    async () => await expectOk(client, [200], "whoami", "GET", "/api/auth/me"),
  );

  // ---- Modes opératoires ----
  server.registerTool(
    "list_workflows",
    {
      description:
        "Rechercher des modes opératoires. Filtres : texte (titre, référence, étapes), catégorie, famille, état (draft|published), revues en retard (review=overdue), référence exacte, tri (updated_at|title|reference|category|review_due).",
      inputSchema: {
        search: z.string().optional().describe("texte recherché (titre, référence, étapes)"),
        category: z.string().optional(),
        family: z.string().optional(),
        state: z.enum(["draft", "published"]).optional(),
        review: z.enum(["overdue"]).optional().describe("revues en retard"),
        reference: z.string().optional().describe("référence exacte (insensible à la casse)"),
        sort: z.enum(["updated_at", "title", "reference", "category", "review_due"]).optional(),
      },
    },
    async (args) =>
      await expectOk(
        client,
        [200],
        "recherche de modes opératoires",
        "GET",
        `/api/workflows${qs(args as Record<string, string | undefined>)}`,
      ),
  );

  server.registerTool(
    "get_workflow",
    {
      description: "Détail complet d'un mode opératoire (métadonnées, étapes, photos).",
      inputSchema: { id: z.number().int().describe("identifiant du mode opératoire") },
    },
    async (args) => await expectOk(client, [200], "lecture du mode opératoire", "GET", `/api/workflows/${args.id}`),
  );

  server.registerTool(
    "create_workflow",
    {
      description: "Créer un mode opératoire (brouillon). title et reference sont requis.",
      inputSchema: {
        title: z.string().min(1),
        reference: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        family: z.string().optional(),
        review_due: z.string().regex(isoDate).optional().describe("date de prochaine revue (AAAA-MM-JJ)"),
        owner_email: z.string().email().optional().describe("responsable"),
      },
    },
    async (args) => await expectOk(client, [201], "création du mode opératoire", "POST", "/api/workflows", args),
  );

  server.registerTool(
    "update_workflow",
    {
      description: "Modifier les métadonnées d'un mode opératoire (champs fournis uniquement).",
      inputSchema: {
        id: z.number().int(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        family: z.string().optional(),
        review_due: z
          .union([z.string().regex(isoDate), z.literal("")])
          .optional()
          .describe("AAAA-MM-JJ, ou chaîne vide pour effacer"),
        owner_email: z
          .union([z.string().email(), z.literal("")])
          .optional()
          .describe("responsable, ou chaîne vide pour effacer"),
      },
    },
    async (args) => {
      const { id, ...body } = args;
      return await expectOk(client, [200], "mise à jour du mode opératoire", "PUT", `/api/workflows/${id}`, body);
    },
  );

  server.registerTool(
    "delete_workflow",
    {
      description: "Supprimer un mode opératoire et ses étapes. Irréversible.",
      inputSchema: { id: z.number().int() },
    },
    async (args) =>
      await expectOk(client, [204, 200], "suppression du mode opératoire", "DELETE", `/api/workflows/${args.id}`),
  );

  server.registerTool(
    "duplicate_workflow",
    {
      description: "Dupliquer un mode opératoire (nouveau brouillon).",
      inputSchema: { id: z.number().int() },
    },
    async (args) => await expectOk(client, [201], "duplication du mode opératoire", "POST", `/api/workflows/${args.id}/duplicate`),
  );

  // ---- Publication / versions ----
  server.registerTool(
    "publish_workflow",
    {
      description:
        "Publier un mode opératoire (fige une version visible par les lecteurs). changelog recommandé.",
      inputSchema: {
        id: z.number().int(),
        changelog: z.string().optional().describe("résumé des changements de la version"),
      },
    },
    async (args) => {
      const { id, changelog } = args;
      return await expectOk(
        client,
        [200, 201],
        "publication",
        "POST",
        `/api/workflows/${id}/publish`,
        changelog ? { changelog } : undefined,
      );
    },
  );

  server.registerTool(
    "list_versions",
    {
      description: "Lister les versions publiées d'un mode opératoire.",
      inputSchema: { id: z.number().int() },
    },
    async (args) => await expectOk(client, [200], "liste des versions", "GET", `/api/workflows/${args.id}/versions`),
  );

  server.registerTool(
    "get_version",
    {
      description: "Contenu complet d'une version publiée (métadonnées + étapes).",
      inputSchema: { id: z.number().int(), number: z.number().int().describe("numéro de version") },
    },
    async (args) =>
      await expectOk(client, [200], "lecture de la version", "GET", `/api/workflows/${args.id}/versions/${args.number}`),
  );

  server.registerTool(
    "restore_version",
    {
      description: "Restaurer une version publiée comme brouillon de travail (nouvelle révision).",
      inputSchema: { id: z.number().int(), number: z.number().int() },
    },
    async (args) =>
      await expectOk(
        client,
        [200, 201],
        "restauration de la version",
        "POST",
        `/api/workflows/${args.id}/versions/${args.number}/restore`,
      ),
  );

  // ---- Étapes ----
  server.registerTool(
    "create_step",
    {
      description: "Ajouter une étape en fin de mode opératoire.",
      inputSchema: {
        workflow_id: z.number().int(),
        title: z.string().min(1),
        body: z.string().optional().describe("texte de l'étape"),
      },
    },
    async (args) => {
      const { workflow_id, ...body } = args;
      return await expectOk(client, [201], "création de l'étape", "POST", `/api/workflows/${workflow_id}/steps`, body);
    },
  );

  server.registerTool(
    "update_step",
    {
      description: "Modifier une étape (champs fournis uniquement).",
      inputSchema: {
        step_id: z.number().int(),
        title: z.string().min(1).optional(),
        body: z.string().optional(),
        pictos: z.array(z.string()).optional().describe("pictogrammes de l'étape"),
      },
    },
    async (args) => {
      const { step_id, ...body } = args;
      return await expectOk(client, [200], "mise à jour de l'étape", "PUT", `/api/steps/${step_id}`, body);
    },
  );

  server.registerTool(
    "delete_step",
    {
      description: "Supprimer une étape.",
      inputSchema: { step_id: z.number().int() },
    },
    async (args) => await expectOk(client, [204, 200], "suppression de l'étape", "DELETE", `/api/steps/${args.step_id}`),
  );

  server.registerTool(
    "reorder_steps",
    {
      description:
        "Réordonner toutes les étapes d'un mode opératoire (liste complète et exacte des identifiants).",
      inputSchema: {
        workflow_id: z.number().int(),
        ordered_ids: z
          .array(z.number().int())
          .describe("identifiants des étapes dans le nouvel ordre (tous, sans doublon)"),
      },
    },
    async (args) => {
      const { workflow_id, ordered_ids } = args;
      return await expectOk(client, [200], "réordonnancement des étapes", "PUT", `/api/workflows/${workflow_id}/steps/reorder`, {
        orderedIds: ordered_ids,
      });
    },
  );

  // ---- Photos ----
  server.registerTool(
    "upload_photo",
    {
      description:
        "Attacher une photo à une étape. Contenu en base64 ; JPEG, PNG ou WebP (15 Mo max, type réel vérifié).",
      inputSchema: {
        step_id: z.number().int(),
        filename: z.string().min(1).describe("nom de fichier avec extension (.jpg/.png/.webp)"),
        content_base64: z.string().min(1).describe("contenu binaire de l'image encodé en base64"),
        alt: z.string().optional().describe("texte alternatif"),
      },
    },
    async (args) => {
      const res = await client.callUpload(
        `/api/steps/${args.step_id}/photos`,
        args.filename,
        Buffer.from(args.content_base64, "base64"),
        args.alt,
      );
      if (res.status !== 201) throw new Error(apiError("téléversement de la photo", res));
      return asText(res.body);
    },
  );

  server.registerTool(
    "delete_photo",
    {
      description: "Supprimer une photo.",
      inputSchema: { photo_id: z.number().int() },
    },
    async (args) => await expectOk(client, [204, 200], "suppression de la photo", "DELETE", `/api/photos/${args.photo_id}`),
  );

  server.registerTool(
    "annotate_photo",
    {
      description: "Remplacer les annotations d'une photo (formes du canevas, coordonnées relatives 0-1, 500 max).",
      inputSchema: {
        photo_id: z.number().int(),
        annotations: z.array(z.record(z.string(), z.unknown())).describe("formes d'annotation (JSON du canevas)"),
      },
    },
    async (args) => {
      const { photo_id, annotations } = args;
      return await expectOk(client, [200], "annotation de la photo", "PUT", `/api/photos/${photo_id}/annotations`, {
        annotations,
      });
    },
  );

  // ---- Export ----
  server.registerTool(
    "export_docx",
    {
      description:
        "Exporter un mode opératoire en document Word (.docx). Renvoie le binaire en base64 — signature PK attendue en tête (UEsDB…).",
      inputSchema: {
        workflow_id: z.number().int(),
        version: z.number().int().optional().describe("numéro de version (dernière publiée par défaut)"),
      },
    },
    async (args) => {
      const query = args.version !== undefined ? `?version=${args.version}` : "";
      const res = await client.callBinary("GET", `/api/workflows/${args.workflow_id}/export${query}`);
      if (res.binary === null || res.status !== 200) {
        throw new Error(`modop : export docx a échoué (HTTP ${res.status})`);
      }
      if (res.binary.subarray(0, 2).toString("ascii") !== "PK") {
        throw new Error("modop : export docx invalide (signature PK absente)");
      }
      return asText({ filename: res.filename, size: res.binary.length, content_base64: res.binary.toString("base64") });
    },
  );

  // ---- Retours terrain ----
  server.registerTool(
    "send_feedback",
    {
      description: "Signaler un problème sur une étape (retour terrain, non réservé aux auteurs).",
      inputSchema: {
        workflow_id: z.number().int(),
        step_id: z.number().int(),
        message: z.string().min(1),
      },
    },
    async (args) => {
      const { workflow_id, ...body } = args;
      return await expectOk(client, [201], "envoi du retour terrain", "POST", `/api/workflows/${workflow_id}/feedback`, body);
    },
  );

  server.registerTool(
    "list_feedbacks",
    {
      description: "Lister les retours terrain d'un mode opératoire.",
      inputSchema: { workflow_id: z.number().int() },
    },
    async (args) =>
      await expectOk(client, [200], "liste des retours terrain", "GET", `/api/workflows/${args.workflow_id}/feedback`),
  );

  server.registerTool(
    "resolve_feedback",
    {
      description: "Marquer un retour terrain comme résolu.",
      inputSchema: { workflow_id: z.number().int(), feedback_id: z.number().int() },
    },
    async (args) =>
      await expectOk(
        client,
        [200],
        "résolution du retour terrain",
        "PUT",
        `/api/workflows/${args.workflow_id}/feedback/${args.feedback_id}/resolve`,
      ),
  );

  // ---- Comptes / stats ----
  server.registerTool(
    "list_users",
    {
      description: "Lister les comptes actifs (id, email, nom, rôle) — utile pour renseigner owner_email.",
      inputSchema: {},
    },
    async () => await expectOk(client, [200], "liste des comptes", "GET", "/api/users"),
  );

  server.registerTool(
    "get_stats",
    {
      description:
        "Statistiques globales (comptes, workflows, publications, retours). Nécessite le rôle admin — erreur 403 sinon.",
      inputSchema: {},
    },
    async () => await expectOk(client, [200], "statistiques", "GET", "/api/stats"),
  );
}
