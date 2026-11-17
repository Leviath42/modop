import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type AppSettings, type Category, type Workflow } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";
import { Badge } from "../components/ui/badge";
import { Alert } from "../components/ui/dialog";
import { ChevronRight, Pencil } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input, Label, Select } from "../components/ui/input";
import { cn } from "../lib/utils";
import { buildTree, descendantIds, flattenTree } from "../lib/categories-tree";

export default function ListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // C-101 : import de document (docx/pdf/xlsx) -> brouillon -> éditeur.
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  async function onImportFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de re-sélectionner le même fichier
    if (!file) return;
    setImportBusy(true);
    setImportError("");
    try {
      const res = await api.importDocument(file);
      navigate("/workflow/" + res.workflow.id + "/edit");
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Import impossible — réessayez.");
      setImportBusy(false);
    }
  }
  // #10 : le bouton Recherche du bandeau arrive ici avec ?rechercher=1 —
  // on donne le focus au champ et on l'efface pour ne pas polluer l'URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (searchParams.get("rechercher") === "1") {
      setSearchParams({}, { replace: true });
      searchInputRef.current?.focus();
    }
  }, [searchParams, setSearchParams]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [family, setFamily] = useState("");
  const [families, setFamilies] = useState<string[]>([]);
  // C-94 : filtre par arborescence (côté client, sous-arbre complet) +
  // badge « ↳ parent » sur les cartes (fetch non filtré).
  const [cats, setCats] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [parentMap, setParentMap] = useState<Map<number, Workflow>>(new Map());
  const [showFilters, setShowFilters] = useState(false);
  // C-44 : groupes repliables (état Publié/Brouillon et familles) — l'état
  // de repli est persisté en localStorage par MO et par groupe.
  const COLLAPSE_KEY = "modop-collapsed-groups";
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "[]") as string[]); }
    catch { return new Set(); }
  });
  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch { /* stockage indisponible */ }
      return next;
    });
  };
  const [sort, setSort] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  // C-72 (#4/#5) : paramètres applicatifs (sans date = à revoir ;
  // brouillons visibles par les lecteurs).
  const [settings, setSettings] = useState<AppSettings>({ readers_see_drafts: false, no_review_date_is_overdue: true, default_stroke_width: 5, default_review_days: 30 });
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => { /* défauts conservés */ });
  }, []);

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
        const pm = new Map<number, Workflow>();
        for (const p of wfs) for (const w of wfs) if (w.parent_id === p.id) pm.set(w.id, p);
        setParentMap(pm);
      })
      .catch(() => { /* filtre famille optionnel */ });
    api.listCategories().then((list) => { if (Array.isArray(list)) setCats(list); }).catch(() => { /* filtre optionnel */ });
  }, []);

  const activeFilters = [state, family, categoryFilter, overdueOnly ? "1" : "", sort].filter(Boolean).length;
  // Alerte « à revoir » pour les auteurs/admins : documents dont la date de
  // revue est dépassée — C-83 : chaque document est listé avec SA raison
  // (date dépassée ou absence de date) et un lien qui l'ouvre.
  const today = new Date().toISOString().slice(0, 10);
  const overdueDocs = workflows.filter((w) =>
    (w.review_due ? w.review_due < today : settings.no_review_date_is_overdue)
  );
  const overdueCount = overdueDocs.length;

  return (
    <>
      <NavBar />
      <main className="mx-auto w-full max-w-[800px] p-4">
        <h1 className="text-xl font-bold tracking-tight">Modes opératoires</h1>
        <div className="mb-2.5 flex gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor="mo-search" className="sr-only">Rechercher un mode opératoire</Label>
            <Input
              id="mo-search"
              ref={searchInputRef}
              type="search"
              placeholder="Rechercher (titre, référence)…"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Rechercher un mode opératoire"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-haspopup="true"
            title="Filtres et tri"
            className={cn(showFilters && "bg-accent")}
          >Filtres{activeFilters > 0 ? ` (${activeFilters})` : ""}</Button>
          {user && user.role !== "reader" && (
            <>
              <input
                ref={importFileRef}
                type="file"
                accept=".docx,.pdf,.xlsx"
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={onImportFile}
              />
              <Button
                variant="outline"
                disabled={importBusy}
                onClick={() => importFileRef.current?.click()}
                title="Importer un document Word, PDF ou Excel — un brouillon est créé, à relire avant publication"
              >
                {importBusy ? "Import…" : "Importer"}
              </Button>
              <Link to="/workflow/new/edit" aria-label="Créer un mode opératoire" className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground no-underline">
                +
              </Link>
            </>
          )}
        </div>
        {importError && <p role="alert" className="mb-2 text-sm text-error">{importError}</p>}
        {showFilters && (
          <section aria-label="Filtres et tri" className="mb-3 grid gap-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="mo-filter-state" className="text-muted-foreground">État</Label>
                <Select id="mo-filter-state" value={state} onChange={(e) => setState(e.target.value)} aria-label="Filtrer par état" className="w-auto">
                  <option value="">Tous</option>
                  <option value="published">Publiés</option>
                  <option value="draft">Brouillons</option>
                </Select>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="mo-filter-family" className="text-muted-foreground">Famille</Label>
                <Select id="mo-filter-family" value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Filtrer par famille" className="w-auto max-w-[40vw]">
                  <option value="">Toutes</option>
                  {families.map((f) => <option key={f} value={f}>{f}</option>)}
                </Select>
              </div>
              {cats.length > 0 && (
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="mo-filter-cat" className="text-muted-foreground">Arborescence</Label>
                  <Select id="mo-filter-cat" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filtrer par arborescence" className="w-auto max-w-[40vw]">
                    <option value="">Toutes</option>
                    {flattenTree(buildTree(cats)).map((c) => (
                      <option key={c.id} value={String(c.id)}>{" ".repeat(c.depth * 2)}{c.name}</option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="mo-sort" className="text-muted-foreground">Trier par</Label>
                <Select id="mo-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier" className="w-auto">
                  <option value="">Modifié récemment</option>
                  <option value="title">Titre A→Z</option>
                  <option value="reference">Référence</option>
                  <option value="family">Famille</option>
                  <option value="updated_at">Date de mise à jour</option>
                </Select>
              </div>
              <label className={cn("flex cursor-pointer items-center gap-2 pb-2.5 text-sm text-muted-foreground", overdueOnly && "font-semibold text-warn")}>
                <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
                À revoir
              </label>
              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => { setState(""); setFamily(""); setCategoryFilter(""); setOverdueOnly(false); setSort(""); }}
                >Effacer</Button>
              )}
            </div>
          </section>
        )}
        {error && <p role="alert" className="text-error">{error}</p>}
        {!loading && user && user.role !== "reader" && overdueCount > 0 && (
          <Alert variant="warn" title={`${overdueCount} mode${overdueCount > 1 ? "s" : ""} opératoire${overdueCount > 1 ? "s" : ""} à revoir`}>
            {/* C-83 : la raison de chaque signalement + un lien qui ouvre le
                document concerné (détail de la revue dans le lecteur). */}
            <ul className="mb-2 grid gap-1">
              {overdueDocs.slice(0, 5).map((w) => (
                <li key={w.id} className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Link to={`/workflow/${w.id}/read`} title={w.title} className="min-w-0 truncate text-sm font-semibold text-link no-underline">{w.title}</Link>
                  <span className="text-xs text-muted-foreground">
                    {w.review_due
                      ? `revue dépassée depuis le ${w.review_due.split("-").reverse().join("/")}`
                      : "aucune date de revue"}
                  </span>
                </li>
              ))}
            </ul>
            {overdueCount > 5 && (
              <p className="m-0 mb-2 text-xs text-muted-foreground">+ {overdueCount - 5} autre{overdueCount - 5 > 1 ? "s" : ""}…</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Des documents ont dépassé leur date de revue.</span>
              <Button size="sm" variant="outline" onClick={() => { setOverdueOnly(true); setSearch(""); }}>Voir à revoir</Button>
            </div>
          </Alert>
        )}
        {loading ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : workflows.length === 0 ? (
          <p className="text-muted-foreground">Aucun mode opératoire.</p>
        ) : (
          (() => {
            // #9 : les lecteurs ne voient pas les brouillons (paramètre
            // serveur optionnel à venir — filtre front pour l'instant).
            // C-94 : filtre arborescence — sous-arbre complet (descendants inclus).
            const catSubtree = categoryFilter ? descendantIds(cats, Number(categoryFilter)) : null;
            const selectedCat = categoryFilter ? Number(categoryFilter) : null;
            const inTree = (w: Workflow) => !catSubtree || (w.category_id != null && (w.category_id === selectedCat || catSubtree.has(w.category_id)));
            const scoped = workflows.filter(inTree);
            const visible = user?.role === "reader" && !settings.readers_see_drafts ? scoped.filter((w) => w.state !== "draft") : scoped;
            // C-43 : regroupement — état (publiés d'abord) puis famille
            const groups = new Map<string, typeof workflows>();
            for (const st of ["published", "draft"]) {
              for (const fam of [...new Set(visible.filter((w) => w.state === st).map((w) => w.family || "Sans famille"))].sort((a, b) => a.localeCompare(b, "fr"))) {
                groups.set(`${st}|${fam}`, visible.filter((w) => w.state === st && (w.family || "Sans famille") === fam));
              }
            }
            const card = (wf: (typeof workflows)[number]) => (
              <li key={wf.id}>
                <Card className="p-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link to={`/workflow/${wf.id}/read`} title={wf.title} className="min-w-0 flex-1 text-sm font-semibold text-link no-underline line-clamp-2 break-words">
                      {wf.title}
                    </Link>
                    <code className="shrink-0 rounded bg-surface-2 px-1 py-0.5 text-xs">{wf.reference}</code>
                    {user && user.role !== "reader" && (
                      <Link to={`/workflow/${wf.id}/edit`} aria-label={`Modifier ${wf.title}`} title="Modifier" className="shrink-0 no-underline"><Pencil size={14} aria-hidden="true" /></Link>
                    )}
                  </div>
                  {wf.parent_id && parentMap.get(wf.parent_id) && (
                    <p className="m-0 text-xs text-muted-foreground">↳ {parentMap.get(wf.parent_id)!.title}</p>
                  )}
                </Card>
              </li>
            );
            let lastState = "";
            return (
              <div>
                {[...groups.entries()].map(([key, items]) => {
                  const [st, fam] = key.split("|");
                  const stateLabel = st === "published" ? "Publié" : "Brouillon";
                  const stateCount = scoped.filter((w) => w.state === st).length;
                  const stateCollapsed = collapsed.has(`state:${st}`);
                  const famCollapsed = collapsed.has(`fam:${key}`);
                  const stateHeader = st !== lastState ? (
                    <button
                      key={`h-${st}`}
                      onClick={() => toggleGroup(`state:${st}`)}
                      aria-expanded={!stateCollapsed}
                      aria-label={`${stateLabel} — ${stateCollapsed ? "déplier" : "replier"}`}
                      className="mt-4 mb-1 flex w-full cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-left text-sm uppercase tracking-wide text-muted-foreground"
                    >
                      <ChevronRight size={14} aria-hidden="true" className={cn("transition-transform", stateCollapsed ? "" : "rotate-90")} />
                      {stateLabel}
                      <Badge variant={st === "published" ? "ok" : "warn"}>{stateCount}</Badge>
                    </button>
                  ) : null;
                  if (st !== lastState) lastState = st;
                  return (
                    <section key={key} aria-label={`${stateLabel} — ${fam}`}>
                      {stateHeader}
                      {!stateCollapsed && (
                        <>
                          <button
                            onClick={() => toggleGroup(`fam:${key}`)}
                            aria-expanded={!famCollapsed}
                            aria-label={`${fam} — ${famCollapsed ? "déplier" : "replier"}`}
                            className="mt-1 mb-1.5 flex w-full cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-left text-sm font-semibold text-foreground"
                          >
                            <ChevronRight size={14} aria-hidden="true" className={cn("transition-transform", famCollapsed ? "" : "rotate-90")} />
                            {fam}
                            <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
                          </button>
                          {!famCollapsed && (
                            <ul className="grid gap-1.5">
                              {items.map(card)}
                            </ul>
                          )}
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
            );
          })()
        )}
      </main>
    </>
  );
}

// Modale de confirmation de suppression — focus piégé, Échap pour fermer,
// focus rendu au bouton Supprimer à l'ouverture (accessibilité clavier, I4).
