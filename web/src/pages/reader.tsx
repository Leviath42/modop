import AnnotatedPhoto, { parseShapes } from "../annotated-photo";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type WorkflowDetail } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getWorkflow(id!)
      .then((w) => { setWf(w); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [id]);

  if (error) return (<><NavBar /><main style={{ padding: "2rem" }}><p role="alert" style={{ color: "var(--error-text)" }}>{error}</p><Link to="/">Retour</Link></main></>);
  if (!wf) return (<><NavBar /><main style={{ padding: "2rem" }}>Chargement…</main></>);

  const isMobile = window.innerWidth < 700;

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: isMobile ? "100%" : "800px", margin: "0 auto", padding: "1rem" }}>

        <header style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem", flexWrap: "wrap", position: "sticky", top: 0, background: "var(--bg)", padding: "0.5rem 0", zIndex: 20 }}>
          <Link to="/" aria-label="Retour à la liste" style={{ fontSize: "1.3rem", textDecoration: "none" }}>←</Link>
          <h1 style={{ fontSize: isMobile ? "1.05rem" : "1.3rem", margin: 0, flex: 1, minWidth: "120px" }}>
            {wf.title} <code style={{ fontSize: "0.75em", background: "var(--surface-2)", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>{wf.reference}</code>
          </h1>
          <select
            value=""
            onChange={(e) => { const el = document.getElementById(`etape-${e.target.value}`); el?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            aria-label="Aller à une étape"
            style={{ padding: "0.45rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", fontSize: "0.9rem" }}
          >
            <option value="">Aller à l'étape…</option>
            {wf.steps.map((s, i) => (
              <option key={s.id} value={i}>{i + 1}. {s.title}</option>
            ))}
          </select>
        </header>
        {wf.state === "published" && (
          <p style={{ margin: "0 0 0.8rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Version V{wf.current_version}{wf.category ? ` — ${wf.family || ""} ${wf.category}` : ""}
          </p>
        )}
        {wf.steps.map((step, i) => (
          <article key={step.id} id={`etape-${i}`} style={{ background: "var(--surface)", borderRadius: "10px", padding: "1.2rem", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", marginBottom: "0.8rem", scrollMarginTop: "5.5rem" }}>
            <h2 style={{ marginTop: 0 }}>{i + 1}. {step.title}</h2>
            {step.body && <p style={{ whiteSpace: "pre-wrap" }}>{step.body}</p>}
            {step.pictos.length > 0 && (
              <p style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                {step.pictos.map((p, i) => (
                  <span key={i} style={{ background: `${p.color}22`, borderLeft: `4px solid ${p.color}`, padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.85rem", fontWeight: 600 }}>
                    ⚠ {p.label}
                  </span>
                ))}
              </p>
            )}
            {step.photos.length > 0 && (
              <div style={{ display: "grid", gap: "0.6rem" }}>
                {step.photos.map((ph) => {
                  const SIZES: Record<string, string> = { small: "35%", medium: "60%", large: "85%", full: "100%" };
                  const freeW = typeof ph.display_w === "number" ? `${ph.display_w * 100}%` : (SIZES[ph.display_size ?? "medium"] ?? "60%");
                  return (
                    <div key={ph.id} style={{ display: "flex", justifyContent: ph.display_align ?? "center", width: "100%" }}>
                      <div style={{ width: freeW, marginLeft: typeof ph.display_x === "number" ? `${ph.display_x * 100}%` : undefined, maxWidth: "100%" }}>
                        <AnnotatedPhoto
                          filename={ph.filename}
                          alt={ph.alt || step.title}
                          shapes={parseShapes(ph.annotations)}
                          maxWidth="100%"
                          zoomable
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        ))}
        <p style={{ textAlign: "center", margin: "1.2rem 0" }}>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={navBtn}>↑ Retour au début</button>
        </p>
        {user && user.role !== "reader" && wf.state === "published" && (
          <p style={{ marginTop: "1rem", textAlign: "center" }}>
            <a href={api.exportUrl(wf.id)} style={{ color: "var(--accent)" }}>⬇ Exporter en .docx</a>
          </p>
        )}
      </main>
    </>
  );
}

const navBtn: React.CSSProperties = {
  padding: "0.7rem 1.2rem",
  borderRadius: "8px",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: "1rem",
};
