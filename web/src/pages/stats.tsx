import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

interface Stats {
  workflows: number;
  published: number;
  users: number;
  exports: number;
  logins: number;
  views: number;
  topViewed: { target: string; n: number; label?: string | null }[];
  topExported: { target: string; n: number; label?: string | null }[];
  topPublishers: { actor_email: string; n: number }[];
  recentActivity: { actor_email: string; action: string; target: string; at: string; label?: string | null }[];
}

// RF-77 — page statistiques admin : usage global et par document,
// pour prioriser les mises à jour (documents les plus consultés, à revoir).
export default function StatsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

  const [audit, setAudit] = useState<{ id: number; actor_email: string; action: string; target: string; detail: string; at: string }[] | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    api.adminListAudit().then(setAudit).catch(() => { /* journal optionnel */ });
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new ApiError(r.status, "forbidden", "Accès refusé"))))
      .then(setStats)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, [isAdmin]);

  if (!isAdmin) return (<><NavBar /><main className="p-8"><p>Seul un administrateur peut voir les statistiques.</p></main></>);
  if (error) return (<><NavBar /><main className="p-8"><p role="alert" className="text-error">{error}</p></main></>);
  if (!stats) return (<><NavBar /><main className="p-8">Chargement…</main></>);

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
      <main className="mx-auto grid max-w-[820px] grid-cols-1 gap-4 p-4">
        <h1 className="text-lg font-semibold tracking-tight">Statistiques</h1>
        <section className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2" aria-label="Chiffres clés">
          {cards.map((c) => (
            <Card key={c.label} className="p-3 sm:p-3">
              <CardHeader className="gap-1 p-0 sm:gap-1 sm:p-0">
                <CardTitle className="text-2xl font-bold">{c.value}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-0">
                <CardDescription className="text-xs">{c.label}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </section>
        <section className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-2">
          <Card>
            <CardHeader className="px-4 py-3 pb-0 sm:px-4 sm:py-3 sm:pb-0">
              <CardTitle>Les plus consultés</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-3 sm:px-4 sm:py-3">
              <ol className="m-0 grid gap-1 pl-5 text-sm">
                {stats.topViewed.length === 0 && <li className="text-muted-foreground">Aucune consultation</li>}
                {stats.topViewed.map((t) => <li key={t.target} className="min-w-0 break-words">{t.label || t.target.replace("workflow:", "MO #")} — {t.n} vues</li>)}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="px-4 py-3 pb-0 sm:px-4 sm:py-3 sm:pb-0">
              <CardTitle>Les plus exportés</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-3 sm:px-4 sm:py-3">
              <ol className="m-0 grid gap-1 pl-5 text-sm">
                {stats.topExported.length === 0 && <li className="text-muted-foreground">Aucun export</li>}
                {stats.topExported.map((t) => <li key={t.target} className="min-w-0 break-words">{t.label || t.target.replace("workflow:", "MO #")} — {t.n}</li>)}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="px-4 py-3 pb-0 sm:px-4 sm:py-3 sm:pb-0">
              <CardTitle>Auteurs les plus actifs</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-3 sm:px-4 sm:py-3">
              <ol className="m-0 grid gap-1 pl-5 text-sm">
                {stats.topPublishers.length === 0 && <li className="text-muted-foreground">Aucune publication</li>}
                {stats.topPublishers.map((t) => <li key={t.actor_email} className="min-w-0 break-words">{t.actor_email} — {t.n}</li>)}
              </ol>
            </CardContent>
          </Card>
        </section>
        <Card>
          <CardHeader className="px-4 py-3 pb-0 sm:px-4 sm:py-3 sm:pb-0">
            <CardTitle>Activité récente</CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-3 sm:px-4 sm:py-3">
            <ul className="m-0 grid gap-1 text-sm">
              {stats.recentActivity.map((a, i) => (
                <li key={i} className="flex min-w-0 flex-wrap gap-2">
                  <span className="min-w-0 text-muted-foreground">{a.at}</span>
                  <strong className="min-w-0 font-semibold break-words">{a.actor_email}</strong>
                  <span className="min-w-0 break-words">{a.action}{a.target ? ` → ${a.label || a.target}` : ""}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {audit && audit.length > 0 && (
          <Card aria-label="Journal d'audit">
            <CardHeader className="px-4 py-3 pb-2 sm:px-4 sm:py-3 sm:pb-2">
              <CardTitle>Journal d'audit (200 dernières actions)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-3 sm:px-4 sm:py-3">
              {/* pré-formaté monospace : le wrap long est assuré par styles.css (pre, code) */}
              <pre className="m-0 max-h-[26rem] min-w-0 overflow-y-auto rounded-md bg-log p-3 font-mono text-sm">
                {audit.map((a) => `${a.at}  ${a.actor_email}  ${a.action}${a.target ? ` → ${a.target}` : ""}${a.detail ? ` (${a.detail})` : ""}`).join("\n")}
              </pre>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
