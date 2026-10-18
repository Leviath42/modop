import { cn } from "../../lib/utils";

/* Champ de saisie — min-w-0 obligatoire : aucun champ ne peut élargir la
   page (règle structurelle anti-débordement, voir styles.css). */
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-foreground",
        "placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-foreground",
        "placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

/* Select natif stylé : l'accessibilité et le comportement mobile du select
   natif (feuille iOS/Android) sont conservés — seul l'habillage change. */
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-foreground",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium leading-none text-foreground", className)} {...props} />;
}
