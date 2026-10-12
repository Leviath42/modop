import StepCanvasView from "../step-canvas-view";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError, type WorkflowDetail } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const versionParam = searchParams.get("version");
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [versions, setVersions] = useState<{ number: number; changelog: string; published_at: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Retour terrain (RF-73)
  const [feedbackOpenStep, setFeedbackOpenStep] = useState<number | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [feedbackNotice, setFeedbackNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // C-34 : même logique que l'éditeur — le sélecteur suit l'étape active
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const load = versionParam
      ? api.getVersion(id!, Number(versionParam))
      : api.getWorkflow(id!);
    load
      .then((w) => { setWf(w); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [id, versionParam]);
  useEffect(() => {
    api.versions(Number(id))
      .then((v) => setVersions(v))
      .catch(() => { /* lecture seule : liste optionnelle */ });
  }, [id]);

  if (error) return (<><NavBar /><main style={{ padding: "2rem" }}><p role="alert" style={{ color: "var(--error-text)" }}>{error}</p><Link to="/">Retour</Link></main></>);
  if (!wf) return (<><NavBar /><main style={{ padding: "2rem" }}>Chargement…</main></>);
  const isMobile = window.innerWidth < 700;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: isMobile ? "100%" : "800px", margin: "0 auto", padding: "1rem" }}>
        <header style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem", flexWrap: "wrap", position: "sticky", top: "var(--nav-h, 2.9rem)", background: "var(--bg)", padding: "0.5rem 0", zIndex: 20 }}>
          <Link to="/" aria-label="Retour à la liste" style={{ fontSize: "1.1rem", textDecoration: "none" }}>←</Link>
          <h1 style={{ fontSize: "1rem", margin: 0, flex: 1, minWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {wf.title} <code style={{ fontSize: "0.8em", background: "var(--surface-2)", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>{wf.reference}</code>
          </h1>
          <select
            value={String(activeStep)}
            onChange={(e) => {
              const i = Number(e.target.value);
              if (Number.isNaN(i)) return;
              setActiveStep(i);
              setTimeout(() => { document.getElementById(`etape-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
            }}
            aria-label="Étape affichée — choisir pour y aller"
            title="Étape active — choisir pour y aller"
            style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, flex: "0 1 8rem", maxWidth: "40vw", minWidth: 0, padding: "0.25rem 0.35rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            {wf.steps.map((s, i) => (
              <option key={s.id} value={i}>{i === activeStep ? "▶ " : ""}{i + 1}. {s.title}</option>
            ))}
          </select>
          {versions.length > 0 && (
            <select
              value={versionParam ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setSearchParams(v ? { version: v } : {});
                window.scrollTo({ top: 0 });
              }}
              aria-label="Consulter une version publiée"
              style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, padding: "0.25rem 0.35rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", maxWidth: "40vw", minWidth: 0 }}
            >
              <option value="">Dernier état</option>
              {versions.map((v) => (
                <option key={v.number} value={v.number}>V{v.number}{v.changelog ? ` — ${v.changelog.slice(0, 40)}${v.changelog.length > 40 ? "…" : ""}` : ""}</option>
              ))}
            </select>
          )}
          {versionParam && (
            <span style={{ fontSize: "0.85rem", background: "var(--accent-bg)", color: "var(--accent)", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600 }}>
              V{versionParam} (publiée)
            </span>
          )}
          <Link to={`/workflow/${wf.id}/guided`} aria-label="Mode lecture guidée" title="Lecture guidée : une étape par écran" style={{ fontSize: "0.8rem", color: "var(--accent)", textDecoration: "none" }}>⇥ Guidé</Link>
          <Link to={`/workflow/${wf.id}/qr`} aria-label="Vignette QR imprimable" title="Vignette QR imprimable" style={{ fontSize: "0.8rem", color: "var(--accent)", textDecoration: "none" }}>QR</Link>
          {user && user.role !== "reader" && (
            <Link to={`/workflow/${wf.id}/feedbacks`} aria-label="Remontées terrain de ce mode opératoire" title="Remontées terrain : à traiter et historique" style={{ fontSize: "0.8rem", color: "var(--accent)", textDecoration: "none" }}>⚑ Terrain</Link>
          )}
        </header>
        {wf.state === "published" && (
          <p style={{ margin: "0 0 0.8rem", color: "var(--text-muted)", fontSize: "0.85rem", display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <span>Version V{wf.current_version}{wf.category ? ` — ${wf.family || ""} ${wf.category}` : ""}</span>
            {wf.review_due && wf.review_due < today && (
              <span title={`À revoir depuis le ${wf.review_due}`} style={{ background: "var(--error-bg)", color: "var(--error-text)", padding: "0.1rem 0.5rem", borderRadius: "99px", fontWeight: 600 }}>à revoir</span>
            )}
          </p>
        )}
        {feedbackNotice && (
          <p role={feedbackNotice.kind === "ok" ? "status" : "alert"} style={{ position: "fixed", bottom: "1rem", left: "50%", transform: "translateX(-50%)", background: feedbackNotice.kind === "ok" ? "var(--ok-bg)" : "var(--error-bg)", color: feedbackNotice.kind === "ok" ? "var(--ok-text)" : "var(--error-text)", fontWeight: 600, padding: "0.5rem 1rem", borderRadius: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", zIndex: 100, margin: 0 }}>{feedbackNotice.text}</p>
        )}
        {wf.steps.map((step, i) => (
          <article key={step.id} id={`etape-${i}`} style={{ background: "var(--surface)", borderRadius: "10px", padding: "1.2rem", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", marginBottom: "0.8rem", scrollMarginTop: "8rem" }}>
            <h2 style={{ marginTop: 0, fontSize: "1rem", fontWeight: 600 }}>{i + 1}. {step.title}</h2>
            {step.body && <p style={{ whiteSpace: "pre-wrap" }}>{step.body}</p>}
            {step.pictos.length > 0 && (
              <p style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                {step.pictos.map((p, k) => (
                  <span key={k} style={{ background: `${p.color}22`, borderLeft: `4px solid ${p.color}`, padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.85rem", fontWeight: 600 }}>
                    ⚠ {p.label}
                  </span>
                ))}
              </p>
            )}
            {step.photos.length > 0 && (
              <div style={{ display: "grid", gap: "0.6rem" }}>
                <StepCanvasView photos={step.photos ?? []} shapes={step.canvas ?? []} />
              </div>
            )}
            {feedbackOpenStep === step.id ? (
              <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.6rem" }}>
                <textarea value={feedbackMsg} onChange={(e) => setFeedbackMsg(e.target.value)} rows={2} placeholder="Décrivez le problème (photo floue, étape manquante, outillage…)" style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "1rem", fontFamily: "inherit" }} aria-label="Votre signalement" />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button onClick={() => { setFeedbackOpenStep(null); setFeedbackMsg(""); }} style={{ padding: "0.4rem 0.8rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}>Annuler</button>
                  <button
                    onClick={async () => {
                      try {
                        await api.sendFeedback(wf.id, step.id, feedbackMsg);
                        setFeedbackNotice({ kind: "ok", text: "Signalement envoyé — merci !" });
                        setFeedbackOpenStep(null);
                        setFeedbackMsg("");
                        setTimeout(() => setFeedbackNotice(null), 3000);
                      } catch (e) {
                        setFeedbackNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Envoi impossible" });
                        setTimeout(() => setFeedbackNotice(null), 3000);
                      }
                    }}
                    disabled={!feedbackMsg.trim()}
                    style={{ padding: "0.4rem 0.8rem", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white" }}
                  >Envoyer</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setFeedbackOpenStep(step.id); setFeedbackMsg(""); }} style={{ marginTop: "0.6rem", fontSize: "0.8rem", color: "var(--text-muted)", border: "none", background: "none", textDecoration: "underline", padding: 0, cursor: "pointer" }}>Signaler un problème sur cette étape</button>
            )}
          </article>
        ))}
        <p style={{ textAlign: "center", margin: "1.2rem 0" }}>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ padding: "0.7rem 1.2rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "1rem" }}>↑ Retour au début</button>
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
