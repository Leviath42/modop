import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type WorkflowDetail } from "../api";
import NavBar from "../nav";
import StepCanvasView from "../step-canvas-view";

// RF-72 — lecture guidée : une étape par écran, boutons en zone pouce,
// indicateur de progression. Entrée : /workflow/:id/read?guided=1.
export default function GuidedReaderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    api.getWorkflow(id!)
      .then((w) => setWf(w))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [id]);

  if (error) return (<><NavBar /><main style={{ padding: "2rem" }}><p role="alert" style={{ color: "var(--error-text)" }}>{error}</p><Link to="/">Retour</Link></main></>);
  if (!wf) return (<><NavBar /><main style={{ padding: "2rem" }}>Chargement…</main></>);
  if (wf.steps.length === 0) return (<><NavBar /><main style={{ padding: "2rem" }}><p>Aucune étape.</p><Link to={`/workflow/${id}/read`}>Retour</Link></main></>);

  const step = wf.steps[idx];
  const last = idx >= wf.steps.length - 1;

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: "100%", margin: "0 auto", padding: "0.6rem", paddingBottom: "calc(4.6rem + env(safe-area-inset-bottom))", display: "grid", gap: "0.6rem", alignContent: "start", minHeight: "100dvh", gridTemplateRows: "auto 1fr", boxSizing: "border-box" }}>
        <header style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link to={`/workflow/${id}/read`} aria-label="Lecture classique" style={{ fontSize: "1.2rem", textDecoration: "none" }}>✕</Link>
          <h1 style={{ fontSize: "1rem", margin: 0, flex: 1, minWidth: "6rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {wf.title} <code style={{ fontSize: "0.75em", background: "var(--surface-2)", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>{wf.reference}</code>
          </h1>
          <span aria-live="polite" style={{ fontSize: "0.85rem", background: "var(--accent-bg)", color: "var(--accent)", padding: "0.15rem 0.5rem", borderRadius: "99px", fontWeight: 600 }}>
            {idx + 1}/{wf.steps.length}
          </span>
        </header>

        <article style={{ background: "var(--surface)", borderRadius: "10px", padding: "1.1rem", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>{idx + 1}. {step.title}</h2>
          {step.body && <p style={{ whiteSpace: "pre-wrap", fontSize: "1rem" }}>{step.body}</p>}
          {step.pictos.length > 0 && (
            <p style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
              {step.pictos.map((p, i) => (
                <span key={i} style={{ background: `${p.color}22`, borderLeft: `4px solid ${p.color}`, padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.85rem", fontWeight: 600 }}>
                  ⚠ {p.label}
                </span>
              ))}
            </p>
          )}
          {step.photos.length > 0 && <StepCanvasView photos={step.photos ?? []} shapes={step.canvas ?? []} />}
        </article>

        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, display: "flex", gap: "0.6rem", padding: "0.6rem max(0.6rem, env(safe-area-inset-left)) max(0.6rem, env(safe-area-inset-bottom)) max(0.6rem, env(safe-area-inset-right))", background: "var(--bg)", borderTop: "1px solid var(--border-soft)", boxShadow: "0 -2px 10px rgba(0,0,0,0.08)" }} aria-label="Navigation entre étapes">
          <button
            onClick={() => setIdx((v) => Math.max(0, v - 1))}
            disabled={idx === 0}
            style={{ flex: 1, padding: "0.9rem", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "1rem", opacity: idx === 0 ? 0.4 : 1 }}
          >← Précédent</button>
          {last ? (
            <button
              onClick={() => navigate(`/workflow/${id}/read`)}
              style={{ flex: 1.4, padding: "0.9rem", borderRadius: "10px", border: "none", background: "var(--accent)", color: "white", fontSize: "1rem", fontWeight: 600 }}
            >Terminé ✓</button>
          ) : (
            <button
              onClick={() => { setIdx((v) => v + 1); window.scrollTo({ top: 0 }); }}
              style={{ flex: 1.4, padding: "0.9rem", borderRadius: "10px", border: "none", background: "var(--accent)", color: "white", fontSize: "1rem", fontWeight: 600 }}
            >Suivant →</button>
          )}
        </nav>
      </main>
    </>
  );
}
