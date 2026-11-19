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
const CACHE_VERSION = "sigapro-enterprise-v9";
const ASSET_CACHE = `${CACHE_VERSION}:assets`;
const NAVIGATION_CACHE = `${CACHE_VERSION}:public-html`;
const DOCUMENT_URL = new URL("/index.html", self.location.origin).href;
const DOCUMENT_SIGNATURE = 'name="sigapro-static-app-document"';
const IS_SIGAPRO_PREVIEW = /^projetosigapro01-[a-z0-9-]+\.vercel\.app$/i.test(self.location.hostname);
// Only a branch alias (git-*) changes its content after a new Vercel deploy.
// Immutable deployment hostnames are pinned to one build; their verified
// public HTML is safe to serve from the local cache on F5.
const IS_MUTABLE_PREVIEW_ALIAS = IS_SIGAPRO_PREVIEW &&
  /^projetosigapro01-git-/i.test(self.location.hostname);

// Durante a ativação do novo SW, preservar a última geração dos bundles
// versionados: abas ainda abertas podem solicitar um chunk da release anterior.
const KEEP_CACHES = new Set([
  ASSET_CACHE,
  NAVIGATION_CACHE,
  ...(IS_SIGAPRO_PREVIEW ? [] : ["sigapro-enterprise-v8:assets"]),
]);

function isPublicAppDocument(response) {
  if (!response || !response.ok || response.type === "opaque" || response.redirected) return false;
  return (response.headers.get("content-type") || "").toLowerCase().includes("text/html");
}

async function isVerifiedPublicAppDocument(response) {
  if (!isPublicAppDocument(response)) return false;
  try {
    // Confere o marcador compilado e a raiz React. Rejeita páginas de login
    // Vercel, proxies HTML e qualquer resposta personalizada.
    const html = await response.clone().text();
    return html.includes(DOCUMENT_SIGNATURE) && html.includes('id="root"');
  } catch {
    return false;
  }
}

async function fetchCurrentPublicDocument() {
  // Permite o cookie SSO do domínio de homologação, mas nunca lê tokens do
  // SIGAPRO: só armazenamos HTML Vite com assinatura pública comprovada.
  return fetch(new Request(DOCUMENT_URL, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "follow",
  }));
}

