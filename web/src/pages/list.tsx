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
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function onSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(value), 250);
  }
  useEffect(() => {
    let cancelled = false;
    api.listWorkflows({ search, state, family, sort: sort || undefined, review: overdueOnly ? "overdue" : undefined })
      .then((wfs) => { if (!cancelled) { setWorkflows(wfs); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.message : "Erreur de chargement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, state, family, sort, overdueOnly]);

  useEffect(() => {
    api.listWorkflows()
      .then((wfs) => {
        const set = new Set(wfs.map((w) => w.family).filter(Boolean));
        setFamilies([...set].sort());
      })
      .catch(() => { /* filtre famille optionnel */ });
  }, []);

  const activeFilters = [state, family, overdueOnly ? "1" : "", sort].filter(Boolean).length;

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: "800px", width: "100%", margin: "0 auto", padding: "1rem", boxSizing: "border-box" }}>
        <h1>Modes opératoires</h1>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem" }}>
          <input
            type="search"
            placeholder="Rechercher (titre, référence)…"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ flex: 1, minWidth: 0, padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)" }}
            aria-label="Rechercher un mode opératoire"
          />
          <button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-haspopup="true"
            title="Filtres et tri"
            style={{ padding: "0.5rem 0.8rem", borderRadius: "6px", border: showFilters ? "1px solid var(--accent)" : "1px solid var(--border)", background: showFilters ? "var(--accent-bg)" : "var(--surface)", color: "var(--text)", fontSize: "0.9rem", flexShrink: 0, cursor: "pointer" }}
          >Filtres{activeFilters > 0 ? ` (${activeFilters})` : ""}</button>
          {user && user.role !== "reader" && (
            <Link to="/workflow/new/edit" aria-label="Créer un mode opératoire" style={{ padding: "0.5rem 0.8rem", background: "var(--accent)", color: "white", borderRadius: "6px", textDecoration: "none", flexShrink: 0 }}>
              +
            </Link>
          )}
        </div>
        {showFilters && (
          <section aria-label="Filtres et tri" style={{ background: "var(--surface)", borderRadius: "8px", padding: "0.7rem 0.9rem", marginBottom: "0.8rem", display: "grid", gap: "0.5rem", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                État
                <select value={state} onChange={(e) => setState(e.target.value)} style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} aria-label="Filtrer par état">
                  <option value="">Tous</option>
                  <option value="published">Publiés</option>
                  <option value="draft">Brouillons</option>
                </select>
              </label>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Famille
                <select value={family} onChange={(e) => setFamily(e.target.value)} style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", maxWidth: "40vw" }} aria-label="Filtrer par famille">
                  <option value="">Toutes</option>
                  {families.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Trier par
                <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} aria-label="Trier">
                  <option value="">Modifié récemment</option>
                  <option value="title">Titre A→Z</option>
                  <option value="reference">Référence</option>
                  <option value="family">Famille</option>
                  <option value="updated_at">Date de mise à jour</option>
                </select>
              </label>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem", color: overdueOnly ? "var(--warn-text)" : "var(--text-muted)", fontWeight: overdueOnly ? 600 : 400, cursor: "pointer" }}>
                <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
                À revoir
              </label>
              {activeFilters > 0 && (
                <button
                  onClick={() => { setState(""); setFamily(""); setOverdueOnly(false); setSort(""); }}
                  style={{ marginLeft: "auto", fontSize: "0.8rem", padding: "0.3rem 0.7rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer" }}
                >Effacer</button>
              )}
            </div>
          </section>
        )}
        {error && <p role="alert" style={{ color: "var(--error-text)" }}>{error}</p>}
        {loading ? (
          <p>Chargement…</p>
        ) : workflows.length === 0 ? (
          <p>Aucun mode opératoire.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem" }}>
            {workflows.map((wf) => (
              <li key={wf.id} style={{ background: "var(--surface)", borderRadius: "8px", padding: "0.45rem 0.7rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Link to={`/workflow/${wf.id}/read`} style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none", fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                    {wf.title}
                  </Link>
                  <code style={{ background: "var(--surface-2)", padding: "0.05rem 0.35rem", borderRadius: "4px", fontSize: "0.75rem", flexShrink: 0 }}>{wf.reference}</code>
                  {user && user.role !== "reader" && (
                    <Link to={`/workflow/${wf.id}/edit`} aria-label={`Modifier ${wf.title}`} title="Modifier" style={{ fontSize: "0.85rem", color: "var(--text-muted)", textDecoration: "none", flexShrink: 0 }}>✎</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

const secondaryBtn: React.CSSProperties = { padding: "0.5rem 0.9rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" };
const primaryBtn: React.CSSProperties = { padding: "0.5rem 0.9rem", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white" };

// Modale de confirmation de suppression — focus piégé, Échap pour fermer,
// focus rendu au bouton Supprimer à l'ouverture (accessibilité clavier, I4).\n