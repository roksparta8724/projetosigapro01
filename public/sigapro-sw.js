/*
 * SIGAPRO — navegação instantânea do documento público da aplicação.
 *
 * O /index.html é um HTML Vite ESTÁTICO: não contém dados de processos,
 * usuários ou prefeituras. A autenticação e os dados oficiais continuam a ser
 * consultados apenas depois do bootstrap e dos guardas de permissão.
 *
 * Anteriormente cada F5 forçava fetch(..., {cache:"no-store"}) do documento,
 * criando uma janela de canvas vazio antes do React. Agora a cópia pública
 * previamente verificada é entregue de imediato, e revalidada em segundo plano.
 * Recargas que ignoram o Service Worker continuam sendo recargas nativas.
 */
const CACHE_VERSION = "sigapro-enterprise-v8";
const ASSET_CACHE = `${CACHE_VERSION}:assets`;
const NAVIGATION_CACHE = `${CACHE_VERSION}:public-html`;
const DOCUMENT_URL = new URL("/index.html", self.location.origin).href;

// Durante a ativação do novo SW, preservar a última geração dos bundles
// versionados: abas ainda abertas podem solicitar um chunk da release anterior.
const KEEP_CACHES = new Set([
  ASSET_CACHE,
  NAVIGATION_CACHE,
  "sigapro-enterprise-v7:assets",
]);

function isPublicAppDocument(response) {
  if (!response || !response.ok || response.type === "opaque" || response.redirected) return false;
  return (response.headers.get("content-type") || "").toLowerCase().includes("text/html");
}

async function fetchCurrentPublicDocument() {
  // Não envia cookies ou Authorization: o HTML não deve mudar por identidade.
  return fetch(new Request(DOCUMENT_URL, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    redirect: "follow",
  }));
}

async function updatePublicDocumentCache() {
  try {
    const response = await fetchCurrentPublicDocument();
    if (!isPublicAppDocument(response)) return;
    const cache = await caches.open(NAVIGATION_CACHE);
    await cache.put(DOCUMENT_URL, response.clone());
  } catch {
    // Sem internet, a cópia pública anteriormente validada continua disponível.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // Preparar antes de controlar a aba evita a primeira navegação sem cache.
    await updatePublicDocumentCache();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("sigapro-enterprise-") && !KEEP_CACHES.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function safeAssetResponse(request, response) {
  if (!response || !response.ok || response.type === "opaque") return false;
  const type = (response.headers.get("content-type") || "").toLowerCase();
  // Rewrites SPA podem devolver HTML 200 quando um chunk não existe.
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

async function respondToNavigation(request, event) {
  const cache = await caches.open(NAVIGATION_CACHE);
  const cached = await cache.match(DOCUMENT_URL);

  if (isPublicAppDocument(cached)) {
    // Esta resposta é HTML estático público, NÃO snapshot de DOM autenticado.
    // Como o navegador não espera pela rede, reduz a janela sem interface no F5.
    event.waitUntil(updatePublicDocumentCache());
    return cached;
  }

  // Primeira visita, SW desativado ou cache inválido: buscar o documento atual.
  // Nunca fazer fallback para HTML de login personalizado ou APIs.
  const response = await fetch(request, { cache: "no-store" });
  if (isPublicAppDocument(response)) {
    await cache.put(DOCUMENT_URL, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Endpoints, PDFs, artefatos e arquivos não são páginas SPA. Em particular,
    // abrir uma URL /api/ em outra aba NUNCA pode servir o index.html cacheado.
    const isAppRoute =
      !url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/assets/") &&
      !url.pathname.startsWith("/.well-known/") &&
      !/\\.(?:pdf|zip|xlsx?|docx?|csv|png|jpe?g|svg|webp|gif|json|xml|txt|m?js|css)$/i.test(url.pathname);
    if (isAppRoute) event.respondWith(respondToNavigation(request, event));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Identidade visual é mutável, isolada por prefeitura/usuário: sempre rede.
  if (
    url.pathname === "/api/profile-avatar-open" ||
    url.pathname === "/api/municipality-logo-open"
  ) {
    return;
  }
});
