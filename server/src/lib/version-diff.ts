// V16 (V7 #2) : comparaison de deux snapshots de versions publiées.
// Fonction pure — rapprochement par titre d'abord, sinon par position,
// une étape sans équivalent est ajoutée ou supprimée.
export interface SnapshotStepRef {
  position: number;
  title: string;
}

export interface VersionDiff {
  title_changed: boolean;
  added: SnapshotStepRef[];
  removed: SnapshotStepRef[];
  modified: {
    title: string;
    position: number;
    changes: { body: boolean; photos: boolean; pictos: boolean };
  }[];
}

interface SnapStep {
  position: number;
  title: string;
  body?: string;
  pictos?: unknown[];
  photos?: unknown[];
}

export interface Snapshot {
  workflow?: { title?: string } | null;
  steps?: SnapStep[];
}

export function compareSnapshots(a: Snapshot, b: Snapshot): VersionDiff {
  const stepsA = a.steps ?? [];
  const stepsB = b.steps ?? [];
  const bByTitle = new Map<string, SnapStep>();
  for (const s of stepsB) if (!bByTitle.has(s.title)) bByTitle.set(s.title, s);
  const modified: VersionDiff["modified"] = [];
  const removed: SnapshotStepRef[] = [];
  const bUsed = new Set<SnapStep>();
  // 1) rapprochement par titre identique
  for (const s of stepsA) {
    const m = bByTitle.get(s.title);
    if (m) {
      bUsed.add(m);
      modified.push({
        title: s.title,
        position: m.position,
        changes: {
          body: (s.body ?? "") !== (m.body ?? ""),
          photos: (s.photos ?? []).length !== (m.photos ?? []).length,
          pictos: JSON.stringify(s.pictos ?? []) !== JSON.stringify(m.pictos ?? []),
        },
      });
    }
  }
  // 2) titres sans correspondance : rapprochement par position
  const bByPos = new Map<number, SnapStep>();
  for (const s of stepsB) if (!bUsed.has(s)) bByPos.set(s.position, s);
  for (const s of stepsA) {
    if (bByTitle.has(s.title)) continue;
    const m = bByPos.get(s.position);
    if (m) {
      bUsed.add(m);
      modified.push({
        title: m.title, // titre de la version la plus récente
        position: m.position,
        changes: {
          body: (s.body ?? "") !== (m.body ?? ""),
          photos: (s.photos ?? []).length !== (m.photos ?? []).length,
          pictos: JSON.stringify(s.pictos ?? []) !== JSON.stringify(m.pictos ?? []),
        },
      });
    } else {
      removed.push({ position: s.position, title: s.title });
    }
  }
  // 3) étapes restantes côté b = ajoutées
  const added = stepsB.filter((s) => !bUsed.has(s)).map((s) => ({ position: s.position, title: s.title }));
  const title_changed = (a.workflow?.title ?? "") !== (b.workflow?.title ?? "");
  return { title_changed, added, removed, modified };
}
