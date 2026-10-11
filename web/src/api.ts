export interface User {
  id: number;
  email: string;
  role: "reader" | "author" | "admin";
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
  updated_at: string;
}

export interface Photo {
  id: number;
  step_id?: number;
  filename: string;
  alt: string;
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
  role: "reader" | "author" | "admin";
  active: number;
  auth_provider: string;
  created_at: string;
}

export interface WorkflowDetail extends Workflow {
  steps: Step[];
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
  return (await res.json()) as T;
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
  async listWorkflows(params: { search?: string; category?: string; state?: string; family?: string } = {}): Promise<Workflow[]> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return handle<Workflow[]>(await fetch(`/api/workflows?${q}`));
  },
  async getWorkflow(id: number | string): Promise<WorkflowDetail> {
    return handle<WorkflowDetail>(await fetch(`/api/workflows/${id}`));
  },
  async createWorkflow(data: { title: string; reference: string; description?: string; category?: string; family?: string }): Promise<Workflow> {
    return handle<Workflow>(
      await fetch("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async updateWorkflow(id: number, data: Partial<Pick<Workflow, "title" | "description" | "category" | "family">>): Promise<Workflow> {
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
  async publishWorkflow(id: number): Promise<{ number: number }> {
    return handle<{ number: number }>(await fetch(`/api/workflows/${id}/publish`, { method: "POST" }));
  },
  async versions(id: number): Promise<{ id: number; number: number; author_email: string; published_at: string }[]> {
    return handle(await fetch(`/api/workflows/${id}/versions`));
  },
  async getVersion(id: number | string, number: number): Promise<WorkflowDetail> {
    return handle<WorkflowDetail>(await fetch(`/api/workflows/${id}/versions/${number}`));
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
  exportUrl(id: number, version?: number): string {
    return `/api/workflows/${id}/export${version ? `?version=${version}` : ""}`;
  },
  async adminListUsers(): Promise<AdminUser[]> {
    return handle<AdminUser[]>(await fetch("/api/admin/users"));
  },
  async adminCreateUser(email: string, password: string, role: AdminUser["role"]): Promise<AdminUser> {
    return handle<AdminUser>(
      await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      })
    );
  },
  async adminUpdateUser(id: number, data: { role?: AdminUser["role"]; active?: number }): Promise<AdminUser> {
    return handle<AdminUser>(
      await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async adminResetPassword(id: number): Promise<{ temporaryPassword: string }> {
    return handle<{ temporaryPassword: string }>(
      await fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" })
    );
  },
};
