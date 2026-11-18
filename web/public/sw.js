// Service worker Modop — consultation hors ligne des éléments déjà chargés.
// Stratégie : network-first avec repli cache (les MO déjà consultés restent
// lisibles sans réseau ; l'API non consultée renvoie une erreur propre).
const CACHE = "modop-v11";
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
  // V16 (V7 #4) : les GET /api/workflows/ (MO publiés) sont pré-cachés —
  // network-first, les 200 sont mis en cache, repli hors-ligne sur le cache
  // AVANT le 503. Les autres réponses API restent hors cache (données par
  // utilisateur : un poste partagé ne doit pas servir le cache d'un autre).
  if (url.pathname.startsWith("/api/workflows/") && request.method === "GET") {
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
          caches.match(request).then(
            (cached) =>
              cached ??
              new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "content-type": "application/json" } })
          )
        )
    );
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/photos/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "content-type": "application/json" } })
      )
    );
    return;
  }
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
