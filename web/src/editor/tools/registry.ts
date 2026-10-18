import type { CommandDefinition } from "./types";
import { EDITOR_COMMANDS } from "./definitions";

// Registre unique des commandes de l'éditeur (spec § 6 : une seule source de
// vérité des actions, consommée par toutes les barres — desktop et mobile).
export { EDITOR_COMMANDS };
export * from "./types";
export { PICTO_PRESETS } from "./definitions";

export const VISIBLE_COMMANDS: CommandDefinition[] = EDITOR_COMMANDS.filter((c) => !c.hidden);

export function commandById(id: string): CommandDefinition | undefined {
  return EDITOR_COMMANDS.find((c) => c.id === id);
}

// Raccourcis clavier (touche simple, sans modificateur) → commande.
export const SHORTCUT_MAP: Record<string, CommandDefinition> = Object.fromEntries(
  EDITOR_COMMANDS.filter((c) => c.shortcut).map((c) => [c!.shortcut!.toLowerCase(), c])
);
