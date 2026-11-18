// V16 (V8 #4) : page « Plan des documents » — navigation par tuiles
// groupées par arborescence documentaire, distincte de la liste de recherche.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Category, type Workflow } from "../api";
import NavBar from "../nav";
import { Badge } from "../components/ui/badge";
import { buildTree } from "../lib/categories-tree";
import { groupByTree, type MenuEntry } from "../lib/menu-grouping";

// Chemin complet de chaque catégorie (« Parent / Enfant / … »).
function categoryPaths(cats: Category[]): Map<number, string> {
  const paths = new Map<number, string>();
  type Node = { id: number; name: string; children: Node[] };
  const walk = (nodes: Node[], prefix: string) => {
    for (const n of nodes) {
      const path = prefix ? prefix + " / " + n.name : n.name;
      paths.set(n.id, path);
      walk(n.children, path);
    }
  };
  walk(buildTree(cats) as Node[], "");
  return paths;
}

export default function MenuPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listWorkflows(), api.listCategories()])
      .then(([wfs, catList]: [Workflow[], Category[]]) => {
        if (!cancelled) { setWorkflows(wfs); setCats(catList); setError(""); }
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const paths = categoryPaths(cats);
  const entries: MenuEntry[] = workflows.map((w) => ({
    id: w.id,
    title: w.title,
    reference: w.reference,
    state: w.state,
    category_path: w.category_id != null ? (paths.get(w.category_id) ?? null) : null,
  }));
  const groups = groupByTree(entries);

  return (
    <>
      <NavBar />
      <main className="mx-auto w-full max-w-[800px] p-4">
        <h1 className="text-xl font-bold tracking-tight">Plan des documents</h1>
        {error && <p role="alert" className="text-error">{error}</p>}
        {loading ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground">Aucun mode opératoire.</p>
        ) : (
          groups.map((g) => (
            <section key={g.path} className="mb-5">
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{g.path}</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {g.items.map((w) => (
                  <Link
                    key={w.id}
                    to={"/workflow/" + w.id + "/read"}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 no-underline transition-colors hover:border-link"
                    title={w.title}
                  >
                    <code className="shrink-0 rounded bg-surface-2 px-1 py-0.5 text-xs">{w.reference}</code>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{w.title}</span>
                    <Badge variant={w.state === "published" ? "ok" : "secondary"}>
                      {w.state === "published" ? "Publié" : "Brouillon"}
                    </Badge>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </>
  );
}
