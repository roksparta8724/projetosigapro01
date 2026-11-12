const CACHE_VERSION = "sigapro-enterprise-v7";
const ASSET_CACHE = `${CACHE_VERSION}:assets`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("sigapro-enterprise-") && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function safeAssetResponse(request, response) {
  if (!response || !response.ok || response.type === "opaque") return false;
  const type = (response.headers.get("content-type") || "").toLowerCase();
  // SPA rewrites can return HTTP 200 + index.html for a missing hashed asset.
  // Cache-first MUST NOT preserve HTML under a JavaScript/CSS asset URL.
  if (!type || type.includes("text/html") || type.includes("application/xhtml+xml")) return false;
  const path = new URL(request.url).pathname.toLowerCase();
  if (/\.(?:m?js|cjs)$/.test(path)) return /javascript|ecmascript/.test(type);
  if (/\.css$/.test(path)) return type.includes("text/css");
  return true;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    if (safeAssetResponse(request, cached)) return cached;
    await cache.delete(request);
  }

  const response = await fetch(request);
  if (safeAssetResponse(request, response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Never cache the app shell: a cached index.html can boot an obsolete release.
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Fotos e brasões são dados mutáveis por usuário/Prefeitura. Nunca
  // armazenar respostas dessas rotas no Cache Storage do Service Worker:
  // cache-first devolvia a foto antiga após salvar e mudar de conta.
  // Deixar o navegador buscar a versão autorizada diretamente da rede.
  if (
    url.pathname === "/api/profile-avatar-open" ||
    url.pathname === "/api/municipality-logo-open"
  ) {
    return;
  }
});
