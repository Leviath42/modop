import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type WorkflowDetail } from "../api";
import NavBar from "../nav";
import StepCanvasView from "../step-canvas-view";
import { Button } from "../components/ui/button";

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
        className="mx-auto grid min-h-dvh w-full content-start gap-2.5 p-2.5 grid-rows-[auto_1fr]"
        style={{ paddingBottom: "calc(4.6rem + env(safe-area-inset-bottom))" }}
      >
        <header className="flex flex-wrap items-center gap-2">
          <Link to={`/workflow/${id}/read`} aria-label="Lecture classique" className="text-xl no-underline">✕</Link>
          <h1 className="m-0 min-w-[6rem] flex-1 truncate text-base">
            {wf.title} <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.75em]">{wf.reference}</code>
          </h1>
          <span aria-live="polite" className="rounded-full bg-accent px-2 py-0.5 text-sm font-semibold text-foreground">
            {idx + 1}/{wf.steps.length}
          </span>
        </header>

        <article className="rounded-lg bg-surface p-4 shadow-sm">
          <h2 className="mt-0 text-lg">{idx + 1}. {step.title}</h2>
          {step.body && <p className="whitespace-pre-wrap break-words text-base">{step.body}</p>}
          {step.pictos.length > 0 && (
            <p className="flex flex-wrap gap-1">
              {step.pictos.map((p, i) => (
                <span key={i} className="rounded px-2 py-0.5 text-sm font-semibold" style={{ background: `${p.color}22`, borderLeft: `4px solid ${p.color}` }}>
                  ⚠ {p.label}
                </span>
              ))}
            </p>
          )}
          {step.photos.length > 0 && <StepCanvasView photos={step.photos ?? []} shapes={step.canvas ?? []} />}
        </article>

        <nav
          className="fixed bottom-0 inset-x-0 z-[200] flex gap-2.5 border-t border-border-soft bg-background shadow-lg"
          style={{ padding: "0.6rem max(0.6rem, env(safe-area-inset-left)) max(0.6rem, env(safe-area-inset-bottom)) max(0.6rem, env(safe-area-inset-right))" }}
          aria-label="Navigation entre étapes"
        >
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
            >Terminé ✓</Button>
          ) : (
            <Button
              onClick={() => { setIdx((v) => v + 1); window.scrollTo({ top: 0 }); }}
              className="h-auto min-w-0 flex-[1.4] py-3.5 text-base font-semibold"
            >Suivant →</Button>
          )}
        </nav>
      </main>
    </>
  );
}
