import type { Category } from "../api";

// C-94 : helpers d'arborescence documentaire — partagés entre la page
// d'administration (categories.tsx), l'éditeur (sélecteur Emplacement) et
// la liste (filtre par sous-arbre). Profondeur libre (le serveur borne à 20).

export type CategoryNode = Category & { children: CategoryNode[]; depth: number };

// Tri entre frères : position puis nom (les positions peuvent être égales).
export function sortSiblings(list: Category[]): Category[] {
  return [...list].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "fr"));
}

// Reconstruit l'arbre depuis la liste plate (racines : parent_id = null).
export function buildTree(cats: Category[]): CategoryNode[] {
  const byParent = new Map<number | null, Category[]>();
  for (const c of cats) {
    const key = c.parent_id ?? null;
    const arr = byParent.get(key);
    if (arr) arr.push(c);
    else byParent.set(key, [c]);
  }
  const build = (parentId: number | null, depth: number): CategoryNode[] =>
    sortSiblings(byParent.get(parentId) ?? []).map((c) => ({ ...c, depth, children: build(c.id, depth + 1) }));
  return build(null, 0);
}

// Aplatit l'arbre en ordre de lecture (préfixe) pour le rendu et les selects.
export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  const walk = (list: CategoryNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

// Ensemble transitif des descendants d'un nœud (anti-cycle côté déplacement,
// filtre par sous-arbre côté liste).
export function descendantIds(cats: Category[], id: number): Set<number> {
  const out = new Set<number>();
  const walk = (pid: number) => {
    for (const c of cats) {
      if (c.parent_id === pid && !out.has(c.id)) {
        out.add(c.id);
        walk(c.id);
      }
    }
  };
  walk(id);
  return out;
}
