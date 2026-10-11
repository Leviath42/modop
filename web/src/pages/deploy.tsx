import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";

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
      <main style={{ maxWidth: "720px", minWidth: 0, width: "100%", margin: "0 auto", padding: "1rem", boxSizing: "border-box" }}>
        <section style={{ background: "white", borderRadius: "10px", padding: "1.2rem", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", display: "grid", gap: "1rem", minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>Déploiement</h1>

          {!status ? (
            <p style={{ color: "#666" }}>Chargement de l'état…</p>
          ) : (
            <>
              <div>
                <p style={{ margin: "0.2rem 0" }}>
                  Version chargée : <code style={{ background: "#eef0f4", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>{status.currentCommit ?? "inconnu"}</code>
                  {status.commitAuthor && <span style={{ color: "#666" }}> — {status.commitAuthor}</span>}
                </p>
                {status.commitSubject && <p style={{ margin: "0.2rem 0", fontWeight: 600 }}>{status.commitSubject}</p>}
                {status.commitDate && <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>Daté du {formatDateTime(status.commitDate)}</p>}
              </div>

              {isAdmin ? (
                <div style={{ borderTop: "1px solid #eee", paddingTop: "0.8rem", display: "grid", gap: "0.6rem" }}>
                  <h2 style={{ margin: 0, fontSize: "1rem" }}>Actions</h2>
                  {!confirming && (
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button onClick={() => setConfirming("update")} disabled={running} style={primaryBtn}>
                        {running ? "Déploiement en cours…" : "Mettre à jour depuis GitHub"}
                      </button>
                      <button onClick={() => setConfirming("rollback")} disabled={running} style={secondaryBtn}>
                        Retour arrière (base)
                      </button>
                    </div>
                  )}
                  {confirming && (
                    <div style={{ border: "1px solid #c9ccd3", borderRadius: "8px", padding: "0.8rem", display: "grid", gap: "0.6rem" }}>
                      <p style={{ margin: 0, fontSize: "0.9rem" }}>
                        {confirming === "update"
                          ? "Mettre à jour l'application depuis GitHub (branche configurée sur ce serveur : beta) ? Une sauvegarde de la base est faite avant ; le serveur redémarre pendant l'opération."
                          : "Restaurer la dernière sauvegarde de la base ? Les données créées depuis seront perdues. Le code reste à la version courante."}
                      </p>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button onClick={() => void trigger(confirming)} style={primaryBtn}>Confirmer</button>
                        <button onClick={() => setConfirming(null)} style={secondaryBtn}>Annuler</button>
                      </div>
                    </div>
                  )}
                  {feedback && (
                    <p style={{ margin: 0, color: feedback.success ? "#1d6b2e" : "#b30000", fontSize: "0.9rem" }}>
                      {feedback.message}
                    </p>
                  )}
                </div>
              ) : (
                <p style={{ borderTop: "1px solid #eee", paddingTop: "0.8rem", color: "#888", fontSize: "0.85rem", margin: 0 }}>
                  Seul un administrateur peut déclencher une mise à jour ou un retour arrière.
                </p>
              )}

              {status.recentCommits.length > 0 && (
                <div style={{ borderTop: "1px solid #eee", paddingTop: "0.8rem" }}>
                  <h2 style={{ margin: "0 0 0.4rem", fontSize: "0.95rem" }}>Historique récent</h2>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.2rem" }}>
                    {status.recentCommits.map((c) => {
                      const isCurrent = status.currentCommit !== null && c.hash.startsWith(status.currentCommit);
                      return (
                        <li key={c.hash} style={{ fontSize: "0.82rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", color: isCurrent ? "#1a1c20" : "#777", fontWeight: isCurrent ? 600 : 400 }}>
                          <code>{c.hash}</code>
                          <span style={{ flex: 1, minWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</span>
                          {isCurrent && <span style={{ color: "#1d6b2e", fontSize: "0.75rem" }}>(chargé)</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div style={{ borderTop: "1px solid #eee", paddingTop: "0.8rem", fontSize: "0.85rem", color: "#666" }}>
                <strong>Dernier déploiement :</strong> {lastRunLabel} démarré le {formatDateTime(status.startedAt)}
                {status && !status.running && status.exitCode !== null
                  ? status.exitCode === 0
                    ? " — terminé avec succès"
                    : ` — échec (code ${status.exitCode})`
                  : status?.running
                    ? " — en cours"
                    : ""}
                {connectionLost && (
                  <p style={{ color: "#b8860b", margin: "0.3rem 0 0" }}>
                    Serveur momentanément injoignable (redémarrage en cours ?), nouvelle tentative…
                  </p>
                )}
              </div>

              {status.logTail && (
                <div style={{ borderTop: "1px solid #eee", paddingTop: "0.8rem" }}>
                  <h2 style={{ margin: "0 0 0.4rem", fontSize: "0.95rem" }}>Journal</h2>
                  <div className="modop-log" style={{ background: "#f2f3f5", borderRadius: "8px", padding: "0.8rem", fontSize: "0.75rem", height: "260px", overflowY: "auto", fontFamily: "monospace", width: "100%", boxSizing: "border-box" }}>
                    {status.logTail}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
        {user && <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#999" }}>Connecté en tant que {user.email} ({user.role})</p>}
      </main>
    </>
  );
}

const primaryBtn: React.CSSProperties = { padding: "0.6rem 1rem", borderRadius: "6px", border: "none", background: "#1f4e9c", color: "white", fontSize: "0.95rem" };
const secondaryBtn: React.CSSProperties = { padding: "0.6rem 1rem", borderRadius: "6px", border: "1px solid #c9ccd3", background: "white", fontSize: "0.95rem" };
