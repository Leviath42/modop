import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context";
import { getStoredTheme, toggleTheme, type Theme } from "./theme";

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>(() =>
    (document.documentElement.dataset.theme as Theme) || getStoredTheme()
  );
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
      <Link to="/" style={{ color: "white", fontWeight: 700, textDecoration: "none" }}>
        Modop
      </Link>
      <span style={{ opacity: 0.85, fontSize: "0.9rem" }}>{user.email}</span>
      <span style={{ opacity: 0.7, fontSize: "0.8rem" }}>({user.role})</span>
      {user.role === "admin" && (
        <>
          <Link to="/admin" style={{ color: "white", fontSize: "0.85rem", opacity: 0.9, textDecoration: "none", border: "1px solid rgba(255,255,255,0.5)", padding: "0.2rem 0.6rem", borderRadius: "6px" }}>
            Comptes
          </Link>
          <Link to="/deploy" style={{ color: "white", fontSize: "0.85rem", opacity: 0.9, textDecoration: "none", border: "1px solid rgba(255,255,255,0.5)", padding: "0.2rem 0.6rem", borderRadius: "6px" }}>
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
        {theme === "dark" ? "☀️" : "🌙"}
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
  padding: "0.25rem 0.55rem",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.5)",
  background: "transparent",
  color: "white",
  fontSize: "0.95rem",
  lineHeight: 1,
};

const logoutStyle: React.CSSProperties = {
  padding: "0.35rem 0.8rem",
  borderRadius: "6px",
  border: "1px solid white",
  background: "transparent",
  color: "white",
};
