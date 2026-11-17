// V15 : historique global de l'editeur — pattern COMMAND (pas de snapshot
// brut). Pile bornee a 50, coalescence des patches texte (< 900 ms, meme
// champ : l'undo garde l'avant de la plus ancienne, le redo l'apres de la
// plus recente — fenetre alignee sur l'autosave 800 ms).
interface HistoryCommand {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const historyStack: HistoryCommand[] = [];
let currentIndex = -1;
const MAX_HISTORY_SIZE = 50;
const COALESCE_MS = 900;
let lastCoalesceKey: string | null = null;
let lastCoalesceTs = 0;

export const pushHistory = (command: HistoryCommand, coalesceKey?: string) => {
  const now = Date.now();
  const canMerge =
    coalesceKey !== undefined &&
    coalesceKey === lastCoalesceKey &&
    now - lastCoalesceTs < COALESCE_MS &&
    historyStack.length > 0 &&
    currentIndex === historyStack.length - 1;
  if (canMerge) {
    const prev = historyStack[historyStack.length - 1];
    historyStack[historyStack.length - 1] = { label: prev.label, undo: prev.undo, redo: command.redo };
  } else {
    if (currentIndex < historyStack.length - 1) historyStack.splice(currentIndex + 1);
    historyStack.push(command);
    if (historyStack.length > MAX_HISTORY_SIZE) historyStack.shift();
    currentIndex = historyStack.length - 1;
  }
  lastCoalesceKey = coalesceKey ?? null;
  lastCoalesceTs = now;
};

export const canUndo = (): boolean => currentIndex >= 0;
export const canRedo = (): boolean => currentIndex < historyStack.length - 1;

export const undo = async () => {
  if (canUndo()) {
    await historyStack[currentIndex].undo();
    currentIndex--;
  }
};

export const redo = async () => {
  if (canRedo()) {
    currentIndex++;
    await historyStack[currentIndex].redo();
  }
};

export const resetHistory = () => {
  historyStack.length = 0;
  currentIndex = -1;
  lastCoalesceKey = null;
};

export const labels = (): string[] => historyStack.map((cmd) => cmd.label);
