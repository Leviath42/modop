import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type WorkflowDetail } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";

// C-35 : historique complet des remontées terrain d'un mode opératoire —
// page dédiée (auteur+). Le lecteur n'affiche plus la section : seul un
// compteur discret y renvoie. Ici : à traiter d'abord, puis l'historique
// des signalements résolus.

interface Feedback {
  id: number;
  by: string;
  step_id: number;
  message: string;
  status: "open" | "resolved";
  resolved_by: string | null;
  resolved_at: string | null;
  at: string;
}

export default function FeedbacksPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.getWorkflow(id!)
      .then((w) => setWf(w))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
    api.listFeedback(Number(id))
      .then(setFeedbacks)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [id]);

  async function resolve(fb: Feedback) {
    try {
      await api.resolveFeedback(wf!.id, fb.id);
      setFeedbacks((arr) => arr.map((x) => (x.id === fb.id ? { ...x, status: "resolved" as const, resolved_by: user?.email ?? null, resolved_at: new Date().toISOString() } : x)));
      setNotice({ kind: "ok", text: "Signalement marqué résolu" });
      setTimeout(() => setNotice(null), 2500);
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Résolution impossible" });
      setTimeout(() => setNotice(null), 2500);
    }
  }

  if (error) return (<><NavBar /><main style={{ padding: "2rem" }}><p role="alert" style={{ color: "var(--error-text)" }}>{error}</p><Link to={`/workflow/${id}/read`}>Retour</Link></main></>);
  if (!wf) return (<><NavBar /><main style={{ padding: "2rem" }}>Chargement…</main></>);

  const stepNumber = (stepId: number) => {
    const i = wf.steps.findIndex((s) => s.id === stepId);
    return i >= 0 ? i + 1 : null;
  };
  const open = feedbacks.filter((f) => f.status === "open");
  const resolved = feedbacks.filter((f) => f.status === "resolved");

  const card = (f: Feedback, canAct: boolean) => (
    <li key={f.id} style={{ display: "grid", gap: "0.2rem", opacity: f.status === "resolved" ? 0.6 : 1, background: "var(--surface)", borderRadius: "8px", padding: "0.6rem 0.8rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "0.9rem" }}>Étape {stepNumber(f.step_id) ?? "?"}</strong>
        {f.status === "open"
          ? <span style={{ background: "var(--error-text)", color: "white", fontSize: "0.7rem", padding: "0.05rem 0.4rem", borderRadius: "99px" }}>à traiter</span>
          : <span style={{ background: "var(--ok-bg)", color: "var(--ok-text)", fontSize: "0.7rem", padding: "0.05rem 0.4rem", borderRadius: "99px" }}>résolu{f.resolved_by ? ` par ${f.resolved_by}` : ""}</span>}
      </div>
      <div style={{ fontSize: "0.95rem" }}>« {f.message} »</div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{f.by}, {f.at}</span>
        {canAct && f.status === "open" && (
          <>
            <Link to={`/workflow/${wf.id}/edit`} style={{ fontSize: "0.8rem", color: "var(--accent)" }}>Corriger l'étape</Link>
            <button
              onClick={() => void resolve(f)}
              style={{ fontSize: "0.8rem", padding: "0.15rem 0.6rem", borderRadius: "6px", border: "1px solid var(--ok-text)", background: "var(--surface)", color: "var(--ok-text)", cursor: "pointer" }}
            >✓ Résoudre</button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: "820px", width: "100%", margin: "0 auto", padding: "1rem", display: "grid", gap: "1rem" }}>
        <header style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link to={`/workflow/${wf.id}/read`} aria-label="Retour à la lecture" style={{ fontSize: "1.1rem", textDecoration: "none" }}>←</Link>
          <h1 style={{ fontSize: "1rem", margin: 0, flex: 1, minWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Remontées terrain — {wf.title} <code style={{ fontSize: "0.8em", background: "var(--surface-2)", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>{wf.reference}</code>
          </h1>
        </header>

        {notice && (
          <p role={notice.kind === "ok" ? "status" : "alert"} style={{ margin: 0, padding: "0.4rem 0.6rem", borderRadius: "6px", background: notice.kind === "ok" ? "var(--ok-bg)" : "var(--error-bg)", color: notice.kind === "ok" ? "var(--ok-text)" : "var(--error-text)", fontWeight: 600 }}>{notice.text}</p>
        )}

        <section aria-label="À traiter" style={{ display: "grid", gap: "0.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "0.95rem" }}>À traiter <span style={{ background: "var(--error-bg)", color: "var(--error-text)", fontSize: "0.75rem", padding: "0.05rem 0.5rem", borderRadius: "99px" }}>{open.length}</span></h2>
          {open.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.9rem", background: "var(--ok-bg)", color: "var(--ok-text)", padding: "0.5rem 0.8rem", borderRadius: "8px" }}>Aucune remontée à traiter — tout est lu ✓</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
              {open.map((f) => card(f, user?.role !== "reader"))}
            </ul>
          )}
        </section>

        <section aria-label="Historique des signalements traités" style={{ display: "grid", gap: "0.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "0.95rem" }}>Traitées <span style={{ background: "var(--ok-bg)", color: "var(--ok-text)", fontSize: "0.75rem", padding: "0.05rem 0.5rem", borderRadius: "99px" }}>{resolved.length}</span></h2>
          {resolved.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>Aucun signalement traité pour l'instant.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
              {resolved.map((f) => card(f, false))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
