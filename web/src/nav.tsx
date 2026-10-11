import { useEffect, useState } from "react";
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

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>(() =>
    (document.documentElement.dataset.theme as Theme) || getStoredTheme()
  );
  useEffect(() => watchTheme(setTheme), []);
  if (!user) return null;

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.6rem 1rem",
        background: "var(--accent)",
        color: "white",
        flexWrap: "wrap",
      }}
    >
      <Link to="/" style={{ color: "white", fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>
        Modop
      </Link>
      <span style={{ opacity: 0.85, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "40vw" }}>{user.email}</span>
      <span style={{ opacity: 0.7, fontSize: "0.8rem" }}>({user.role})</span>
      {user.role === "admin" && (
        <>
          <Link to="/admin" style={{ color: "white", fontSize: "0.78rem", opacity: 0.9, textDecoration: "none", border: "1px solid rgba(255,255,255,0.5)", padding: "0.15rem 0.45rem", borderRadius: "6px" }}>
            Comptes
          </Link>
          <Link to="/stats" style={{ color: "white", fontSize: "0.78rem", opacity: 0.9, textDecoration: "none", border: "1px solid rgba(255,255,255,0.5)", padding: "0.15rem 0.45rem", borderRadius: "6px" }}>
            Statistiques
          </Link>
          <Link to="/deploy" style={{ color: "white", fontSize: "0.78rem", opacity: 0.9, textDecoration: "none", border: "1px solid rgba(255,255,255,0.5)", padding: "0.15rem 0.45rem", borderRadius: "6px" }}>
            Déploiement
          </Link>
        </>
      )}
      <button
        onClick={() => setTheme(toggleTheme())}
        aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
        title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
        style={themeBtn}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
      <button
        onClick={async () => {
          await logout();
          navigate("/login");
        }}
        style={{ marginLeft: "auto", ...logoutStyle }}
      >
        Déconnexion
      </button>
    </nav>
  );
}

const themeBtn: React.CSSProperties = {
  padding: "0.2rem 0.45rem",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.5)",
  background: "transparent",
  color: "white",
  lineHeight: 1,
};

const logoutStyle: React.CSSProperties = {
  padding: "0.25rem 0.6rem",
  borderRadius: "6px",
  border: "1px solid white",
  background: "transparent",
  color: "white",
  fontSize: "0.85rem",
};
