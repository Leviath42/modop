import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";
import { Alert } from "../components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

type AppSettings = { readers_see_drafts: boolean; no_review_date_is_overdue: boolean };

// C-72 (#4/#5) : page Paramètres (admin) — chaque option est appliquée
// immédiatement côté serveur (PUT) : le listing « à revoir » et la
// visibilité des brouillons suivent sans redéploiement.
export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings()
      .then((s) => { setSettings(s); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Erreur de chargement"));
  }, []);

  async function update(next: Partial<AppSettings>) {
    if (!settings) return;
    const merged = { ...settings, ...next };
    setSettings(merged);
    try {
      const saved = await api.saveSettings(next);
      setSettings(saved);
      setNotice("Paramètre enregistré");
      setError(null);
    } catch (e) {
      setSettings(settings);
      setError(e instanceof ApiError ? e.message : "Enregistrement impossible");
    }
    setTimeout(() => setNotice(null), 2000);
  }

  if (!user || user.role !== "admin") {
    return (
      <>
        <NavBar />
        <main className="p-8">
          <p>Seul un administrateur peut gérer les paramètres.</p>
        </main>
      </>
    );
  }

  const toggle = (key: keyof AppSettings, label: string, description: string) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3">
      <input
        type="checkbox"
        checked={settings ? settings[key] : false}
        disabled={!settings}
        onChange={(e) => void update({ [key]: e.target.checked })}
        className="mt-1 size-4 shrink-0"
        aria-label={label}
      />
      <span className="grid gap-0.5">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
  );

  return (
    <>
      <NavBar />
      <main className="mx-auto grid max-w-[720px] grid-cols-1 gap-4 p-4">
        <h1 className="text-lg font-semibold tracking-tight">Paramètres</h1>
        {error && <p role="alert" className="m-0 text-error">{error}</p>}
        {notice && <Alert variant="ok">{notice}</Alert>}

        <Card>
          <CardHeader>
            <CardTitle>Gestion documentaire</CardTitle>
            <CardDescription>Options appliquées immédiatement à toute l'application.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {toggle(
              "no_review_date_is_overdue",
              "Sans date de revue = à revoir",
              "Les modes opératoires sans date de revue sont signalés « à revoir » (filtre et alerte d'accueil)."
            )}
            {toggle(
              "readers_see_drafts",
              "Brouillons visibles par les lecteurs",
              "Les comptes lecteurs voient les brouillons en cours sur l'accueil et peuvent les ouvrir."
            )}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Ces paramètres sont stockés dans la base (table <code>settings</code>) et lus par le serveur — aucun redéploiement n'est nécessaire.
        </p>
      </main>
    </>
  );
}
