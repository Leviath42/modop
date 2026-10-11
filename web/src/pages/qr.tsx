import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { api, ApiError, type WorkflowDetail } from "../api";
import NavBar from "../nav";

// RF-71 — vignette QR imprimable : titre, référence, QR vers la page de lecture.
// Conformes aux bonnes pratiques : zone de silence autour du code, taille
// suffisante pour un scan à ~20 cm, alt-text pour lecteurs d'écran.
export default function QrPage() {
  const { id } = useParams<{ id: string }>();
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    api.getWorkflow(id!)
      .then((w) => setWf(w))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [id]);

  useEffect(() => {
    if (!wf || !canvasRef.current) return;
    const url = new URL(`/workflow/${wf.id}/read`, window.location.origin).toString();
    QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 4 }, (err) => {
      if (err) setError("Génération du QR impossible");
    });
  }, [wf]);

  if (error) return (<><NavBar /><main style={{ padding: "2rem" }}><p role="alert" style={{ color: "var(--error-text)" }}>{error}</p><Link to="/">Retour</Link></main></>);

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: "420px", margin: "0 auto", padding: "1rem" }}>
        <section className="qr-sheet" style={{ background: "var(--surface)", borderRadius: "10px", padding: "1.4rem", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", display: "grid", justifyItems: "center", gap: "0.7rem", textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: "1.15rem" }}>{wf ? wf.title : "Chargement…"}</h1>
          {wf && <p style={{ margin: 0 }}><code style={{ background: "var(--surface-2)", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>{wf.reference}</code>{wf.state === "published" ? ` — V${wf.current_version}` : " — brouillon"}</p>}
          {wf && (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`QR code vers le mode opératoire ${wf.title}`}
            />
          )}
          {wf && <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>Scannez pour consulter le mode opératoire</p>}
        </section>
        <div className="no-print" style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1rem", flexWrap: "wrap" }}>
          <button onClick={() => window.print()} style={{ padding: "0.5rem 0.9rem", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white" }}>Imprimer</button>
          <Link to={`/workflow/${id}/read`} style={{ padding: "0.5rem 0.9rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", textDecoration: "none" }}>Retour au document</Link>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1rem", textAlign: "center" }} className="no-print">
          Impression : au moins 4 cm de côté, zone blanche autour du code conservée, à hauteur des yeux (90–120 cm).
        </p>
      </main>
    </>
  );
}
