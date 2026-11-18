// V16 (V8 #4) : tests du regroupement par arborescence (logique pure).
import { test } from "node:test";
import assert from "node:assert";
import { groupByTree, type MenuEntry } from "../lib/menu-grouping";

const e = (id: number, title: string, reference: string, category_path?: string | null): MenuEntry =>
  ({ id, title, reference, state: "published", category_path: category_path ?? null });

test("groupement par chemin d'arborescence", () => {
  const groups = groupByTree([e(1, "Serrage", "MO-1", "Usinage / Tournage"), e(2, "Contrôle", "MO-2", "Qualité")]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].path, "Qualité");
  assert.equal(groups[1].items[0].reference, "MO-1");
});

test("documents sans catégorie regroupés sous Non classé", () => {
  const groups = groupByTree([e(1, "Sans", "MO-3", null), e(2, "Aussi", "MO-4", "")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].path, "Non classé");
  assert.equal(groups[0].items.length, 2);
});

test("groupes triés par chemin, items triés par titre", () => {
  const groups = groupByTree([
    e(1, "Zèbre", "MO-9", "Zoo"),
    e(2, "Abeille", "MO-8", "Zoo"),
    e(3, "Nœud", "MO-7", "Atelier"),
  ]);
  assert.deepEqual(groups.map((g) => g.path), ["Atelier", "Zoo"]);
  assert.deepEqual(groups[1].items.map((i) => i.title), ["Abeille", "Zèbre"]);
});

test("tableau vide : aucun groupe", () => {
  assert.deepEqual(groupByTree([]), []);
});

test("chemins identiques fusionnés en un seul groupe", () => {
  const groups = groupByTree([e(1, "A", "MO-1", "Usinage"), e(2, "B", "MO-2", "Usinage")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
});
