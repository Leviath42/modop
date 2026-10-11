import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Workflow } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";

export default function ListPage() {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [family, setFamily] = useState("");
  const [families, setFamilies] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<Workflow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function onSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(value), 250);
  }
  useEffect(() => {
    let cancelled = false;
    api.listWorkflows({ search, state, family, review: overdueOnly ? "overdue" : undefined } as Partial<{ search: string; state: string; family: string; review: string }>)
      .then((wfs) => { if (!cancelled) { setWorkflows(wfs); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.message : "Erreur de chargement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, state, family]);

  useEffect(() => {
    api.listWorkflows()
      .then((wfs) => {
        const set = new Set(wfs.map((w) => w.family).filter(Boolean));
        setFamilies([...set].sort());
      })
      .catch(() => { /* filtre famille optionnel */ });
  }, []);

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: "800px", width: "100%", margin: "0 auto", padding: "1rem", boxSizing: "border-box" }}>
        <h1>Modes opératoires</h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <input
            type="search"
            placeholder="Rechercher (titre, référence)…"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ flex: "1 1 10rem", minWidth: 0, padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)" }}
          />
          <select value={family} onChange={(e) => setFamily(e.target.value)} style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)" }} aria-label="Filtrer par famille">
            <option value="">Toutes les familles</option>
            {families.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={state} onChange={(e) => setState(e.target.value)} style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)" }} aria-label="Filtrer par état">
            <option value="">Tous les états</option>
            <option value="published">Publiés</option>
            <option value="draft">Brouillons</option>
          </select>
          <button
            onClick={() => setOverdueOnly((v) => !v)}
            aria-pressed={overdueOnly}
            style={{ padding: "0.5rem 0.8rem", borderRadius: "6px", border: overdueOnly ? "1px solid var(--warn-text)" : "1px solid var(--border)", background: overdueOnly ? "var(--warn-bg)" : "var(--surface)", color: overdueOnly ? "var(--warn-text)" : "var(--text)", fontWeight: overdueOnly ? 600 : 400 }}
            title="Documents dont la date de revue est dépassée"
          >À revoir</button>
          {user && user.role !== "reader" && (
            <Link to="/workflow/new/edit" style={{ padding: "0.5rem 0.8rem", background: "var(--accent)", color: "white", borderRadius: "6px", textDecoration: "none" }}>
              + Créer
            </Link>
          )}
        </div>
        {error && <p role="alert" style={{ color: "var(--error-text)" }}>{error}</p>}
        {loading ? (
          <p>Chargement…</p>
        ) : workflows.length === 0 ? (
          <p>Aucun mode opératoire.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem" }}>
            {workflows.map((wf) => (
              <li key={wf.id} style={{ background: "var(--surface)", borderRadius: "8px", padding: "0.8rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <Link to={`/workflow/${wf.id}/read`} style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none", fontSize: "1.05rem" }}>
                    {wf.title}
                  </Link>
                  <code style={{ background: "var(--surface-2)", padding: "0.1rem 0.4rem", borderRadius: "4px", fontSize: "0.85rem" }}>{wf.reference}</code>
                  <span style={{ marginLeft: "auto", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem", padding: "0.15rem 0.5rem", borderRadius: "99px", background: wf.state === "published" ? "var(--ok-bg)" : "var(--warn-bg)", color: wf.state === "published" ? "var(--ok-text)" : "var(--warn-text)" }}>
                      {wf.state === "published" ? `V${wf.current_version}` : "brouillon"}
                    </span>
                    {wf.review_due && wf.review_due < new Date().toISOString().slice(0, 10) && (
                      <span title={`À revoir depuis le ${wf.review_due}`} style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "99px", background: "var(--error-bg)", color: "var(--error-text)", fontWeight: 600 }}>à revoir</span>
                    )}
                    {user && user.role !== "reader" && (
                      <>
                        <Link to={`/workflow/${wf.id}/edit`} style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Modifier</Link>
                        <button onClick={() => setConfirmDelete(wf)} style={{ fontSize: "0.85rem", color: "var(--error-text)", border: "none", background: "none" }}>Supprimer</button>
                      </>
                    )}
                  </span>
                </div>
                {(wf.family || wf.category) && (
                  <p style={{ margin: "0.2rem 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                    {wf.family && <span style={{ background: "var(--accent-bg)", color: "var(--accent)", padding: "0.1rem 0.5rem", borderRadius: "4px", fontSize: "0.8rem", marginRight: "0.3rem" }}>{wf.family}</span>}
                    {wf.category && <span style={{ background: "var(--surface-2)", padding: "0.1rem 0.5rem", borderRadius: "4px", fontSize: "0.8rem" }}>{wf.category}</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {confirmDelete && (
          <ConfirmDeleteDialog workflow={confirmDelete} onClose={() => setConfirmDelete(null)} onDelete={async (w) => { try { await api.deleteWorkflow(w.id); setConfirmDelete(null); setWorkflows((arr) => arr.filter((x) => x.id !== w.id)); } catch (e) { setError(e instanceof ApiError ? e.message : "Suppression impossible"); } }} />
          )}
      </main>
    </>
  );
}

const secondaryBtn: React.CSSProperties = { padding: "0.5rem 0.9rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" };
const primaryBtn: React.CSSProperties = { padding: "0.5rem 0.9rem", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white" };

// Modale de confirmation de suppression — focus piégé, Échap pour fermer,
// focus rendu au bouton Supprimer à l'ouverture (accessibilité clavier, I4).
function ConfirmDeleteDialog({ workflow, onClose, onDelete }: { workflow: Workflow; onClose: () => void; onDelete: (w: Workflow) => Promise<void> }) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>("button, a, input, select, textarea");
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 100 }} role="dialog" aria-modal="true" aria-label={`Supprimer ${workflow.title}`}>
      <div ref={dialogRef} style={{ background: "var(--surface)", color: "var(--text)", borderRadius: "10px", padding: "1.2rem", maxWidth: "400px", display: "grid", gap: "0.8rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Supprimer « {workflow.title} » ?</h2>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Toutes les étapes, photos, versions et exports seront définitivement supprimés. Cette action est irréversible.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "end" }}>
          <button ref={cancelRef} onClick={onClose} style={secondaryBtn}>Annuler</button>
          <button onClick={() => void onDelete(workflow)} style={{ ...primaryBtn, background: "var(--error-text)" }}>Supprimer définitivement</button>
        </div>
      </div>
    </div>
  );
}
