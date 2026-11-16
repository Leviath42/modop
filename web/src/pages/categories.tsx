import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, type Category, type Workflow } from "../api";
import { buildTree, descendantIds, flattenTree, sortSiblings } from "../lib/categories-tree";
import { useAuth } from "../auth-context";
import { cn } from "../lib/utils";
import NavBar from "../nav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle } from "../components/ui/card";
import { Input, Label, Select } from "../components/ui/input";
import { Modal } from "../components/ui/dialog";
import { ArrowDown, ArrowUp, Move, Pencil, Trash2 } from "lucide-react";

// C-94 : page d'administration de l'arborescence documentaire.
// L'arbre est reconstruit du flat (parent_id) — profondeur libre (le serveur
// borne à 20), titres renommables (slug immuable = chemins stables), ordre
// manuel entre frères, documents parents rattachés côté éditeur.

export default function CategoriesPage() {
  const { user } = useAuth();
  const [cats, setCats] = useState<Category[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string>("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [moving, setMoving] = useState<{ id: number; parentId: string } | null>(null);
  const isAdmin = user?.role === "admin";

  const refresh = useCallback(async () => {
    try {
      const [list, wfs] = await Promise.all([api.listCategories(), api.listWorkflows() as Promise<Workflow[]>]);
      const rows: Workflow[] = Array.isArray(wfs) ? wfs : [];
      setCats(list);
      const byCat: Record<number, number> = {};
      for (const w of rows) if (w.category_id) byCat[w.category_id] = (byCat[w.category_id] ?? 0) + 1;
      setCounts(byCat);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur de chargement");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tree = useMemo(() => buildTree(cats), [cats]);
  const rows = useMemo(() => flattenTree(tree), [tree]);
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  async function run(action: string, fn: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
      setNotice(action);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Opération impossible");
    }
  }

  async function createCategory() {
    const name = newName.trim();
    if (!name) return;
    await run(`Catégorie créée : ${name}`, () =>
      api.createCategory(name, newParent ? Number(newParent) : null)
    );
    setNewName("");
    setNewParent("");
  }

  async function saveRename() {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name) return;
    await run(`Catégorie renommée : ${name}`, () =>
      api.updateCategory(renaming.id, { name })
    );
    setRenaming(null);
  }

  async function saveMove() {
    if (!moving) return;
    await run("Catégorie déplacée", () =>
      api.updateCategory(moving.id, { parent_id: moving.parentId ? Number(moving.parentId) : null })
    );
    setMoving(null);
  }

  // Swap des positions entre frères (↑/↓) — deux PUT, le serveur accepte
  // les positions dupliquées temporairement.
  async function swap(cat: Category, dir: -1 | 1) {
    const siblings = sortSiblings(cats.filter((c) => (c.parent_id ?? null) === (cat.parent_id ?? null)));
    const i = siblings.findIndex((c) => c.id === cat.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= siblings.length) return;
    const other = siblings[j];
    await run("Ordre mis à jour", async () => {
      await api.updateCategory(cat.id, { position: other.position });
      await api.updateCategory(other.id, { position: cat.position });
    });
  }

  async function remove(cat: Category) {
    if (!window.confirm(`Supprimer la catégorie « ${cat.name} » ?`)) return;
    await run("Catégorie supprimée", () => api.deleteCategory(cat.id));
  }

  return (
    <>
      <NavBar />
      <main className="mx-auto grid max-w-[820px] grid-cols-1 gap-4 p-4">
        <h1 className="text-lg font-semibold tracking-tight">Arborescence documentaire</h1>
        <p className="m-0 text-sm text-muted-foreground">
          Organisez les modes opératoires en familles imbriquées (profondeur libre, titres renommables —
          les identifiants de chemin restent stables). Les documents sont rattachés depuis l'éditeur,
          onglet Détails → Emplacement.
        </p>
        {error && <p role="alert" className="m-0 rounded-md bg-error-bg px-3 py-2 text-sm text-error break-words">{error}</p>}
        {notice && <p role="status" className="m-0 rounded-md bg-ok-bg px-3 py-2 text-sm text-ok break-words">{notice}</p>}

        {isAdmin && (
          <Card>
            <CardHeader className="gap-2 px-4 py-3">
              <CardTitle>Créer une catégorie</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Input
                  type="text"
                  placeholder="Titre de la catégorie"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="min-w-0 flex-[2_1_12rem]"
                  aria-label="Titre de la catégorie"
                />
                <Select
                  value={newParent}
                  onChange={(e) => setNewParent(e.target.value)}
                  className="min-w-0 flex-[2_1_12rem]"
                  aria-label="Catégorie parente"
                >
                  <option value="">— Racine —</option>
                  {rows.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {"\u00A0".repeat(r.depth * 2)}{r.name}
                    </option>
                  ))}
                </Select>
                <Button onClick={() => void createCategory()} disabled={!newName.trim()}>Créer</Button>
              </div>
            </CardHeader>
          </Card>
        )}

        <section className="grid gap-2" aria-label="Arborescence">
          {rows.length === 0 && (
            <p className="m-0 text-sm text-muted-foreground">Aucune catégorie — créez la première pour organiser les documents.</p>
          )}
          {rows.map((r) => {
            const siblings = sortSiblings(cats.filter((c) => (c.parent_id ?? null) === (r.parent_id ?? null)));
            const i = siblings.findIndex((c) => c.id === r.id);
            const isRenaming = renaming?.id === r.id;
            return (
              <Card key={r.id} className={cn("flex flex-wrap items-center gap-2 px-4 py-2.5")}>
                <span
                  className="m-0 min-w-0 flex-1 font-semibold break-words"
                  style={{ paddingLeft: r.depth > 0 ? `${r.depth * 1.25}rem` : undefined }}
                >
                  {r.depth > 0 && <span aria-hidden="true" className="mr-1 text-muted-foreground">↳</span>}
                  {isRenaming ? (
                    <Input
                      type="text"
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: r.id, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveRename(); if (e.key === "Escape") setRenaming(null); }}
                      className="h-8 max-w-72"
                      aria-label={`Nouveau titre de ${r.name}`}
                    />
                  ) : (
                    r.name
                  )}
                </span>
                <Badge>{counts[r.id] ?? 0} doc{counts[r.id] === 1 ? "" : "s"}</Badge>
                {isAdmin && (
                  <span className="flex items-center gap-1">
                    {isRenaming ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => void saveRename()} disabled={!renaming.name.trim()}>OK</Button>
                        <Button variant="ghost" size="sm" onClick={() => setRenaming(null)}>Annuler</Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          disabled={i <= 0}
                          onClick={() => void swap(r, -1)}
                          aria-label={`Monter ${r.name}`}
                          title="Monter"
                        ><ArrowUp size={14} aria-hidden="true" /></Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          disabled={i >= siblings.length - 1}
                          onClick={() => void swap(r, 1)}
                          aria-label={`Descendre ${r.name}`}
                          title="Descendre"
                        ><ArrowDown size={14} aria-hidden="true" /></Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          onClick={() => setRenaming({ id: r.id, name: r.name })}
                          aria-label={`Renommer ${r.name}`}
                          title="Renommer (le chemin ne change pas)"
                        ><Pencil size={14} aria-hidden="true" /></Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          onClick={() => setMoving({ id: r.id, parentId: r.parent_id ? String(r.parent_id) : "" })}
                          aria-label={`Déplacer ${r.name}`}
                          title="Déplacer"
                        ><Move size={14} aria-hidden="true" /></Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:text-destructive"
                          onClick={() => void remove(r)}
                          aria-label={`Supprimer ${r.name}`}
                          title="Supprimer"
                        ><Trash2 size={14} aria-hidden="true" /></Button>
                      </>
                    )}
                  </span>
                )}
              </Card>
            );
          })}
        </section>

        {/* Déplacement : parents possibles = tous sauf soi et ses descendants. */}
        {moving && catById.get(moving.id) && (
          <Modal
            open
            onClose={() => setMoving(null)}
            title={`Déplacer « ${catById.get(moving.id)!.name} »`}
            footer={
              <>
                <Button variant="outline" onClick={() => setMoving(null)}>Annuler</Button>
                <Button onClick={() => void saveMove()}>Déplacer</Button>
              </>
            }
          >
            <div className="grid gap-1.5">
              <Label htmlFor="move-parent">Nouvelle catégorie parente</Label>
              <Select
                id="move-parent"
                value={moving.parentId}
                onChange={(e) => setMoving({ ...moving, parentId: e.target.value })}
              >
                <option value="">— Racine —</option>
                {rows
                  .filter((r) => r.id !== moving.id && !descendantIds(cats, moving.id).has(r.id))
                  .map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {"\u00A0".repeat(r.depth * 2)}{r.name}
                    </option>
                  ))}
              </Select>
              <p className="m-0 text-sm text-muted-foreground">Les sous-catégories suivent le déplacement.</p>
            </div>
          </Modal>
        )}
      </main>
    </>
  );
}
