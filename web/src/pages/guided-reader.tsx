import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type WorkflowDetail } from "../api";
import NavBar from "../nav";
import StepCanvasView from "../step-canvas-view";
import { Button } from "../components/ui/button";
import { Check, TriangleAlert, X } from "lucide-react";

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

  if (error) return (<><NavBar /><main className="p-8"><p role="alert" className="text-error">{error}</p><Link to="/">Retour</Link></main></>);
  if (!wf) return (<><NavBar /><main className="p-8">Chargement…</main></>);
  if (wf.steps.length === 0) return (<><NavBar /><main className="p-8"><p>Aucune étape.</p><Link to={`/workflow/${id}/read`}>Retour</Link></main></>);

  const step = wf.steps[idx];
  const last = idx >= wf.steps.length - 1;

  return (
    <>
      <NavBar />
      <main
        // C-70 : calquée sur les autres pages — colonne lisible et contrainte
        // (plus de plein écran illisible sur desktop).
        className="mx-auto grid min-h-dvh w-full max-w-[560px] content-start gap-2.5 p-2.5 grid-rows-[auto_1fr] sm:p-6"
        style={{ paddingBottom: "calc(4.6rem + env(safe-area-inset-bottom))" }}
      >
        <header className="flex min-w-0 flex-wrap items-center gap-2">
          <Link to={`/workflow/${id}/read`} aria-label="Lecture classique" className="shrink-0 text-xl no-underline"><X size={22} aria-hidden="true" /></Link>
          <h1 className="m-0 min-w-0 flex-1 truncate text-base">
            {wf.title} <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.75em]">{wf.reference}</code>
          </h1>
          <span aria-live="polite" className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-sm font-semibold text-foreground">
            {idx + 1}/{wf.steps.length}
          </span>
        </header>
        {wf.state === "draft" && (
          <p className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
            Brouillon de travail — ce mode opératoire n'est pas publié.
          </p>
        )}

        <article className="rounded-lg bg-surface p-4 shadow-sm">
          <h2 className="mt-0 text-lg">{idx + 1}. {step.title}</h2>
          {step.body && <p className="whitespace-pre-wrap break-words text-base">{step.body}</p>}
          {step.pictos.length > 0 && (
            <div className="mb-1.5 grid gap-1.5">
              {step.pictos.map((p, k) => (
                <p key={k} className="m-0 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-foreground" style={{ background: `${p.color}1f`, borderLeft: `5px solid ${p.color}` }}>
                  <TriangleAlert size={16} aria-hidden="true" style={{ color: p.color }} /> {p.label}
                </p>
              ))}
            </div>
          )}
          {step.photos.length > 0 && <StepCanvasView photos={step.photos ?? []} shapes={step.canvas ?? []} />}
        </article>

        <nav
          className="fixed bottom-0 inset-x-0 z-[200] border-t border-border-soft bg-background shadow-lg"
          style={{ padding: "0.6rem max(0.6rem, env(safe-area-inset-left)) max(0.6rem, env(safe-area-inset-bottom)) max(0.6rem, env(safe-area-inset-right))" }}
          aria-label="Navigation entre étapes"
        >
          <div className="mx-auto flex max-w-[560px] gap-2.5">
            <Button
              variant="outline"
              onClick={() => setIdx((v) => Math.max(0, v - 1))}
              disabled={idx === 0}
              className="h-auto min-w-0 flex-1 py-3.5 text-base"
            >← Précédent</Button>
            {last ? (
              <Button
                onClick={() => navigate(`/workflow/${id}/read`)}
                className="h-auto min-w-0 flex-[1.4] py-3.5 text-base font-semibold"
              ><Check size={16} aria-hidden="true" /> Terminé</Button>
            ) : (
              <Button
                onClick={() => { setIdx((v) => v + 1); window.scrollTo({ top: 0 }); }}
                className="h-auto min-w-0 flex-[1.4] py-3.5 text-base font-semibold"
              >Suivant →</Button>
            )}
          </div>
        </nav>
      </main>
    </>
  );
}
