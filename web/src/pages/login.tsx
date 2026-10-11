import { type FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth-context";
import { getStoredTheme, toggleTheme, type Theme } from "../theme";

export default function LoginPage() {
  const { user, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>(() =>
    (document.documentElement.dataset.theme as Theme) || getStoredTheme()
  );

  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Connexion impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: "360px", margin: "10vh auto", padding: "1rem" }}>
      <button
        onClick={() => setTheme(toggleTheme())}
        aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
        title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
        style={{
          position: "fixed",
          top: "1rem",
          right: "1rem",
          padding: "0.3rem 0.6rem",
          borderRadius: "6px",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          fontSize: "1rem",
          lineHeight: 1,
        }}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
      <h1>Modop</h1>
      <p style={{ color: "var(--text-muted)" }}>Modes opératoires</p>
      <form onSubmit={submit} style={{ display: "grid", gap: "0.75rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="username"
          />
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Mot de passe
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete="current-password"
          />
        </label>
        {error && (
          <p role="alert" style={{ color: "var(--error-text)", margin: 0 }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.5rem",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  fontSize: "1rem",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.6rem",
  borderRadius: "6px",
  border: "none",
  background: "var(--accent)",
  color: "white",
  fontSize: "1rem",
};
