import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, ApiError, type ReviewComment } from "./api";
import { useAuth } from "./auth-context";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/input";

// V17 (B4) : panneau de relecture — fil de commentaires au niveau du MO pour
// la boucle brouillon → relecture → validé. Comme les commentaires d'étape
// (C-96) : jamais publiés (absents du snapshot, du lecteur, des exports et
// du MCP de lecture) ; suppression par l'auteur du commentaire ou un admin.
export default function ReviewPanel({ workflowId }: { workflowId: number }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.listReviewComments(workflowId)
      .then((cs) => { if (alive) setComments(cs); })
      .catch(() => { if (alive) setComments([]); });
    return () => { alive = false; };
  }, [workflowId]);

  async function add() {
    const message = draft.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api.addReviewComment(workflowId, message);
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
      await api.deleteReviewComment(workflowId, commentId);
      setComments((arr) => arr.filter((c) => c.id !== commentId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Suppression impossible");
    }
  }

  return (
    <section className="grid gap-1.5 rounded-lg border border-border bg-surface px-3 py-2" aria-label="Relecture du mode opératoire">
      <p className="m-0 text-xs text-muted-foreground">
        {comments.length === 0
          ? "Fil de relecture vide — notez les points à corriger ou le verdict (jamais visible des lecteurs ni des exports)."
          : comments.length + " message(s) de relecture — jamais visibles des lecteurs ni des exports."}
      </p>
      {comments.map((c) => (
        <div key={c.id} className="flex items-start justify-between gap-2 rounded bg-surface-2 px-2 py-1.5 text-sm">
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
          placeholder="Commentaire de relecture — ex. : étape 3 à reformuler, photo floue, verdict OK…"
          aria-label="Nouveau commentaire de relecture"
        />
        <div>
          <Button onClick={() => void add()} disabled={busy || !draft.trim()} size="sm" variant="outline">Envoyer</Button>
        </div>
      </div>
    </section>
  );
}
