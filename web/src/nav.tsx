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

  const menuItem: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "0.55rem",
    width: "100%", padding: "0.55rem 0.9rem",
    background: "transparent", border: "none",
    color: "var(--text)", fontSize: "0.9rem", textAlign: "left",
    cursor: "pointer", textDecoration: "none", lineHeight: 1.2,
  };

  return (
    <nav ref={navRef} style={{ position: "sticky", top: 0, zIndex: 300, display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.8rem", background: "var(--accent)", color: "white" }}>
      <Link to="/" style={{ color: "white", fontWeight: 700, textDecoration: "none", fontSize: "1.05rem", flexShrink: 0 }}>
        Modop
      </Link>
      <div ref={menuRef} style={{ position: "relative", marginLeft: "auto" }}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Menu"
          title="Menu"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "2.2rem", height: "2.2rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.5)", background: "transparent", color: "white", lineHeight: 1 }}
        >
          <BarsIcon />
        </button>
        {menuOpen && (
          <div role="menu" aria-label="Menu de navigation" style={{ position: "absolute", right: 0, top: "calc(100% + 0.4rem)", minWidth: "15rem", maxWidth: "calc(100vw - 1.6rem)", background: "var(--surface)", color: "var(--text)", borderRadius: "10px", boxShadow: "0 6px 24px rgba(0,0,0,0.25)", padding: "0.4rem", display: "grid", gap: "0.1rem" }}>
            <p style={{ margin: "0.3rem 0.9rem 0.5rem", fontSize: "0.85rem", color: "var(--text-muted)", overflowWrap: "anywhere" }}>
              {user.email} <span style={{ opacity: 0.7 }}>({user.role})</span>
            </p>
            <Link role="menuitem" to="/" onClick={() => setMenuOpen(false)} style={menuItem}>Modes opératoires</Link>
            {user.role === "admin" && (
              <>
                <Link role="menuitem" to="/admin" onClick={() => setMenuOpen(false)} style={menuItem}>Comptes</Link>
                <Link role="menuitem" to="/stats" onClick={() => setMenuOpen(false)} style={menuItem}>Statistiques</Link>
                <Link role="menuitem" to="/deploy" onClick={() => setMenuOpen(false)} style={menuItem}>Déploiement</Link>
              </>
            )}
            <span style={{ height: "1px", background: "var(--border-soft)", margin: "0.3rem 0.6rem" }} aria-hidden="true" />
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); setTheme(toggleTheme()); }}
              aria-label={menuLabel}
              style={{ ...menuItem, cursor: "pointer" }}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />} {menuLabel}
            </button>
            <button
              role="menuitem"
              onClick={async () => { setMenuOpen(false); await logout(); navigate("/login"); }}
              style={{ ...menuItem, color: "var(--error-text)" }}
            >
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
