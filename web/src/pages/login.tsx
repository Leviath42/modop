import { type FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth-context";
import { getStoredTheme, toggleTheme, watchTheme, type Theme } from "../theme";
import { Button, buttonVariants } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Input, Label } from "../components/ui/input";
import { Alert } from "../components/ui/dialog";
import { cn } from "../lib/utils";

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

export default function LoginPage() {
  const { user, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [theme, setTheme] = useState<Theme>(() =>
    (document.documentElement.dataset.theme as Theme) || getStoredTheme()
  );
  useEffect(() => watchTheme(setTheme), []);

  useEffect(() => {
    fetch("/api/auth/oidc/status")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j: { enabled?: boolean }) => setSsoEnabled(Boolean(j.enabled)))
      .catch(() => setSsoEnabled(false));
  }, []);
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
    <main className="mx-auto mt-[10vh] w-full max-w-sm px-4">
      <Button
        onClick={() => setTheme(toggleTheme())}
        aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
        title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
        variant="outline"
        size="icon"
        className="fixed top-4 right-4"
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </Button>
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold">Modop</h1>
          <p className="text-sm text-muted-foreground">Modes opératoires</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="login-password">Mot de passe</Label>
              <Input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && <Alert variant="error">{error}</Alert>}
            <Button type="submit" disabled={busy}>
              {busy ? "Connexion…" : "Se connecter"}
            </Button>
            {ssoEnabled && (
              <>
                <p className="m-0 text-center text-sm text-muted-foreground">ou</p>
                <a href="/api/auth/oidc/login" className={cn(buttonVariants({ variant: "outline" }))}>
                  Se connecter avec le SSO
                </a>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
