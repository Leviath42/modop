import StepCanvasView from "../step-canvas-view";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError, type AppSettings, type WorkflowDetail } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";
import { Button } from "../components/ui/button";
import { Alert } from "../components/ui/dialog";
import { Select, Textarea } from "../components/ui/input";
import { cn } from "../lib/utils";
import { ArrowUp, BookOpen, Download, Flag, Pencil, TriangleAlert } from "lucide-react";

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
  // C-83 : paramètre « sans date = à revoir » — la raison du signalement
  // dépend du réglage applicatif.
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    api.getSettings().then(setAppSettings).catch(() => { /* défauts conservés */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let w: WorkflowDetail;
        if (versionParam === "draft") {
          w = await api.getWorkflow(id!);
        } else if (versionParam) {
          w = await api.getVersion(id!, Number(versionParam));
        } else {
          // C-71 (#4) : « dernier état » = DERNIER PUBLIÉ — le brouillon
          // n'est plus la vue par défaut ; il reste accessible aux auteurs
          // via l'option dédiée du sélecteur de versions.
          const vs = await api.versions(Number(id!)).catch(() => []);
          w = vs.length > 0 ? await api.getVersion(id!, vs[0].number) : await api.getWorkflow(id!);
        }
        if (!cancelled) { setWf(w); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Erreur de chargement");
      }
    })();
    return () => { cancelled = true; };
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
            {versionParam && versionParam !== "draft" && (
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
                <option value="">{versions.length > 0 ? `Dernier publié (V${versions[0].number})` : "Brouillon (non publié)"}</option>
                {user && user.role !== "reader" && (
                  <option value="draft">Brouillon en cours</option>
                )}
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
              {user && user.role !== "reader" && (
                <Link to={`/workflow/${wf.id}/edit`} aria-label="Modifier ce mode opératoire" title="Modifier ce mode opératoire" className="inline-flex items-center gap-1 text-xs text-link no-underline"><Pencil size={12} aria-hidden="true" /> Éditer</Link>
              )}
              {user && user.role !== "reader" && wf.state === "published" && (
                // C-81 : l'export vit avec les autres outils de l'entête —
                // plus de lien isolé en bas d'un long document.
                <a href={api.exportUrl(wf.id, versionParam && versionParam !== "draft" ? Number(versionParam) : undefined)} aria-label="Exporter en .docx" title="Exporter la version affichée en .docx" className="inline-flex items-center gap-1 text-xs text-link no-underline"><Download size={12} aria-hidden="true" /> Exporter</a>
              )}
            </span>
          </div>
        </header>
        {/* C-71 (#4) : le brouillon n'apparaît qu'à la demande explicite
            (option « Brouillon en cours », auteurs). */}
        {versionParam === "draft" && wf.state === "draft" && (
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
            {/* C-84 : date de revue et responsable portés par la version
                publiée (snapshot) — ils ne « sautent » plus selon l'état
                du brouillon courant. */}
            {wf.review_due && (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">À revoir le {wf.review_due.split("-").reverse().join("/")}</span>
            )}
            {(wf.owner_name || wf.owner_email) && (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">Responsable : {wf.owner_name || wf.owner_email}</span>
            )}
          </p>
        )}
        {/* C-83 : le signalement « à revoir » explique POURQUOI (date
            dépassée, avec la date, ou absence de date selon le paramètre)
            et propose d'ouvrir la mise à jour (auteurs). */}
        {wf.state === "published" && (wf.review_due
          ? wf.review_due < today
          : (appSettings?.no_review_date_is_overdue ?? true)) && (
          <Alert variant="warn" title="Ce mode opératoire est à revoir" className="mb-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">
                {wf.review_due
                  ? `La date de revue est dépassée depuis le ${wf.review_due.split("-").reverse().join("/")}.`
                  : "Aucune date de revue n'est définie pour ce document."}
              </span>
              {user && user.role !== "reader" && (
                <Link
                  to={`/workflow/${wf.id}/edit?revue=1`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground no-underline"
                  title="Ouvrir le mode opératoire sur le champ de revue"
                ><Pencil size={12} aria-hidden="true" /> Mettre à jour la revue</Link>
              )}
            </div>
          </Alert>
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
              <div className="mb-1.5 grid gap-1.5">
                {step.pictos.map((p, k) => (
                  <p key={k} className="m-0 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-foreground" style={{ background: `${p.color}1f`, borderLeft: `5px solid ${p.color}` }}>
                    <TriangleAlert size={16} aria-hidden="true" style={{ color: p.color }} /> {p.label}
                  </p>
                ))}
              </div>
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
      </main>
    </>
  );
}
