import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type WorkflowDetail } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getWorkflow(id!)
      .then((w) => { setWf(w); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [id]);

  if (error) return (<><NavBar /><main style={{ padding: "2rem" }}><p role="alert" style={{ color: "#b30000" }}>{error}</p><Link to="/">Retour</Link></main></>);
  if (!wf) return (<><NavBar /><main style={{ padding: "2rem" }}>Chargement…</main></>);

  const step = wf.steps[index];
  const isMobile = window.innerWidth < 700;
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(wf.steps.length - 1, i + 1));

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: isMobile ? "100%" : "800px", margin: "0 auto", padding: "1rem" }}>
        {!isMobile && (
          <header style={{ marginBottom: "1rem" }}>
            <h1>{wf.title} <code style={{ fontSize: "0.8em", background: "#eef0f4", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>{wf.reference}</code></h1>
            <p style={{ color: "#666" }}>
              {wf.state === "published" ? `Version V${wf.current_version}` : "Brouillon"}{wf.category ? ` — ${wf.category}` : ""}
            </p>
            <nav aria-label="Sommaire" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {wf.steps.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setIndex(i)}
                  style={{
                    padding: "0.25rem 0.6rem", borderRadius: "99px", fontSize: "0.85rem",
                    border: i === index ? "2px solid #1f4e9c" : "1px solid #c9ccd3",
                    background: i === index ? "#eaf1fb" : "white",
                  }}
                >
                  {i + 1}. {s.title}
                </button>
              ))}
            </nav>
          </header>
        )}
        {isMobile && (
          <header style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Link to="/" aria-label="Retour à la liste" style={{ fontSize: "1.3rem", textDecoration: "none" }}>←</Link>
            <h1 style={{ fontSize: "1.05rem", margin: 0, flex: 1 }}>{wf.title}</h1>
            <span style={{ fontSize: "0.8rem", color: "#666" }}>{index + 1}/{wf.steps.length}</span>
          </header>
        )}
        {step && (
          <article style={{ background: "white", borderRadius: "10px", padding: "1.2rem", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>
            <h2>{index + 1}. {step.title}</h2>
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
                {step.photos.map((ph) => (
                  <figure key={ph.id} style={{ margin: 0 }}>
                    <img
                      src={`/photos/${ph.filename}`}
                      alt={ph.alt || step.title}
                      loading="lazy"
                      style={{ width: "100%", borderRadius: "8px", cursor: "zoom-in" }}
                      onClick={(e) => {
                        const img = e.currentTarget;
                        img.style.transform = img.style.transform === "scale(2)" ? "" : "scale(2)";
                        img.style.transition = "transform 0.2s";
                      }}
                    />
                    {ph.alt && <figcaption style={{ color: "#666", fontSize: "0.85rem" }}>{ph.alt}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
          </article>
        )}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "space-between" }}>
          <button onClick={prev} disabled={index === 0} style={navBtn}>← Précédent</button>
          <button onClick={next} disabled={!step || index === wf.steps.length - 1} style={navBtn}>Suivant →</button>
        </div>
        {user && user.role !== "reader" && wf.state === "published" && (
          <p style={{ marginTop: "1rem", textAlign: "center" }}>
            <a href={api.exportUrl(wf.id)} style={{ color: "#1f4e9c" }}>⬇ Exporter en .docx</a>
          </p>
        )}
      </main>
    </>
  );
}

const navBtn: React.CSSProperties = {
  padding: "0.7rem 1.2rem",
  borderRadius: "8px",
  border: "1px solid #c9ccd3",
  background: "white",
  fontSize: "1rem",
};
