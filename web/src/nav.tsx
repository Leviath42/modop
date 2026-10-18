import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context";
import { getStoredTheme, toggleTheme, watchTheme, type Theme } from "./theme";

const SunIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);
const MoonIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);
const BarsIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

// Navigation : bandeau épuré — logo Modop + menu (⋮ hamburger). Toutes les
// entrées (selon rôle) et actions y sont regroupées ; fermeture au clic
// extérieur, à l'Échap ou après navigation.
export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement | null>(null);
  const [theme, setTheme] = useState<Theme>(() =>
    (document.documentElement.dataset.theme as Theme) || getStoredTheme()
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => watchTheme(setTheme), []);
  // Publier la hauteur réelle du bandeau : les headers sticky des pages
  // s'y raccrochent (var --nav-h) — plus de décalage quelle que soit la
  // hauteur réelle (mobile, redimensionnement).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const publish = () => document.documentElement.style.setProperty("--nav-h", `${nav.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(publish);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [user]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!user) return null;

  const menuLabel = theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre";

  const menuItem =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm text-foreground no-underline hover:bg-accent";

  return (
    <nav
      ref={navRef}
      className="sticky top-0 z-[300] flex items-center gap-2 bg-primary px-3 py-2 text-primary-foreground shadow-sm"
    >
      <Link
        to="/"
        className="flex shrink-0 items-center gap-1.5 text-lg font-bold text-primary-foreground no-underline"
      >
        <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-brand" />
        Modop
      </Link>
      <div ref={menuRef} className="relative ml-auto">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Menu"
          title="Menu"
          className="inline-flex size-9 items-center justify-center rounded-md text-primary-foreground hover:bg-white/10 focus-visible:outline-white"
        >
          <BarsIcon />
        </button>
        {menuOpen && (
          <div
            role="menu"
            aria-label="Menu de navigation"
            className="absolute right-0 top-[calc(100%+0.4rem)] grid min-w-60 max-w-[calc(100vw-1.5rem)] gap-0.5 rounded-lg border border-border bg-surface p-1.5 text-foreground shadow-xl"
          >
            <p className="mx-2 mt-1 mb-1.5 text-sm break-anywhere text-muted-foreground">
              {user.email} <span className="opacity-70">({user.role})</span>
            </p>
            <Link role="menuitem" to="/" onClick={() => setMenuOpen(false)} className={menuItem}>Modes opératoires</Link>
            {user.role === "admin" && (
              <>
                <Link role="menuitem" to="/admin" onClick={() => setMenuOpen(false)} className={menuItem}>Comptes</Link>
                <Link role="menuitem" to="/stats" onClick={() => setMenuOpen(false)} className={menuItem}>Statistiques</Link>
                <Link role="menuitem" to="/deploy" onClick={() => setMenuOpen(false)} className={menuItem}>Déploiement</Link>
              </>
            )}
            <span className="mx-2 my-1 h-px bg-border-soft" aria-hidden="true" />
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); setTheme(toggleTheme()); }}
              aria-label={menuLabel}
              className={menuItem}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />} {menuLabel}
            </button>
            <button
              role="menuitem"
              onClick={async () => { setMenuOpen(false); await logout(); navigate("/login"); }}
              className={menuItem + " text-destructive"}
            >
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
