export interface User {
  id: number;
  email: string;
  role: "reader" | "author" | "admin";
  first_name?: string;
  last_name?: string;
}

export interface Workflow {
  id: number;
  title: string;
  reference: string;
  description: string;
  category: string;
  family: string;
  state: "draft" | "published";
  current_version: number;
  review_due?: string | null;
  owner_email?: string;
  // C-94 : rattachement arborescent + document parent.
  category_id?: number | null;
  parent_id?: number | null;
  updated_at: string;
  // V16 : statut éditorial (V8 #2), distinct de l'état publié.
  editorial_status?: "draft" | "in_review" | "validated" | "obsolete";
  editorial_status_at?: string | null;
}

// C-94 : nœud de l'arborescence documentaire (1 à X niveaux).
export interface Category {
  id: number;
  parent_id: number | null; // null = racine
  name: string;             // titre libre (renommable)
  slug: string;              // immuable — chemins stables
  position: number;
}

export interface StepComment {
  id: number;
  by: string;
  message: string;
  at: string;
}
// V17 : statut éditorial (boucle brouillon → relecture → validé) et fil de
// relecture au niveau du MO.
export type EditorialStatus = "draft" | "in_review" | "validated" | "obsolete";
export interface ReviewComment {
  id: number;
  by: string;
  message: string;
  at: string;
}


export interface Photo {
  id: number;
  step_id?: number;
  filename: string;
  alt: string;
  image_description?: string;
  annotations?: unknown[];
  display_size?: "small" | "medium" | "large" | "full";
  display_align?: "left" | "center" | "right";
  display_x?: number | null;
  display_y?: number | null;
  display_w?: number | null;
}

export interface Shape {
  type: "arrow" | "rect" | "text";
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
  w?: number;
  h?: number;
  text?: string;
  color: string;
}

export interface Picto {
  kind: string;
  label: string;
  color: string;
}

export interface Step {
  id: number;
  workflow_id: number;
  position: number;
  title: string;
  body: string;
  pictos: Picto[];
  photos: Photo[];
  canvas?: Shape[];
}

export interface AdminUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: "reader" | "author" | "admin";
  active: number;
  auth_provider: string;
  created_at: string;
}

export interface WorkflowDetail extends Workflow {
  steps: Step[];
  // C-84 : nom lisible du responsable (Prénom Nom) quand le compte existe —
  // porté par le workflow (brouillon) ou par le snapshot (version publiée).
  owner_name?: string;
}

// C-72 (#4/#5) + C-86 : paramètres applicatifs (page Paramètres, admin).
// C-97 (V12 #8) : indication métier paramétrable (flyout « Indications »).
export interface Indication {
  kind: string;
  label: string;
  color: string;
}

export interface AppSettings {
  readers_see_drafts: boolean;
  no_review_date_is_overdue: boolean;
  default_stroke_width: number;
  // C-86 : délai de revue par défaut en jours (préremplissage « À revoir le »).
  default_review_days: number;
  // V17 (B2) : exiger un statut éditorial « validé » avant publication.
  require_validated: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = "error";
    let message = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      code = body.error ?? code;
      message = body.message ?? message;
    } catch {
      /* réponse non JSON */
    }
    throw new ApiError(res.status, code, message);
  }
  // C-111 : 204 (ou corps vide) → rien à parser. REX C-107 : la suppression
  // réussissait côté serveur mais le front affichait « Suppression impossible ».
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    return undefined as T; // corps vide : rien à parser (C-111)
  }
}

// C-101 (V8 #6, RF-78) : réponse de POST /api/import/document.
export interface ImportResult {
  workflow: Workflow;
  steps_created: number;
  photos_created: number;
  warnings: string[];
  ai_used?: boolean; // C-109 : structure proposée par le moteur IA
}

// C-108 (V14 #1) : état du moteur IA (author+) — JAMAIS la clé, juste key_set.
export interface AiStatus {
  configured: boolean;
  enabled: boolean; // C-110 : toggle — false verrouille l'option sans retirer la config
  base_url: string;
  model: string;
  key_set: boolean;
  timeout_ms: number;
}
export interface AiTestResult {
  checks: { step: string; ok: boolean; note: string }[];
  ok: boolean;
  latency_ms: number;
  reply: string;
}

