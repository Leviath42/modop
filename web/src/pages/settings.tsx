import { useEffect, useState } from "react";
import { api, ApiError, type AppSettings, type Indication } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";
import { Alert } from "../components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { PICTO_PRESETS } from "../editor/tools/definitions";

// C-72 (#4/#5) : page Paramètres (admin) — chaque option est appliquée
// immédiatement côté serveur (PUT) : le listing « à revoir » et la
// visibilité des brouillons suivent sans redéploiement.
export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // C-97 (V12 #8) : indications métiers paramétrables — la liste est
  // appliquée uniquement via « Enregistrer » (édition locale avant PUT).
  const [indications, setIndications] = useState<Indication[] | null>(null);
  const [indNotice, setIndNotice] = useState<string | null>(null);

  useEffect(() => {
    api.getIndications()
      .then((l) => setIndications(l))
      .catch(() => setIndications([]));
  }, []);

  const setIndicationAt = (k: number, next: Partial<Indication>) => {
    setIndications((prev) => (prev ?? []).map((x, j) => (j === k ? { ...x, ...next } : x)));
  };

  function addIndication() {
    const base = "nouvelle-indication";
    const kinds = new Set((indications ?? []).map((i) => i.kind));
    let kind = base;
    let n = 2;
    while (kinds.has(kind)) kind = `${base}-${n++}`;
    setIndications([...(indications ?? []), { kind, label: "Nouvelle indication", color: "#5b7285" }]);
  }

  async function saveIndications() {
    if (!indications) return;
    try {
      const saved = await api.saveIndications(indications);
      setIndications(saved);
      setIndNotice("Indications enregistrées");
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enregistrement impossible");
    }
    setTimeout(() => setIndNotice(null), 2000);
  }
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

  const toggle = (key: "readers_see_drafts" | "no_review_date_is_overdue", label: string, description: string) => (
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
            <label className="grid gap-1 rounded-lg border border-border bg-surface p-3">
              <span className="text-sm font-semibold text-foreground">Épaisseur de trait par défaut</span>
              <span className="text-sm text-muted-foreground">Appliquée aux nouvelles formes (flèches, zones) de tous les auteurs.</span>
              <select
                value={settings ? settings.default_stroke_width : 5}
                disabled={!settings}
                onChange={(e) => void update({ default_stroke_width: Number(e.target.value) })}
                className="h-9 w-24 rounded-md border border-border bg-surface px-2 text-sm"
                aria-label="Épaisseur de trait par défaut"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            {/* C-86 : délai de revue par défaut — préremplit « À revoir le »
                d'un MO sans date (à J+30 par défaut, paramétrable). */}
            <label className="grid gap-1 rounded-lg border border-border bg-surface p-3">
              <span className="text-sm font-semibold text-foreground">Délai de revue par défaut (jours)</span>
              <span className="text-sm text-muted-foreground">
                Préremplit la date « À revoir le » d'un mode opératoire sans date de revue, à la date du jour + ce délai (30 par défaut).
              </span>
              <input
                type="number"
                min={1}
                max={3650}
                value={settings ? settings.default_review_days : 30}
                disabled={!settings}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 1 && v <= 3650) void update({ default_review_days: Math.round(v) });
                }}
                className="h-9 w-24 rounded-md border border-border bg-surface px-2 text-sm"
                aria-label="Délai de revue par défaut en jours"
              />
            </label>
            {toggle(
              "readers_see_drafts",
              "Brouillons visibles par les lecteurs",
              "Les comptes lecteurs voient les brouillons en cours sur l'accueil et peuvent les ouvrir."
            )}
          </CardContent>
        </Card>

        {/* C-97 (V12 #8) : indications métiers paramétrables — flyout de
            l'éditeur. Pictos auto-porteurs : renommer/retirer ne rétro-modifie
            pas les MO existants ni les versions publiées. */}
        <Card>
          <CardHeader>
            <CardTitle>Indications métiers</CardTitle>
            <CardDescription>Encarts proposés par le bouton « Indications » de l'éditeur. Renommer ou retirer une indication ne modifie pas les modes opératoires existants — les pictos déjà posés gardent leur libellé d'origine.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {(indications ?? []).map((ind, k) => (
              <div key={ind.kind} className="flex flex-wrap items-center gap-2">
                <span className="size-[0.7rem] shrink-0 rounded-full" style={{ background: ind.color }} aria-hidden="true" />
                <input
                  value={ind.label}
                  aria-label={`Libellé de l'indication ${ind.kind}`}
                  maxLength={40}
                  onChange={(e) => setIndicationAt(k, { label: e.target.value })}
                  className="h-9 min-w-40 flex-1 rounded-md border border-border bg-surface px-2 text-sm"
                />
                <input
                  type="color"
                  value={ind.color}
                  aria-label={`Couleur de l'indication ${ind.kind}`}
                  onChange={(e) => setIndicationAt(k, { color: e.target.value })}
                  className="h-9 w-14 rounded-md border border-border bg-surface"
                />
                <code className="text-xs text-muted-foreground" title="Identifiant immuable utilisé par l'API">{ind.kind}</code>
                <Button variant="outline" size="sm" aria-label={`Supprimer l'indication ${ind.kind}`} onClick={() => setIndications((prev) => (prev ?? []).filter((_, j) => j !== k))}>✕</Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={addIndication} disabled={!indications}>Ajouter une indication</Button>
              <Button variant="outline" size="sm" onClick={() => setIndications([...PICTO_PRESETS])} disabled={!indications}>Restaurer les 7 par défaut</Button>
              <Button size="sm" onClick={() => void saveIndications()} disabled={!indications || indications.length === 0}>Enregistrer</Button>
            </div>
            {indNotice && <Alert variant="ok">{indNotice}</Alert>}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Ces paramètres sont stockés dans la base (table <code>settings</code>) et lus par le serveur — aucun redéploiement n'est nécessaire.
        </p>
      </main>
    </>
  );
}
