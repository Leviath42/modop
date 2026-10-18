import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Fusion de classes Tailwind (convention shadcn/ui) : les classes en fin
// de liste l'emportent, les conflits d'utilitaires sont résolus proprement.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