export const api = {
  async login(email: string, password: string): Promise<User> {
    return handle<User>(
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
    );
  },
  async logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
  },
  async me(): Promise<User> {
    return handle<User>(await fetch("/api/auth/me"));
  },
  async listWorkflows(params: { search?: string; category?: string; state?: string; family?: string; review?: string; sort?: string; reference?: string; parent?: string; category_id?: string; editorial_status?: string } = {}): Promise<Workflow[]> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return handle<Workflow[]>(await fetch(`/api/workflows?${q}`));
  },
  async getWorkflow(id: number | string): Promise<WorkflowDetail> {
    return handle<WorkflowDetail>(await fetch(`/api/workflows/${id}`));
  },
  async createWorkflow(data: { title: string; reference: string; description?: string; category?: string; family?: string; review_due?: string | null; owner_email?: string | null; category_id?: number | null; parent_id?: number | null }): Promise<Workflow> {
    return handle<Workflow>(
      await fetch("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async updateWorkflow(id: number, data: Partial<Pick<Workflow, "title" | "description" | "category" | "family" | "review_due">> & { owner_email?: string | null; category_id?: number | null; parent_id?: number | null }): Promise<Workflow> {
    return handle<Workflow>(
      await fetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async deleteWorkflow(id: number): Promise<void> {
    await handle<unknown>(await fetch(`/api/workflows/${id}`, { method: "DELETE" }));
  },
  async publishWorkflow(id: number, changelog?: string): Promise<{ number: number; warnings?: string[] }> {
    return handle<{ number: number; warnings?: string[] }>(
      await fetch(`/api/workflows/${id}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changelog: changelog ?? "" }),
      })
    );
  },
  // C-98 (V13 #5) : édition après upload de l'alt et de la description IA.
  async updatePhotoMeta(id: number, data: { alt?: string; image_description?: string }): Promise<Photo> {
    return handle<Photo>(await fetch(`/api/photos/${id}/meta`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }));
  },
  async versions(id: number): Promise<{ id: number; number: number; changelog: string; author_email: string; published_at: string }[]> {
    return handle(await fetch(`/api/workflows/${id}/versions`));
  },
  async getVersion(id: number | string, number: number): Promise<WorkflowDetail> {
    return handle<WorkflowDetail>(await fetch(`/api/workflows/${id}/versions/${number}`));
  },
  // C-71 (#4) : remplace le brouillon par le contenu d'une version publiée
  // (abandonner un brouillon raté sans tout retaper).
  async restoreVersion(id: number, number: number): Promise<void> {
    await handle<unknown>(await fetch(`/api/workflows/${id}/versions/${number}/restore`, { method: "POST" }));
  },
  // C-97 (V12 #9) : abandon/reset d'un brouillon, même jamais publié (V0)
  // ou corrompu — la porte de sortie serveur ne dépend pas de l'éditeur.
  async resetDraft(id: number): Promise<{ ok: true; mode: "restored" | "emptied"; restoredFrom?: number }> {
    return handle(await fetch(`/api/workflows/${id}/reset-draft`, { method: "POST" }));
  },
  // C-97 (V12 #8) : indications métiers paramétrables — liste active (seed
  // serveur = les 7 historiques) et édition admin.
  async getIndications(): Promise<Indication[]> {
    return handle<Indication[]>(await fetch("/api/settings/indications"));
  },
  async saveIndications(list: Indication[]): Promise<Indication[]> {
    return handle<Indication[]>(await fetch("/api/settings/indications", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(list),
    }));
  },
  // C-73 : rognage — remplace le FICHIER d'une photo (ligne inchangée :
  // position/taille/alt conservées) ; repointage = retour arrière.
  async replacePhotoFile(photoId: number, file: File): Promise<Photo> {
    const fd = new FormData();
    fd.append("file", file);
    return handle<Photo>(await fetch(`/api/photos/${photoId}/file`, { method: "PUT", body: fd }));
  },
  async repointPhotoFile(photoId: number, filename: string): Promise<Photo> {
    return handle<Photo>(
      await fetch(`/api/photos/${photoId}/file`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename }),
      })
    );
  },
  // C-72 (#4/#5) + C-86 : paramètres applicatifs (page Paramètres, admin).
  async getSettings(): Promise<AppSettings> {
    return handle(await fetch("/api/settings"));
  },
  async saveSettings(data: Partial<AppSettings>): Promise<AppSettings> {
    return handle(
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async addStep(workflowId: number, data: { title: string; body?: string }): Promise<Step> {
    return handle<Step>(
      await fetch(`/api/workflows/${workflowId}/steps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async updateStep(id: number, data: Partial<Pick<Step, "title" | "body" | "pictos">>): Promise<Step> {
    return handle<Step>(
      await fetch(`/api/steps/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async deleteStep(id: number): Promise<void> {
    await handle<unknown>(await fetch(`/api/steps/${id}`, { method: "DELETE" }));
  },
  async reorderSteps(workflowId: number, orderedIds: number[]): Promise<void> {
    await handle<unknown>(
      await fetch(`/api/workflows/${workflowId}/steps/reorder`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      })
    );
  },
  async importDocument(file: File, ai = false): Promise<ImportResult> {
    const fd = new FormData();
    fd.append("file", file);
    if (ai) fd.append("ai", "1"); // C-109 : import PDF assisti par le moteur IA
    return handle<ImportResult>(await fetch("/api/import/document", { method: "POST", body: fd }));
  },
  async aiStatus(): Promise<AiStatus> {
    return handle<AiStatus>(await fetch("/api/ai"));
  },
  // C-110 : configuration du moteur IA (admin). Convention clé : absente →
  // inchangée, "" → effacée, valeur → remplacée. Jamais renvoyée par l'API.
  async saveAiConfig(data: { enabled: boolean; base_url: string; model: string; api_key?: string; timeout_ms?: number }): Promise<AiStatus> {
    return handle<AiStatus>(
      await fetch("/api/ai/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async aiTest(): Promise<AiTestResult> {
    return handle<AiTestResult>(await fetch("/api/ai/test", { method: "POST" }));
  },
  async uploadPhoto(stepId: number, file: File, alt: string): Promise<Photo> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("alt", alt);
    return handle<Photo>(await fetch(`/api/steps/${stepId}/photos`, { method: "POST", body: fd }));
  },
  async deletePhoto(id: number): Promise<void> {
    await handle<unknown>(await fetch(`/api/photos/${id}`, { method: "DELETE" }));
  },
  async saveLayout(photoId: number, display_size: string, display_align: string, display_x?: number | null, display_y?: number | null, display_w?: number | null): Promise<void> {
    await handle<unknown>(
      await fetch(`/api/photos/${photoId}/layout`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_size, display_align, display_x: display_x ?? null, display_y: display_y ?? null, display_w: display_w ?? null }),
      })
    );
  },
  async saveAnnotations(photoId: number, annotations: unknown[]): Promise<void> {
    await handle<unknown>(
      await fetch(`/api/photos/${photoId}/annotations`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ annotations }),
      })
    );
  },
  async sendFeedback(workflowId: number, stepId: number, message: string): Promise<void> {
    await handle<unknown>(
      await fetch(`/api/workflows/${workflowId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step_id: stepId, message }),
      })
    );
  },
  async listFeedback(workflowId: number): Promise<{ id: number; by: string; step_id: number; message: string; status: "open" | "resolved"; resolved_by: string | null; resolved_at: string | null; at: string }[]> {
    return handle(await fetch(`/api/workflows/${workflowId}/feedback`));
  },
  async resolveFeedback(workflowId: number, feedbackId: number): Promise<void> {
    await handle<unknown>(
      await fetch(`/api/workflows/${workflowId}/feedback/${feedbackId}/resolve`, { method: "PUT" })
    );
  },
  // C-96 (V12 #7) : commentaires de rédaction par étape — édition only.
  async listStepComments(stepId: number): Promise<StepComment[]> {
    return handle(await fetch(`/api/steps/${stepId}/comments`));
  },
  async addStepComment(stepId: number, message: string): Promise<StepComment> {
    return handle(await fetch(`/api/steps/${stepId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    }));
  },
  async deleteStepComment(stepId: number, commentId: number): Promise<void> {
    await handle<unknown>(await fetch(`/api/steps/${stepId}/comments/${commentId}`, { method: "DELETE" }));
  },
  // V17 (B1/B4) : fil de relecture au niveau du MO et statut éditorial.
  async listReviewComments(id: number): Promise<ReviewComment[]> {
    return handle(await fetch(`/api/workflows/${id}/review-comments`));
  },
  async addReviewComment(id: number, message: string): Promise<ReviewComment> {
    return handle(await fetch(`/api/workflows/${id}/review-comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    }));
  },
  async deleteReviewComment(id: number, commentId: number): Promise<void> {
    await handle<unknown>(await fetch(`/api/workflows/${id}/review-comments/${commentId}`, { method: "DELETE" }));
  },
  async setEditorialStatus(id: number, status: EditorialStatus): Promise<{ status: EditorialStatus; updated_at: string | null }> {
    return handle(await fetch(`/api/workflows/${id}/status`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }));
  },
  exportUrl(id: number, version?: number): string {
    return `/api/workflows/${id}/export${version ? `?version=${version}` : ""}`;
  },
  async adminListUsers(): Promise<AdminUser[]> {
    return handle<AdminUser[]>(await fetch("/api/admin/users"));
  },
  async adminCreateUser(email: string, password: string, role: AdminUser["role"], firstName?: string, lastName?: string): Promise<AdminUser> {
    return handle<AdminUser>(
      await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, role, first_name: firstName ?? "", last_name: lastName ?? "" }),
      })
    );
  },
  async adminUpdateUser(id: number, data: { role?: AdminUser["role"]; active?: number; first_name?: string; last_name?: string }): Promise<AdminUser> {
    return handle<AdminUser>(
      await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async adminListAudit(): Promise<{ id: number; actor_email: string; action: string; target: string; detail: string; at: string }[]> {
    return handle(await fetch("/api/admin/audit"));
  },
  async adminResetPassword(id: number): Promise<{ temporaryPassword: string }> {
    return handle<{ temporaryPassword: string }>(
      await fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" })
    );
  },
  // C-107 : suppression définitive d'un compte désactivé (admin).
  async adminDeleteUser(id: number): Promise<void> {
    await handle<unknown>(await fetch(`/api/admin/users/${id}`, { method: "DELETE" }));
  },
  // C-94 : arborescence documentaire — l'admin structure l'arbre,
  // tous les rôles lisent (lecteur inclus : navigation par arborescence).
  async listCategories(): Promise<Category[]> {
    return handle<Category[]>(await fetch("/api/categories"));
  },
  async createCategory(name: string, parentId?: number | null): Promise<Category> {
    return handle<Category>(
      await fetch("/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parent_id: parentId ?? null }),
      })
    );
  },
  async updateCategory(id: number, data: { name?: string; parent_id?: number | null; position?: number }): Promise<Category> {
    return handle<Category>(
      await fetch(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async deleteCategory(id: number): Promise<void> {
    await handle<unknown>(await fetch(`/api/categories/${id}`, { method: "DELETE" }));
  },
  // V16 (V8 #2) : statut editorial - lecture et changement (author+).
  async workflowStatus(id: number | string): Promise<{ status: string; updated_at: string | null }> {
    return handle<{ status: string; updated_at: string | null }>(await fetch(`/api/workflows/${id}/status`));
  },
  async setWorkflowStatus(id: number | string, status: string): Promise<{ status: string; updated_at: string | null }> {
    return handle<{ status: string; updated_at: string | null }>(await fetch(`/api/workflows/${id}/status`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }));
  },

};
