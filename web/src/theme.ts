// Thème clair/sombre. L'état est porté par <html data-theme="..."> pour que
// le CSS s'applique partout, y compris avant React. Le script inline de
// index.html fait la même chose au chargement : au premier rendu React,
// dataset.theme est TOUJOURS déjà défini (jamais de flash ni de saut).
export type Theme = "light" | "dark";
const STORAGE_KEY = "modop-theme";

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch { /* localStorage indisponible */ }
  return document.documentElement.dataset.theme === "dark"
    || window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#15191d" : "#517485");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* localStorage indisponible */ }
  // Persistance serveur : le cookie permet au serveur d'injecter le bon
  // data-theme directement dans le HTML — insensible aux caches HTTP/CDN.
  try {
    document.cookie = `${STORAGE_KEY}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch { /* cookies indisponibles */ }
}

export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

// Persistance multi-contextes : un autre onglet (ou la PWA) qui change le
// thème doit se répercuter ici sans rechargement.
export function watchTheme(onChange: (t: Theme) => void): () => void {
  const h = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
      document.documentElement.dataset.theme = e.newValue;
      onChange(e.newValue);
    }
  };
  window.addEventListener("storage", h);
  return () => window.removeEventListener("storage", h);
}