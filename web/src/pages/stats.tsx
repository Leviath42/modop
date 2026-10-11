import { useEffect, useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";

interface Stats {
  workflows: number;
  published: number;
  users: number;
  exports: number;
  logins: number;
  views: number;
  topViewed: { target: string; n: number }[];
  topExported: { target: string; n: number }[];
  topPublishers: { actor_email: string; n: number }[];
  recentActivity: { actor_email: string; action: string; target: string; at: string }[];
}

// RF-77 — page statistiques admin : usage global et par document,
// pour prioriser les mises à jour (documents les plus consultés, à revoir).
export default function StatsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new ApiError(r.status, "forbidden", "Accès refusé"))))
      .then(setStats)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [isAdmin]);

  if (!isAdmin) return (<><NavBar /><main style={{ padding: "2rem" }}><p>Seul un administrateur peut voir les statistiques.</p></main></>);
  if (error) return (<><NavBar /><main style={{ padding: "2rem" }}><p role="alert" style={{ color: "var(--error-text)" }}>{error}</p></main></>);
  if (!stats) return (<><NavBar /><main style={{ padding: "2rem" }}>Chargement…</main></>);

  const cards: { label: string; value: number }[] = [
    { label: "Modes opératoires", value: stats.workflows },
    { label: "Publiés", value: stats.published },
    { label: "Comptes actifs", value: stats.users },
    { label: "Consultations", value: stats.views },
    { label: "Exports DOCX", value: stats.exports },
    { label: "Connexions", value: stats.logins },
  ];

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: "820px", margin: "0 auto", padding: "1rem", display: "grid", gap: "1rem" }}>
        <h1 style={{ margin: 0 }}>Statistiques</h1>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))", gap: "0.6rem" }} aria-label="Chiffres clés">
          {cards.map((c) => (
            <div key={c.label} style={{ background: "var(--surface)", borderRadius: "10px", padding: "0.8rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "grid", gap: "0.2rem" }}>
              <span style={{ fontSize: "1.6rem", fontWeight: 700 }}>{c.value}</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{c.label}</span>
            </div>
          ))}
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))", gap: "0.6rem" }}>
          <div style={{ background: "var(--surface)", borderRadius: "10px", padding: "0.8rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ margin: "0 0 0.4rem", fontSize: "0.95rem" }}>Les plus consultés</h2>
            <ol style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.9rem", display: "grid", gap: "0.2rem" }}>
              {stats.topViewed.length === 0 && <li style={{ color: "var(--text-muted)" }}>Aucune consultation</li>}
              {stats.topViewed.map((t) => <li key={t.target}>{t.target.replace("workflow:", "MO #")} — {t.n} vues</li>)}
            </ol>
          </div>
          <div style={{ background: "var(--surface)", borderRadius: "10px", padding: "0.8rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ margin: "0 0 0.4rem", fontSize: "0.95rem" }}>Les plus exportés</h2>
            <ol style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.9rem", display: "grid", gap: "0.2rem" }}>
              {stats.topExported.length === 0 && <li style={{ color: "var(--text-muted)" }}>Aucun export</li>}
              {stats.topExported.map((t) => <li key={t.target}>{t.target.replace("workflow:", "MO #")} — {t.n}</li>)}
            </ol>
          </div>
          <div style={{ background: "var(--surface)", borderRadius: "10px", padding: "0.8rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ margin: "0 0 0.4rem", fontSize: "0.95rem" }}>Auteurs les plus actifs</h2>
            <ol style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.9rem", display: "grid", gap: "0.2rem" }}>
              {stats.topPublishers.length === 0 && <li style={{ color: "var(--text-muted)" }}>Aucune publication</li>}
              {stats.topPublishers.map((t) => <li key={t.actor_email}>{t.actor_email} — {t.n}</li>)}
            </ol>
          </div>
        </section>
        <section style={{ background: "var(--surface)", borderRadius: "10px", padding: "0.8rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 style={{ margin: "0 0 0.4rem", fontSize: "0.95rem" }}>Activité récente</h2>
          <ul style={{ margin: 0, paddingLeft: "0", listStyle: "none", fontSize: "0.85rem", display: "grid", gap: "0.25rem" }}>
            {stats.recentActivity.map((a, i) => (
              <li key={i} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ color: "var(--text-muted)" }}>{a.at}</span>
                <strong>{a.actor_email}</strong>
                <span>{a.action}{a.target ? ` → ${a.target}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
