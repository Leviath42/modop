import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Workflow } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";

export default function ListPage() {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.listWorkflows({ search, state })
      .then((wfs) => { if (!cancelled) { setWorkflows(wfs); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.message : "Erreur de chargement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, state]);

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem" }}>
        <h1>Modes opératoires</h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <input
            type="search"
            placeholder="Rechercher (titre, référence)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: "200px", padding: "0.5rem", borderRadius: "6px", border: "1px solid #c9ccd3" }}
          />
          <select value={state} onChange={(e) => setState(e.target.value)} style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid #c9ccd3" }}>
            <option value="">Tous les états</option>
            <option value="published">Publiés</option>
            <option value="draft">Brouillons</option>
          </select>
          {user && user.role !== "reader" && (
            <Link to="/workflow/new/edit" style={{ padding: "0.5rem 0.8rem", background: "#1f4e9c", color: "white", borderRadius: "6px", textDecoration: "none" }}>
              + Créer
            </Link>
          )}
        </div>
        {error && <p role="alert" style={{ color: "#b30000" }}>{error}</p>}
        {loading ? (
          <p>Chargement…</p>
        ) : workflows.length === 0 ? (
          <p>Aucun mode opératoire.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem" }}>
            {workflows.map((wf) => (
              <li key={wf.id} style={{ background: "white", borderRadius: "8px", padding: "0.8rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <Link to={`/workflow/${wf.id}/read`} style={{ fontWeight: 600, color: "#1f4e9c", textDecoration: "none", fontSize: "1.05rem" }}>
                    {wf.title}
                  </Link>
                  <code style={{ background: "#eef0f4", padding: "0.1rem 0.4rem", borderRadius: "4px", fontSize: "0.85rem" }}>{wf.reference}</code>
                  <span style={{ marginLeft: "auto", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem", padding: "0.15rem 0.5rem", borderRadius: "99px", background: wf.state === "published" ? "#e2f2e5" : "#fdf3d7", color: wf.state === "published" ? "#1d6b2e" : "#8a6d1a" }}>
                      {wf.state === "published" ? `V${wf.current_version}` : "brouillon"}
                    </span>
                    {user && user.role !== "reader" && (
                      <Link to={`/workflow/${wf.id}/edit`} style={{ fontSize: "0.85rem", color: "#555" }}>Modifier</Link>
                    )}
                  </span>
                </div>
                {wf.category && <p style={{ margin: "0.2rem 0 0", color: "#666", fontSize: "0.9rem" }}>{wf.category}</p>}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
