import { useEffect, useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { api, ApiError, type StepComment } from "./api";
import { useAuth } from "./auth-context";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/input";

// C-96 (V12 #7) : commentaires de rédaction entre auteurs, par étape.
// Section interne de l'éditeur — jamais publiée : absente du snapshot,
// du lecteur, de l'export docx et du MCP. Suppression par l'auteur du
// commentaire ou un admin.
export default function StepComments({ stepId }: { stepId: number }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<StepComment[]>([]);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.listStepComments(stepId)
      .then((cs) => { if (alive) setComments(cs); })
      .catch(() => { if (alive) setComments([]); });
    return () => { alive = false; };
  }, [stepId]);

  async function add() {
    const message = draft.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api.addStepComment(stepId, message);
      setComments((arr) => [...arr, c]);
      setDraft("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: number) {
    setError(null);
    try {
      await api.deleteStepComment(stepId, commentId);
      setComments((arr) => arr.filter((c) => c.id !== commentId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Suppression impossible");
    }
  }

  return (
    <section className="grid gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-2" aria-label="Commentaires de rédaction (auteurs)">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-left text-sm font-semibold text-foreground"
      >
        <MessageSquare size={14} aria-hidden="true" />
        Commentaires auteurs{comments.length > 0 ? " (" + comments.length + ")" : ""}
      </button>
      {open && (
        <>
          {comments.length === 0 && (
            <p className="m-0 text-xs text-muted-foreground">Notes internes entre auteurs — jamais visibles des lecteurs ni des exports.</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-2 rounded bg-surface px-2 py-1.5 text-sm">
              <p className="m-0 min-w-0">
                <span className="font-semibold">{c.by}</span>{" "}
                <span className="text-xs text-muted-foreground">{c.at}</span>
                <br />
                {c.message}
              </p>
              {(user?.email === c.by || user?.role === "admin") && (
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  aria-label={"Supprimer le commentaire de " + c.by}
                  title="Supprimer ce commentaire"
                  className="shrink-0 text-muted-foreground hover:text-error"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {error && <p role="alert" className="m-0 text-xs text-error">{error}</p>}
          <div className="grid gap-1.5">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={1000}
              className="min-h-0"
              placeholder="Note pour les auteurs — ex. : photo à refaire, consigne à vérifier…"
              aria-label="Nouveau commentaire de rédaction"
            />
            <div>
              <Button onClick={() => void add()} disabled={busy || !draft.trim()} size="sm" variant="outline">Ajouter</Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
