import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth-context";
import NavBar from "../nav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

interface CommitSummary {
  hash: string;
  subject: string;
  author: string;
  date: string;
}

interface DeployStatus {
  isAdmin: boolean;
  currentCommit: string | null;
  commitSubject: string | null;
  commitAuthor: string | null;
  commitDate: string | null;
  recentCommits: CommitSummary[];
  running: boolean;
  mode: "update" | "rollback" | null;
  startedAt: string | null;
  exitCode: number | null;
  finishedAt: string | null;
  logTail: string | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function DeployPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [confirming, setConfirming] = useState<"update" | "rollback" | null>(null);
  const isAdmin = status?.isAdmin ?? false;

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/deploy/status");
      if (res.ok) {
        setStatus(await res.json());
        setConnectionLost(false);
      } else if (res.status === 401) {
        setConnectionLost(true);
      }
    } catch {
      setConnectionLost(true);
    }
  }, []);

  // Polling adaptatif : serré pendant un déploiement, espacé au repos.
  useEffect(() => {
    void poll();
    const timer = setInterval(poll, status?.running ? 1500 : 30000);
    return () => clearInterval(timer);
  }, [poll, status?.running]);

  async function trigger(mode: "update" | "rollback") {
    setConfirming(null);
    setFeedback({ success: true, message: "Déclenchement en cours..." });
    try {
      const res = await fetch("/api/deploy/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = await res.json();
      setFeedback({ success: res.ok, message: body.message ?? "Réponse inattendue" });
      void poll();
    } catch {
      setFeedback({ success: false, message: "Échec de l'appel au serveur — réessayez" });
    }
  }

  const running = status?.running ?? false;
  const lastRunLabel =
    status?.mode === "rollback" ? "Retour arrière" : status?.mode === "update" ? "Mise à jour" : "—";

  return (
    <>
      <NavBar />
      <main className="mx-auto box-border w-full min-w-0 max-w-[720px] p-4">
        <section className="grid min-w-0 gap-4 rounded-lg bg-surface p-5 shadow-sm">
          <h1 className="m-0 text-lg font-semibold">Déploiement</h1>

          {!status ? (
            <p className="text-muted-foreground">Chargement de l'état…</p>
          ) : (
            <>
              <div className="min-w-0">
                <p className="my-1 min-w-0">
                  Version chargée : <code className="rounded-md bg-surface-2 px-1.5 py-0.5">{status.currentCommit ?? "inconnu"}</code>
                  {status.commitAuthor && <span className="text-muted-foreground"> — {status.commitAuthor}</span>}
                </p>
                {status.commitSubject && <p className="my-1 min-w-0 font-semibold">{status.commitSubject}</p>}
                {status.commitDate && <p className="m-0 text-sm text-muted-foreground">Daté du {formatDateTime(status.commitDate)}</p>}
              </div>

              {isAdmin ? (
                <div className="grid gap-2.5 border-t border-border-soft pt-3">
                  <h2 className="m-0 text-base font-semibold">Actions</h2>
                  {!confirming && (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setConfirming("update")} disabled={running}>
                        {running ? "Déploiement en cours…" : "Mettre à jour depuis GitHub"}
                      </Button>
                      <Button variant="destructive" onClick={() => setConfirming("rollback")} disabled={running}>
                        Retour arrière (base)
                      </Button>
                    </div>
                  )}
                  {confirming && (
                    <div className="grid gap-2.5 rounded-lg border border-border p-3">
                      <p className="m-0 text-sm">
                        {confirming === "update"
                          ? "Mettre à jour l'application depuis GitHub (branche configurée sur ce serveur : beta) ? Une sauvegarde de la base est faite avant ; le serveur redémarre pendant l'opération."
                          : "Restaurer la dernière sauvegarde de la base ? Les données créées depuis seront perdues. Le code reste à la version courante."}
                      </p>
                      <div className="flex gap-2">
                        <Button onClick={() => void trigger(confirming)}>Confirmer</Button>
                        <Button variant="outline" onClick={() => setConfirming(null)}>Annuler</Button>
                      </div>
                    </div>
                  )}
                  {feedback && (
                    <p className={cn("m-0 text-sm", feedback.success ? "text-ok" : "text-error")}>
                      {feedback.message}
                    </p>
                  )}
                </div>
              ) : (
                <p className="m-0 border-t border-border-soft pt-3 text-sm text-muted-foreground">
                  Seul un administrateur peut déclencher une mise à jour ou un retour arrière.
                </p>
              )}

              {status.recentCommits.length > 0 && (
                <div className="border-t border-border-soft pt-3">
                  <h2 className="mb-1.5">Historique récent</h2>
                  <ul className="grid gap-1">
                    {status.recentCommits.map((c) => {
                      const isCurrent = status.currentCommit !== null && c.hash.startsWith(status.currentCommit);
                      return (
                        <li
                          key={c.hash}
                          className={cn(
                            "flex min-w-0 flex-wrap gap-2 text-sm text-muted-foreground",
                            isCurrent && "font-semibold text-foreground"
                          )}
                        >
                          <code>{c.hash}</code>
                          <span className="min-w-[120px] flex-1 wrap-anywhere">{c.subject}</span>
                          {isCurrent && <span className="text-xs text-ok">(chargé)</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="border-t border-border-soft pt-3 text-sm text-muted-foreground">
                <strong>Dernier déploiement :</strong> {lastRunLabel} démarré le {formatDateTime(status.startedAt)}
                {status && !status.running && status.exitCode !== null
                  ? status.exitCode === 0
                    ? <Badge variant="ok" className="ml-1">terminé avec succès</Badge>
                    : <Badge variant="error" className="ml-1">échec (code {status.exitCode})</Badge>
                  : status?.running
                    ? <Badge variant="warn" className="ml-1">en cours</Badge>
                    : null}
                {connectionLost && (
                  <p className="mt-1 text-warn">
                    Serveur momentanément injoignable (redémarrage en cours ?), nouvelle tentative…
                  </p>
                )}
              </div>

              {status.logTail && (
                <div className="border-t border-border-soft pt-3">
                  <h2 className="mb-1.5">Journal</h2>
                  <pre className="m-0 box-border min-w-0 w-full max-w-full max-h-[260px] overflow-y-scroll overflow-x-hidden whitespace-pre-wrap break-all wrap-anywhere rounded-lg border border-border-soft bg-log px-3 py-3 font-mono text-sm leading-normal">
                    {status.logTail}
                  </pre>
                </div>
              )}
            </>
          )}
        </section>
        {user && <p className="text-center text-sm text-muted-foreground">Connecté en tant que {user.email} ({user.role})</p>}
      </main>
    </>
  );
}
