import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type WorkflowDetail } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";
import { Badge } from "../components/ui/badge";
import { Button, buttonVariants } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";
import { Check } from "lucide-react";

// C-35 : historique complet des remontées terrain d'un mode opératoire —
// page dédiée (auteur+). Le lecteur n'affiche plus la section : seul un
// compteur discret y renvoie. Ici : à traiter d'abord, puis l'historique
// des signalements résolus.

interface Feedback {
  id: number;
  by: string;
  step_id: number;
  message: string;
  status: "open" | "resolved";
  resolved_by: string | null;
  resolved_at: string | null;
  at: string;
}

export default function FeedbacksPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.getWorkflow(id!)
      .then((w) => setWf(w))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
    api.listFeedback(Number(id))
      .then(setFeedbacks)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [id]);

  async function resolve(fb: Feedback) {
    try {
      await api.resolveFeedback(wf!.id, fb.id);
      setFeedbacks((arr) => arr.map((x) => (x.id === fb.id ? { ...x, status: "resolved" as const, resolved_by: user?.email ?? null, resolved_at: new Date().toISOString() } : x)));
      setNotice({ kind: "ok", text: "Signalement marqué résolu" });
      setTimeout(() => setNotice(null), 2500);
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Résolution impossible" });
      setTimeout(() => setNotice(null), 2500);
    }
  }

  if (error) return (<><NavBar /><main className="p-8"><p role="alert" className="text-error">{error}</p><Link to={`/workflow/${id}/read`}>Retour</Link></main></>);
  if (!wf) return (<><NavBar /><main className="p-8">Chargement…</main></>);

  const stepNumber = (stepId: number) => {
    const i = wf.steps.findIndex((s) => s.id === stepId);
    return i >= 0 ? i + 1 : null;
  };
  const open = feedbacks.filter((f) => f.status === "open");
  const resolved = feedbacks.filter((f) => f.status === "resolved");

  const card = (f: Feedback, canAct: boolean) => (
    <li key={f.id}>
      <Card className={cn("grid gap-1 p-3", f.status === "resolved" && "opacity-60")}>
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm">Étape {stepNumber(f.step_id) ?? "?"}</strong>
          {f.status === "open"
            ? <Badge variant="warn">à traiter</Badge>
            : <Badge variant="ok">résolu{f.resolved_by ? ` par ${f.resolved_by}` : ""}</Badge>}
        </div>
        <div className="text-sm break-words">« {f.message} »</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{f.by}, {f.at}</span>
          {canAct && f.status === "open" && (
            <>
              <Link to={`/workflow/${wf.id}/edit`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "no-underline")}>Corriger l'étape</Link>
              <Button size="sm" onClick={() => void resolve(f)}><Check size={14} aria-hidden="true" /> Résoudre</Button>
            </>
          )}
        </div>
      </Card>
    </li>
  );

  return (
    <>
      <NavBar />
      <main className="mx-auto grid w-full max-w-[820px] gap-4 p-4">
        <header className="flex flex-wrap items-center gap-2">
          <Link to={`/workflow/${wf.id}/read`} aria-label="Retour à la lecture" className="shrink-0 text-lg no-underline">←</Link>
          <h1 className="m-0 min-w-[120px] flex-1 truncate text-base">
            Remontées terrain — {wf.title} <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">{wf.reference}</code>
          </h1>
        </header>

        {notice && (
          <p role={notice.kind === "ok" ? "status" : "alert"} className={cn("m-0 rounded-md px-2.5 py-1.5 text-sm font-semibold", notice.kind === "ok" ? "bg-ok-bg text-ok" : "bg-error-bg text-error")}>{notice.text}</p>
        )}

        <section aria-label="À traiter" className="grid gap-2">
          <h2 className="m-0 flex items-center gap-2 text-base">À traiter <Badge variant="error">{open.length}</Badge></h2>
          {open.length === 0 ? (
            <p className="m-0 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">Aucune remontée à traiter — tout est lu</p>
          ) : (
            <ul className="grid gap-2">
              {open.map((f) => card(f, user?.role !== "reader"))}
            </ul>
          )}
        </section>

        <section aria-label="Historique des signalements traités" className="grid gap-2">
          <h2 className="m-0 flex items-center gap-2 text-base">Traitées <Badge variant="ok">{resolved.length}</Badge></h2>
          {resolved.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Aucun signalement traité pour l'instant.</p>
          ) : (
            <ul className="grid gap-2">
              {resolved.map((f) => card(f, false))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
