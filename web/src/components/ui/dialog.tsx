import { useEffect } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

/* Modale maison (rôle dialog shadcn) : fermeture au clic sur le fond, à
   l'Échap, bouton ✕ accessible. Mobile : ancrée en bas (feuille), PC :
   centrée. Le contenu défile dans son cadre si trop long. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg border border-border bg-surface shadow-xl sm:rounded-lg",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        )}
      >
        <div className="flex items-start justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-5">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer" className="-mr-2 -mt-1 shrink-0">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-border-soft px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* Squelette de chargement — jamais de spinner plein écran (guide § 4.5). */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

/* Message contextuel : erreur (error), succès (ok), avertissement (warn). */
export function Alert({
  variant = "error",
  title,
  children,
  className,
}: {
  variant?: "error" | "ok" | "warn";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const styles = {
    error: "border-danger-border bg-danger-bg text-error",
    ok: "border-transparent bg-ok-bg text-ok",
    warn: "border-transparent bg-warn-bg text-warn",
  }[variant];
  return (
    <div role="alert" className={cn("rounded-md border px-4 py-3 text-sm", styles, className)}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      {children}
    </div>
  );
}
