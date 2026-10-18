import { useEffect, useRef, useState } from "react";
import { Menu, Moon, Search, Sun } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context";
import { getStoredTheme, toggleTheme, watchTheme, type Theme } from "./theme";


// Bascule de thème, façon meal_plan : bouton icône nu dans la bandeau,
// accessible (aria-label), jamais dans un sous-menu.
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    (document.documentElement.dataset.theme as Theme) || getStoredTheme()
  );
  useEffect(() => watchTheme(setTheme), []);
  const label = theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre";
  return (
    <button
      onClick={() => setTheme(toggleTheme())}
      className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-link"
      aria-label="Changer de thème"
      title={label}
    >
      {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}

// Navigation, calquée sur le bandeau de meal_plan : barre neutre (surface +
// bordure basse) de 48 px (56 px dès sm), contenu contraint à max-w-6xl ;
// liens visibles sur desktop (md+), hamburger + panneau déroulant sur mobile.
// Sticky conservé : les bandeaux des pages s'accrochent à --nav-h.
export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Échap ferme le menu mobile ouvert (comportement meal_plan).
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (!user) return null;

  const link = (to: string, label: string) => {
    const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
    return (
      <Link
        key={to}
        to={to}
        onClick={() => setMenuOpen(false)}
        className={`whitespace-nowrap py-2 text-xs text-muted-foreground transition-colors hover:text-link sm:text-sm ${active ? "font-medium text-link" : ""}`}
      >
        {label}
      </Link>
    );
  };

  const entries: [string, string][] = [["/", "Modes opératoires"]];
  if (user.role === "admin") {
    entries.push(["/admin", "Comptes"], ["/stats", "Statistiques"], ["/deploy", "Déploiement"], ["/settings", "Paramètres"]);
  }

  return (
    <nav ref={navRef} className="sticky top-0 z-[300] border-b border-border-soft bg-surface">
      <div className="mx-auto max-w-6xl px-3 sm:px-4 lg:px-8">
        <div className="flex h-12 items-center justify-between sm:h-14">
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="truncate text-base font-bold text-brand-strong no-underline sm:text-lg"
          >
            Modop
          </Link>

          {/* Desktop : liens à plat, séparateur, email, déconnexion, thème */}
          <div className="hidden items-center gap-3 md:flex lg:gap-4">
            {entries.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className={`whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-link sm:text-sm ${pathname === to ? "font-medium text-link" : ""}`}
              >
                {label}
              </Link>
            ))}
            <span className="hidden text-border lg:inline" aria-hidden="true">|</span>
            <span className="hidden max-w-48 truncate text-xs text-muted-foreground lg:inline" title={user.email}>
              {user.email}
            </span>
            <button
              onClick={async () => { await logout(); navigate("/login"); }}
              className="whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-destructive sm:text-sm"
            >
              Déconnexion
            </button>
            <Link
              to="/?rechercher=1"
              aria-label="Rechercher un mode opératoire"
              title="Rechercher un mode opératoire"
              className="shrink-0 rounded p-1.5 text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-link"
            >
              <Search size={18} />
            </Link>
            <ThemeToggle />
          </div>

          {/* Mobile : recherche + thème + hamburger */}
          <div className="flex items-center gap-1 md:hidden">
            <Link
              to="/?rechercher=1"
              aria-label="Rechercher un mode opératoire"
              title="Rechercher un mode opératoire"
              className="shrink-0 rounded p-1.5 text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-link"
            >
              <Search size={18} />
            </Link>
            <ThemeToggle />
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Menu"
              title="Menu"
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-link"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>

        {/* Fond masquant sous le menu mobile : un clic en dehors le ferme */}
        {menuOpen && (
          <div
            className="fixed inset-x-0 bottom-0 top-12 z-10 bg-black/25 md:hidden sm:top-14"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {menuOpen && (
          <div role="menu" aria-label="Menu de navigation" className="relative z-20 border-t border-border-soft bg-surface px-3 pb-3 md:hidden">
            <div className="flex flex-col gap-2">
              <p className="mt-2 truncate text-xs text-muted-foreground" title={user.email}>
                {user.email} <span className="opacity-70">({user.role})</span>
              </p>
              {entries.map(([to, label]) => link(to, label))}
              <div className="mt-1 border-t border-border-soft pt-2">
                <button
                  role="menuitem"
                  onClick={async () => { setMenuOpen(false); await logout(); navigate("/login"); }}
                  className="w-full py-2 text-left text-xs text-destructive transition-colors hover:opacity-80 sm:text-sm"
                >
                  Déconnexion
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