async function updatePublicDocumentCache(prewarmBootAssets = false) {
  try {
    const response = await fetchCurrentPublicDocument();
    if (!(await isVerifiedPublicAppDocument(response))) return;
    const cache = await caches.open(NAVIGATION_CACHE);
    await cache.put(DOCUMENT_URL, response.clone());
    if (prewarmBootAssets) await precacheBootAssets(await response.clone().text());
  } catch {
    // Sem internet, a cópia pública anteriormente validada continua disponível.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // Preparar antes de controlar a aba evita a primeira navegação sem cache.
    await updatePublicDocumentCache(true);
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
      .then(async () => {
        // Navigation Preload begins the fresh HTML request while Chrome boots
        // the Service Worker. The moving preview alias MUST remain network-
        // first to avoid reusing a previous deploy's Neon/Auth configuration.
        if (IS_MUTABLE_PREVIEW_ALIAS) {
          try {
            await self.registration?.navigationPreload?.enable?.();
          } catch {
            // No navigation preload in this browser: ordinary fetch remains safe.
          }
        }
        return self.clients.claim();
      }),
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


// Preparar os bundles REAIS do HTML Vite ANTES do primeiro F5. Sem isso, o SW
// registrado após window.load não viu os JS/CSS da primeira visita, e um F5
// ainda precisava baixá-los pela rede antes de renderizar React.
function collectPublicBootAssetUrls(html) {
  const matches = html.matchAll(/(?:src|href)=["'](\/assets\/[^"'?#]+\.(?:m?js|css))(?:\?[^"']*)?["']/gi);
  return [...new Set(Array.from(matches, (match) => new URL(match[1], self.location.origin).href))].slice(0, 24);
}

function isPublicVersionedAsset(url) {
  try {
    const parsed = new URL(url, self.location.origin);
    return (
      parsed.origin === self.location.origin &&
      parsed.pathname.startsWith("/assets/") &&
      /\.(?:m?js|css)$/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

async function precachePublicAssetUrls(urls) {
  const safeUrls = Array.from(new Set(urls.filter(isPublicVersionedAsset))).slice(0, 64);
  await Promise.allSettled(safeUrls.map((url) =>
    cacheFirst(new Request(url, { credentials: "same-origin", cache: "no-store" }), ASSET_CACHE),
  ));
}

async function precacheBootAssets(html) {
  await precachePublicAssetUrls(collectPublicBootAssetUrls(html));
}

// A primeira visita carregou chunks antes da ativação do SW. Após claim(),
// o cliente informa SOMENTE URLs JS/CSS de /assets/ já usadas naquela aba.
// A solicitação não inclui credenciais, DOM, imagens, dados nem rotas privadas.
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "SIGAPRO_PRECACHE_USED_ASSETS") return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls.slice(0, 64) : [];
  event.waitUntil(precachePublicAssetUrls(urls.filter((url) => typeof url === "string")));
});

/**
 * Chrome toolbar reload: retain the ACTUAL live document, not a stored image.
 * Only on the moving SIGAPRO QA preview, and only after a fresh positive answer
 * from the currently mounted, authenticated React workspace. A 204 navigation
 * response cancels replacement of the current document; the page itself
 * revalidates its canonical backend data after a successful handshake.
 *
 * No DOM, credentials, pages, profiles or documents enter SW storage.
 * Hard reloads/unsupported browsers/auth failures use the normal navigation.
 */
async function tryPreserveLiveQaDocument(event) {
  const request = event.request;
  const activeClientId = event.replacesClientId || event.clientId;
  if (!IS_MUTABLE_PREVIEW_ALIAS ||
      (request.isReloadNavigation !== true && event.isReload !== true) ||
      !activeClientId || typeof MessageChannel !== "function") return false;

  let client;
  try {
    client = await self.clients.get(activeClientId);
  } catch {
    return false;
  }
  if (!client || client.type !== "window" || !client.url) return false;

  const requested = new URL(request.url);
  const current = new URL(client.url);
  // Client.url is the document's ORIGINAL navigation URL in SPA routing: it
  // does NOT track React Router pushState/replaceState. Comparing path/search
  // here rejected the very first toolbar refresh after each internal page
  // change. Only require the exact SAME ORIGIN at the SW boundary; the actual
  // current window.location and authorized route are verified by the mounted
  // React client over the one-time MessageChannel below.
  if (requested.origin !== self.location.origin ||
      requested.origin !== current.origin) return false;

  // Explicit permission comes from the currently rendered React page, not
  // from a cached authentication claim in the Service Worker.
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const expectedLocation = requested.pathname + requested.search;
    let finished = false;
    const finish = (approved) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      try { channel.port1.close(); } catch { /* no-op */ }
      resolve(approved);
    };
    const timeout = setTimeout(() => finish(false), 650);
    channel.port1.onmessage = (reply) => {
      const data = reply.data;
      const approved = data && data.type === "SIGAPRO_LIVE_RELOAD_ELIGIBLE" &&
        data.eligible === true && data.location === expectedLocation;
      if (!approved) return finish(false);
      try {
        client.postMessage({
          type: "SIGAPRO_LIVE_RELOAD_REFRESH",
          location: expectedLocation,
        });
        finish(true);
      } catch {
        finish(false);
      }
    };
    try {
      client.postMessage({
        type: "SIGAPRO_LIVE_RELOAD_PROBE",
        location: expectedLocation,
      }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

async function respondToNavigation(request, event) {
  // Opening CacheStorage can block on disk. Never make the browser wait for
  // it before fetching/painting the current HTML on a moving QA alias.
  const path = new URL(request.url).pathname;
  const isIdentityRoute = path === "/acesso" || path === "/recuperar-senha" || path === "/criar-conta";

  // CRITICAL: A preview is not a pinned offline release. The old cache-first
  // handler could keep serving yesterday's Vite HTML and its embedded Neon
  // Auth/Data endpoints after a READY deployment, making real login fail even
  // when Vercel and Neon settings were correct. Always fetch the CURRENT
  // app document for previews and for identity flows.
  if (IS_MUTABLE_PREVIEW_ALIAS || isIdentityRoute) {
    try {
      // A browser-provided preload is the CURRENT network response; never a
      // cached document from a previous commit. It avoids a second serialized
      // wait while the worker starts during F5 / Chrome toolbar refresh.
      let preloaded;
      try {
        preloaded = await event.preloadResponse;
      } catch {
        preloaded = undefined;
      }
      const response = preloaded ||
        await fetch(request, { cache: "no-store", credentials: "same-origin" });
      // Do not hold the browser's navigation response until its duplicate
      // HTML body has been fully read and verified. This serial wait was
      // adding an empty first-paint interval on the mutable QA alias.
      // Send the CURRENT network document immediately; validate only a clone
      // in waitUntil before allowing it into the public document cache.
      if (isPublicAppDocument(response)) {
        const candidate = response.clone();
        event.waitUntil((async () => {
          if (await isVerifiedPublicAppDocument(candidate)) {
            const cache = await caches.open(NAVIGATION_CACHE);
            await cache.put(DOCUMENT_URL, candidate);
          }
        })().catch(() => {}));
      }
      // Never persist Vercel SSO, redirects, error HTML or app responses.
      return response;
    } catch {
      // Preview auth must fail closed instead of displaying a stale bundle
      // pointing at a different database branch. On the official domain,
      // offline access may still display a verified public shell.
      if (IS_SIGAPRO_PREVIEW) return Response.error();
      const cache = await caches.open(NAVIGATION_CACHE);
      const cachedOffline = await cache.match(DOCUMENT_URL);
      if (await isVerifiedPublicAppDocument(cachedOffline)) return cachedOffline;
      return Response.error();
    }
  }

  const cache = await caches.open(NAVIGATION_CACHE);
  const cached = await cache.match(DOCUMENT_URL);
  if (await isVerifiedPublicAppDocument(cached)) {
    // A pinned Vercel preview is immutable, so its verified public HTML is
    // safe to deliver immediately. Mutable branch aliases never use this path.
    // In production keep the fast offline HTML; refresh in the background.
    event.waitUntil(updatePublicDocumentCache());
    return cached;
  }
  const response = await fetch(request, { cache: "no-store" });
  if (await isVerifiedPublicAppDocument(response)) {
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
      !/\.(?:pdf|zip|xlsx?|docx?|csv|png|jpe?g|svg|webp|gif|json|xml|txt|m?js|css)$/i.test(url.pathname);
    if (isAppRoute) {
      // The browser's native refresh button is handled BEFORE it destroys
      // the old DOM. Without an authenticated live page, fall back to normal
      // network navigation. Never apply this to public login or production.
      if (IS_MUTABLE_PREVIEW_ALIAS &&
          (request.isReloadNavigation === true || event.isReload === true)) {
        event.respondWith((async () => {
          const preserved = await tryPreserveLiveQaDocument(event);
          if (preserved) return new Response(null, {
            status: 204,
            headers: { "Cache-Control": "no-store" },
          });
          return respondToNavigation(request, event);
        })());
      } else {
        event.respondWith(respondToNavigation(request, event));
      }
    }
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
