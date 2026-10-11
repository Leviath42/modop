// Service worker Modop — consultation hors ligne des éléments déjà chargés.
// Stratégie : network-first avec repli cache (les MO déjà consultés restent
// lisibles sans réseau ; l'API non consultée renvoie une erreur propre).
const CACHE = "modop-v9";
const PRECACHE = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/auth")) return;
  // Navigation (index.html) : TOUJOURS réseau d'abord — sinon une mise à
  // jour de l'app (nouveau script de thème, nouveau front) reste invisible
  // jusqu'au 2e rechargement, et le thème peut "sauter" avec un vieux HTML servi depuis le cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? new Response("Hors ligne", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached ?? new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "content-type": "application/json" } }))
      )
  );
});
