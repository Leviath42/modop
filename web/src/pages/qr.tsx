import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { api, ApiError, type WorkflowDetail } from "../api";
import NavBar from "../nav";
import { Button, buttonVariants } from "../components/ui/button";
import { cn } from "../lib/utils";

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

  if (error) return (<><NavBar /><main className="p-8"><p role="alert" className="text-error">{error}</p><Link to="/">Retour</Link></main></>);

  return (
    <>
      <NavBar />
      <main className="mx-auto w-full max-w-[420px] p-4">
        {/* Feuille QR : fond blanc + texte anthracite imposés en inline, pour
            rester lisibles à l'impression même en mode sombre (aucun token
            clair figé disponible, règle "pas de couleur littérale en classe"). */}
        <section
          className="qr-sheet grid justify-items-center gap-3 rounded-lg p-6 text-center shadow-sm"
          style={{ background: "#ffffff", color: "#2c3a43" }}
        >
          <h1 className="m-0 break-words text-lg">{wf ? wf.title : "Chargement…"}</h1>
          {wf && <p className="m-0"><code className="rounded bg-surface-2 px-1.5 py-0.5">{wf.reference}</code>{wf.state === "published" ? ` — V${wf.current_version}` : " — brouillon"}</p>}
          {wf && (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`QR code vers le mode opératoire ${wf.title}`}
            />
          )}
          {wf && <p className="m-0 text-xs" style={{ color: "#5b6470" }}>Scannez pour consulter le mode opératoire</p>}
        </section>
        <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.print()}>Imprimer</Button>
          <Link to={`/workflow/${id}/read`} className={cn(buttonVariants({ variant: "outline" }))}>Retour au document</Link>
        </div>
        <p className="no-print mt-4 text-center text-xs text-muted-foreground">
          Impression : au moins 4 cm de côté, zone blanche autour du code conservée, à hauteur des yeux (90–120 cm).
        </p>
      </main>
    </>
  );
}
