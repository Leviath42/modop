import StepCanvasView from "../step-canvas-view";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError, type WorkflowDetail } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Alert } from "../components/ui/dialog";
import { Select, Textarea } from "../components/ui/input";
import { cn } from "../lib/utils";
import { ArrowUp, BookOpen, Download, Flag, TriangleAlert } from "lucide-react";

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

  if (error) return (<><NavBar /><main className="p-8"><p role="alert" className="text-error">{error}</p><Link to="/">Retour</Link></main></>);
  if (!wf) return (<><NavBar /><main className="p-8">Chargement…</main></>);
  const isMobile = window.innerWidth < 700;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <NavBar />
      <main className="mx-auto p-4" style={{ maxWidth: isMobile ? "100%" : "800px" }}>
        {/* C-70 : entête en deux rangées propres — titre + retour ligne 1,
            sélecteurs et liens ligne 2 ; plus de débordement sur mobile. */}
        <header className="sticky z-20 mb-2.5 grid gap-2 bg-background py-2" style={{ top: "var(--nav-h, 2.9rem)" }}>
          <div className="flex min-w-0 items-center gap-2">
            <Link to="/" aria-label="Retour à la liste" className="shrink-0 text-lg no-underline">←</Link>
            <h1 className="m-0 min-w-0 flex-1 truncate text-base">
              {wf.title} <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.8em]">{wf.reference}</code>
            </h1>
            {versionParam && (
              <span className="shrink-0 rounded bg-accent px-2 py-0.5 text-sm font-semibold text-foreground">
                V{versionParam} (publiée)
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Select
              value={String(activeStep)}
              onChange={(e) => {
                const i = Number(e.target.value);
                if (Number.isNaN(i)) return;
                setActiveStep(i);
                setTimeout(() => { document.getElementById(`etape-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
              }}
              aria-label="Étape affichée — choisir pour y aller"
              title="Étape active — choisir pour y aller"
              className="m-0 w-auto min-w-0 max-w-[45%] flex-[0_1_9rem] px-1.5 py-1 text-sm font-semibold"
            >
              {wf.steps.map((s, i) => (
                <option key={s.id} value={i}>{i === activeStep ? "▶ " : ""}{i + 1}. {s.title}</option>
              ))}
            </Select>
            {versions.length > 0 && (
              <Select
                value={versionParam ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchParams(v ? { version: v } : {});
                  window.scrollTo({ top: 0 });
                }}
                aria-label="Consulter une version publiée"
                className="m-0 w-auto min-w-0 max-w-[45%] px-1.5 py-1 text-sm font-semibold"
              >
                <option value="">{wf.state === "draft" ? "Brouillon (non publié)" : "Dernier état"}</option>
                {versions.map((v) => (
                  <option key={v.number} value={v.number}>V{v.number}{v.changelog ? ` — ${v.changelog.slice(0, 40)}${v.changelog.length > 40 ? "…" : ""}` : ""}</option>
                ))}
              </Select>
            )}
            <span className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
              <Link to={`/workflow/${wf.id}/guided`} aria-label="Mode lecture guidée" title="Lecture guidée : une étape par écran" className="inline-flex items-center gap-1 text-xs text-link no-underline"><BookOpen size={12} aria-hidden="true" /> Guidé</Link>
              <Link to={`/workflow/${wf.id}/qr`} aria-label="Vignette QR imprimable" title="Vignette QR imprimable" className="text-xs text-link no-underline">QR</Link>
              {user && user.role !== "reader" && (
                <Link to={`/workflow/${wf.id}/feedbacks`} aria-label="Remontées terrain de ce mode opératoire" title="Remontées terrain : à traiter et historique" className="inline-flex items-center gap-1 text-xs text-link no-underline"><Flag size={12} aria-hidden="true" /> Terrain</Link>
              )}
            </span>
          </div>
        </header>
        {/* C-70 : un brouillon ne doit plus passer pour « le dernier état » —
            bandeau explicite + action vers la dernière version publiée. */}
        {wf.state === "draft" && !versionParam && (
          <Alert variant="warn" title="Brouillon de travail — ce mode opératoire n'est pas publié">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">
                {wf.current_version && wf.current_version > 0
                  ? `Vous consultez la version de travail. Dernière version publiée : V${wf.current_version}.`
                  : "Vous consultez la version de travail — aucune version n'a encore été publiée."}
              </span>
              {wf.current_version && wf.current_version > 0 && (
                <Button size="sm" variant="outline" onClick={() => setSearchParams({ version: String(wf.current_version) })}>
                  Voir V{wf.current_version}
                </Button>
              )}
            </div>
          </Alert>
        )}
        {wf.state === "published" && (
          <p className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span>Version V{wf.current_version}{wf.category ? ` — ${wf.family || ""} ${wf.category}` : ""}</span>
            {wf.review_due && wf.review_due < today && (
              <Badge variant="error" title={`À revoir depuis le ${wf.review_due}`}>à revoir</Badge>
            )}
          </p>
        )}
        {feedbackNotice && (
          <p role={feedbackNotice.kind === "ok" ? "status" : "alert"} className={cn(
            "fixed bottom-4 left-1/2 z-[100] m-0 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-semibold shadow-lg",
            feedbackNotice.kind === "ok" ? "bg-ok-bg text-ok" : "bg-error-bg text-error"
          )}>{feedbackNotice.text}</p>
        )}
        {wf.steps.map((step, i) => (
          <article key={step.id} id={`etape-${i}`} className="mb-3 scroll-mt-32 rounded-lg bg-surface p-4 shadow-sm">
            <h2 className="mt-0 text-base font-semibold">{i + 1}. {step.title}</h2>
            {step.body && <p className="whitespace-pre-wrap break-words">{step.body}</p>}
            {step.pictos.length > 0 && (
              <p className="flex flex-wrap gap-1">
                {step.pictos.map((p, k) => (
                  <span key={k} className="rounded px-2 py-0.5 text-sm font-semibold" style={{ background: `${p.color}22`, borderLeft: `4px solid ${p.color}` }}>
                    <TriangleAlert size={12} aria-hidden="true" /> {p.label}
                  </span>
                ))}
              </p>
            )}
            {step.photos.length > 0 && (
              <div className="grid gap-2.5">
                <StepCanvasView photos={step.photos ?? []} shapes={step.canvas ?? []} />
              </div>
            )}
            {feedbackOpenStep === step.id ? (
              <div className="mt-2.5 grid gap-1.5">
                <Textarea value={feedbackMsg} onChange={(e) => setFeedbackMsg(e.target.value)} rows={2} placeholder="Décrivez le problème (photo floue, étape manquante, outillage…)" className="p-2" aria-label="Votre signalement" />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setFeedbackOpenStep(null); setFeedbackMsg(""); }}>Annuler</Button>
                  <Button
                    size="sm"
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
                  >Envoyer</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setFeedbackOpenStep(step.id); setFeedbackMsg(""); }} className="mt-2.5 border-0 bg-transparent p-0 text-xs text-muted-foreground underline">Signaler un problème sur cette étape</button>
            )}
          </article>
        ))}
        {/* C-70 : retour au début FIXE — toujours atteignable, même en bas
            d'un long document. */}
        <Button
          variant="outline"
          size="icon"
          aria-label="Retour au début du document"
          title="Retour au début"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-4 right-4 z-40 size-11 rounded-full bg-surface shadow-lg"
        >
          <ArrowUp size={20} aria-hidden="true" />
        </Button>
        {user && user.role !== "reader" && wf.state === "published" && (
          <p className="mt-4 text-center">
            <a href={api.exportUrl(wf.id)} className="inline-flex items-center gap-1 text-link"><Download size={14} aria-hidden="true" /> Exporter en .docx</a>
          </p>
        )}
      </main>
    </>
  );
}
