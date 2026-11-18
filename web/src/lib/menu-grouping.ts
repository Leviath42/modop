// V16 (V8 #4) : regroupement des documents par arborescence documentaire
// pour la page « Plan des documents ». Logique pure, pas de React.

export interface MenuEntry {
  id: number;
  title: string;
  reference: string;
  state: string;
  category_path?: string | null;
}

export interface MenuGroup {
  path: string;
  items: MenuEntry[];
}

export function groupByTree(workflows: MenuEntry[]): MenuGroup[] {
  const groups = new Map<string, MenuEntry[]>();
  for (const w of workflows) {
    const path = w.category_path && w.category_path.trim() !== "" ? w.category_path : "Non classé";
    if (!groups.has(path)) groups.set(path, []);
    groups.get(path)!.push(w);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "fr"))
    .map(([path, items]) => ({ path, items: [...items].sort((a, b) => a.title.localeCompare(b.title, "fr")) }));
}
