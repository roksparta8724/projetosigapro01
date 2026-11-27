import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const origin = "https://sigapromunicipal.com.br";
const indexUrl = origin + "/index.html";
const source = readFileSync(resolve(process.cwd(), "public/sigapro-sw.js"), "utf8");

// Um FetchEvent em Service Worker é testado isoladamente; não depende de
// workers reais ou globais de rede ausentes no jsdom do Quality Gate.
class TestRequest {
  constructor(public url: string, public init?: Record<string, unknown>) {}
}

class TestResponse {
  constructor(private body: string | null, private options: { status?: number; contentType?: string } = {}) {}
  get status() { return this.options.status ?? 200; }
  get ok() { return (this.options.status ?? 200) >= 200 && (this.options.status ?? 200) < 300; }
  get type() { return "basic"; }
  get redirected() { return false; }
  get headers() { return { get: (name: string) => name.toLowerCase() === "content-type" ? (this.options.contentType ?? "text/html; charset=utf-8") : null }; }
  clone() { return new TestResponse(this.body, this.options); }
  async text() { return this.body; }
}

function appHtml(release: string) {
  return new TestResponse(
    '<!doctype html><html><head><meta name="sigapro-static-app-document" content="v1" /></head><body><div id="root"></div>' + release + "</body></html>",
  );
}

function harness(originOverride = origin) {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, TestResponse>>();
  const removed: string[] = [];
  const fetcher = vi.fn(async (_request: TestRequest | { url: string }) => appHtml("release-A"));
  const navigationPreloadEnable = vi.fn(async () => undefined);
  let liveClientUrl = originOverride + "/prefeitura";
  let liveActualRoute = originOverride + "/prefeitura";
  let liveClientAllowed = false;
  const liveMessages: string[] = [];
  class TestMessageChannel {
    port1: { onmessage: ((event: { data: { type: string; eligible: boolean; location: string } }) => void) | null; close: () => void };
    port2: { postMessage: (data: { type: string; eligible: boolean; location: string }) => void; close: () => void };
    constructor() {
      this.port1 = { onmessage: null, close: () => undefined };
      this.port2 = { postMessage: (data) => this.port1.onmessage?.({ data }), close: () => undefined };
    }
  }
  const liveClient = {
    type: "window", get url() { return liveClientUrl; },
    postMessage: (data: { type: string; location: string }, ports?: { postMessage: (payload: unknown) => void }[]) => {
      liveMessages.push(data.type);
      if (data.type === "SIGAPRO_LIVE_RELOAD_PROBE" && ports?.[0]) {
        ports[0].postMessage({
          type: "SIGAPRO_LIVE_RELOAD_ELIGIBLE",
          // This is the real React gate, not Client.url. It compares
          // window.location with the destination before preserving the DOM.
          eligible: liveClientAllowed &&
            new URL(liveActualRoute).pathname + new URL(liveActualRoute).search === data.location,
          location: data.location,
        });
      }
    },
  };

  const cachesMock = {
    keys: async () => Array.from(stores.keys()),
    delete: async (name: string) => {
      removed.push(name);
      return stores.delete(name);
    },
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const cache = stores.get(name)!;
      return {
        match: async (request: string | TestRequest) => cache.get(typeof request === "string" ? request : request.url),
        put: async (request: string | TestRequest, response: TestResponse) => {
          cache.set(typeof request === "string" ? request : request.url, response);
        },
        delete: async (request: string | TestRequest) => cache.delete(typeof request === "string" ? request : request.url),
      };
    },
  };

  runInNewContext(source, {
    self: {
      location: { origin: originOverride, hostname: new URL(originOverride).hostname },
      addEventListener: (name: string, fn: (event: unknown) => void) => handlers.set(name, fn),
      skipWaiting: async () => undefined,
      clients: {
        claim: async () => undefined,
        get: async (id: string) => id === "live-client" ? liveClient : undefined,
      },
      registration: { navigationPreload: { enable: navigationPreloadEnable } },
    },
    caches: cachesMock,
    fetch: fetcher,
    URL,
    Request: TestRequest,
    Response: TestResponse,
    MessageChannel: TestMessageChannel,
    setTimeout,
    clearTimeout,
    Set,
    Promise,
  });

  async function install() {
    const waits: Promise<unknown>[] = [];
    handlers.get("install")!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  async function navigate(
    url = origin + "/prefeitura",
    preloadResponse?: Promise<TestResponse>,
    options: { reload?: boolean; clientId?: string } = {},
  ) {
    const background: Promise<unknown>[] = [];
    let reply: Promise<TestResponse> | undefined;
    handlers.get("fetch")!({
      request: { method: "GET", mode: "navigate", url, isReloadNavigation: options.reload ?? false },
      replacesClientId: options.clientId || "",
      preloadResponse,
      respondWith: (p: Promise<TestResponse>) => { reply = p; },
      waitUntil: (p: Promise<unknown>) => background.push(p),
    });
    return { response: await reply!, background };
  }
  async function activate() {
    const background: Promise<unknown>[] = [];
    handlers.get("activate")!({ waitUntil: (p: Promise<unknown>) => background.push(p) });
    await Promise.all(background);
  }

  return {
    install, activate, navigate, fetcher, navigationPreloadEnable, removed,
    stores, handlers, cachesMock, liveMessages,
    setLiveClient: (documentUrl: string, allowed: boolean, currentRoute = documentUrl) => {
      liveClientUrl = documentUrl;
      liveActualRoute = currentRoute;
      liveClientAllowed = allowed;
    },
  };
}

describe("SIGAPRO F5 — HTML público preparado pelo Service Worker", () => {
  it("prepara documento na instalação e usa HTML atual da rede nos domínios de produção", async () => {
    const h = harness();
    await h.install();
    expect(h.stores.get("sigapro-enterprise-v10:public-html")?.has(indexUrl)).toBe(true);
    const count = h.fetcher.mock.calls.length;
    h.fetcher.mockImplementation(async () => appHtml("release-B"));
    const result = await h.navigate(origin + "/prefeitura");
    expect(await result.response.text()).toContain("release-B");
    expect(h.fetcher).toHaveBeenCalledTimes(count + 1);
    await Promise.all(result.background);
  });

  it("serve HTML atual antes de validar assíncronamente a cópia em CacheStorage", async () => {
    const h = harness();
    await h.install();
    h.fetcher.mockImplementation(async () => appHtml("release-B"));
    const first = await h.navigate(origin + "/dashboard");
    expect(await first.response.text()).toContain("release-B");
    await Promise.all(first.background);
    const second = await h.navigate(origin + "/dashboard");
    expect(await second.response.text()).toContain("release-B");
    await Promise.all(second.background);
  });

  it("não intercepta URLs de APIs, PDFs, downloads ou assets diretos", async () => {
    const h = harness();
    await h.install();
    const cache = h.stores.get("sigapro-enterprise-v10:public-html")!;
    for (const path of [
      "/api/profile-avatar-open?user=1",
      "/api/municipality-logo-open?tenant=2",
      "/api/processes",
      "/api/guide-payments",
      "/api/e-sign-artifact",
      "/file.pdf",
      "/assets/index.js",
      "/.well-known/security.txt",
    ]) {
      for (const mode of ["cors", "navigate"]) {
        let responded = false;
        h.handlers.get("fetch")!({
          request: { method: "GET", mode, url: origin + path },
          respondWith: () => { responded = true; },
        });
        // Bundles públicos devem usar cache-first em fetch normal; acesso
        // direto na barra de endereços não pode virar HTML de aplicação.
        expect(responded, path + " / " + mode).toBe(path.startsWith("/assets/") && mode === "cors");
      }
    }
    expect([...cache.keys()]).toEqual([indexUrl]);
  });

  it("nunca salva erro, redirecionamento ou HTML sem assinatura estática", async () => {
    for (const response of [
      new TestResponse("redirected", { status: 302 }),
      new TestResponse('<html><div id="root"></div>sem marcador</html>'),
      new TestResponse('{"fake":true}', { contentType: "application/json" }),
    ]) {
      const h = harness();
      h.fetcher.mockImplementation(async () => response);
      await h.install();
      expect(h.stores.get("sigapro-enterprise-v10:public-html")?.size ?? 0).toBe(0);
    }
  });

  it("prepara JS/CSS reais antes do primeiro F5 e recusa URLs privadas enviadas por mensagem", async () => {
    const h = harness();
    h.fetcher.mockImplementation(async (request) => {
      const url = request.url;
      if (url.endsWith("/assets/start-a.js")) {
        return new TestResponse("export const ok = true;", { contentType: "application/javascript" });
      }
      if (url.endsWith("/assets/start-b.css")) {
        return new TestResponse(":root{color:#123}", { contentType: "text/css" });
      }
      if (url.endsWith("/assets/rota-c.js")) {
        return new TestResponse("export const route = true;", { contentType: "application/javascript" });
      }
      return new TestResponse(
        '<!doctype html><html><head><meta name="sigapro-static-app-document" content="v1" />' +
        '<script type="module" src="/assets/start-a.js"></script><link rel="stylesheet" href="/assets/start-b.css">' +
        '</head><body><div id="root"></div></body></html>',
      );
    });
    await h.install();

    const assets = h.stores.get("sigapro-enterprise-v10:assets")!;
    expect([...assets.keys()]).toEqual([
      origin + "/assets/start-a.js",
      origin + "/assets/start-b.css",
    ]);

    const waits: Promise<unknown>[] = [];
    h.handlers.get("message")!({
      data: {
        type: "SIGAPRO_PRECACHE_USED_ASSETS",
        urls: [
          origin + "/assets/rota-c.js",
          origin + "/api/processes",
          origin + "/api/guide-payments",
          "https://outra-prefeitura.example.org/assets/roubo.js",
          origin + "/arquivo.pdf",
        ],
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
    expect(assets.has(origin + "/assets/rota-c.js")).toBe(true);
    expect([...assets.keys()].every((url) => url.startsWith(origin + "/assets/"))).toBe(true);
    expect(assets.size).toBe(3);
  });

  it("preserva a geração imediatamente anterior de chunks na produção e invalida as antigas", async () => {
    const h = harness();
    await h.cachesMock.open("sigapro-enterprise-v9:assets");
    await h.cachesMock.open("sigapro-enterprise-v8:assets");
    await h.cachesMock.open("sigapro-enterprise-v7:assets");
    await h.cachesMock.open("sigapro-enterprise-v6:assets");
    await h.install();
    const waits: Promise<unknown>[] = [];
    h.handlers.get("activate")!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect(h.removed).toContain("sigapro-enterprise-v6:assets");
    expect(h.removed).toContain("sigapro-enterprise-v7:assets");
    expect(h.removed).toContain("sigapro-enterprise-v8:assets");
    expect(h.removed).not.toContain("sigapro-enterprise-v9:assets");
    expect(h.removed).not.toContain("sigapro-enterprise-v10:public-html");
  });

  it("preview de homologação ignora o documento em cache e carrega sempre a publicação atual", async () => {
    const qaOrigin = "https://projetosigapro01-git-fix-homolog-53807b-roksparta8724s-projects.vercel.app";
    const h = harness(qaOrigin);
    await h.install();
    const cache = h.stores.get("sigapro-enterprise-v10:public-html");
    expect(cache?.get(qaOrigin + "/index.html")).toBeDefined();
    h.fetcher.mockImplementation(async () => appHtml("release-B"));
    const result = await h.navigate(qaOrigin + "/acesso");
    expect(await result.response.text()).toContain("release-B");
    await Promise.all(result.background);
    const next = await h.navigate(qaOrigin + "/prefeitura");
    expect(await next.response.text()).toContain("release-B");
    await Promise.all(next.background);
  });
  it("entrega o HTML atual sem esperar a verificação assíncrona da cópia de cache", async () => {
    const qaOrigin = "https://projetosigapro01-git-fix-homolog-53807b-roksparta8724s-projects.vercel.app";
    const h = harness(qaOrigin);
    await h.install();

    let allowCacheValidation: (() => void) | undefined;
    const verificationGate = new Promise<void>((resolve) => { allowCacheValidation = resolve; });
    const fresh = appHtml("release-live");
    const originalClone = fresh.clone.bind(fresh);
    fresh.clone = () => {
      const candidate = originalClone();
      const originalText = candidate.text.bind(candidate);
      candidate.text = async () => {
        await verificationGate;
        return originalText();
      };
      return candidate;
    };
    h.fetcher.mockImplementation(async () => fresh);

    // The browser must receive the actual network release even while the
    // validator is still reading a separate clone in waitUntil.
    const result = await h.navigate(qaOrigin + "/prefeitura/protocolos");
    expect(await result.response.text()).toContain("release-live");
    expect(result.background).toHaveLength(1);

    allowCacheValidation?.();
    await Promise.all(result.background);
    const cached = h.stores.get("sigapro-enterprise-v10:public-html")
      ?.get(qaOrigin + "/index.html");
    expect(await cached?.text()).toContain("release-live");
  });

  it("não espera o disco do CacheStorage para exibir uma versão atual de homologação", async () => {
    const qaOrigin = "https://projetosigapro01-git-fix-homolog-53807b-roksparta8724s-projects.vercel.app";
    const h = harness(qaOrigin);
    await h.install();
    const originalOpen = h.cachesMock.open;
    let allowCacheDisk: (() => void) | undefined;
    const diskGate = new Promise<void>((resolve) => { allowCacheDisk = resolve; });
    h.cachesMock.open = async (key: string) => {
      await diskGate;
      return originalOpen(key);
    };
    h.fetcher.mockImplementation(async () => appHtml("release-no-disk-wait"));

    const result = await h.navigate(qaOrigin + "/prefeitura/protocolos/novo");
    expect(await result.response.text()).toContain("release-no-disk-wait");
    expect(result.background).toHaveLength(1);

    allowCacheDisk?.();
    await Promise.all(result.background);
    expect(await h.stores.get("sigapro-enterprise-v10:public-html")
      ?.get(qaOrigin + "/index.html")?.text()).toContain("release-no-disk-wait");
  });

  it("ativa navigation preload na homologação móvel e usa HTML de rede pré-carregado", async () => {
    const qaOrigin = "https://projetosigapro01-git-fix-homolog-53807b-roksparta8724s-projects.vercel.app";
    const h = harness(qaOrigin);
    await h.install();
    await h.activate();
    expect(h.navigationPreloadEnable).toHaveBeenCalledTimes(1);
    const before = h.fetcher.mock.calls.length;
    const result = await h.navigate(qaOrigin + "/prefeitura", Promise.resolve(appHtml("release-B")));
    expect(await result.response.text()).toContain("release-B");
    expect(h.fetcher).toHaveBeenCalledTimes(before);
    await Promise.all(result.background);
    expect(await h.stores.get("sigapro-enterprise-v10:public-html")?.get(qaOrigin + "/index.html")?.text()).toContain("release-B");
  });

  it("reutiliza HTML validado em hostname imutável sem aguardar rede travada", async () => {
    const fixedOrigin = "https://projetosigapro01-b2w3ez88h-roksparta8724s-projects.vercel.app";
    const h = harness(fixedOrigin);
    await h.install();
    await h.activate();
    expect(h.navigationPreloadEnable).not.toHaveBeenCalled();
    h.fetcher.mockImplementation(async () => new Promise<TestResponse>(() => undefined));
    const result = await h.navigate(fixedOrigin + "/prefeitura");
    expect(await result.response.text()).toContain("release-A");
    // A eventual revalidação em background nunca atrasa a primeira pintura.
  });

  it("não confunde host imutável com branch alias que pode trocar de commit", async () => {
    const alias = "https://projetosigapro01-git-fix-homolog-53807b-roksparta8724s-projects.vercel.app";
    const h = harness(alias);
    await h.install();
    h.fetcher.mockImplementation(async () => appHtml("release-C"));
    const result = await h.navigate(alias + "/prefeitura");
    expect(await result.response.text()).toContain("release-C");
    await Promise.all(result.background);
    expect(await h.stores.get("sigapro-enterprise-v10:public-html")?.get(alias + "/index.html")?.text()).toContain("release-C");
  });

  it("aceita a PRIMEIRA recarga após troca SPA quando Client.url ainda é a página anterior", async () => {
    const qaOrigin = "https://projetosigapro01-git-fix-homolog-53807b-roksparta8724s-projects.vercel.app";
    const h = harness(qaOrigin);
    await h.install();

    // Browser documented behavior: Client.url remains the originally loaded
    // document, even though React Router now shows /prefeitura/analise.
    // The real mounted React page replies YES only for its current location.
    const updatedRoute = qaOrigin + "/prefeitura/analise";
    h.setLiveClient(qaOrigin + "/prefeitura/protocolos", true, updatedRoute);
    const initialRequests = h.fetcher.mock.calls.length;
    const result = await h.navigate(updatedRoute, undefined, {
      reload: true, clientId: "live-client",
    });

    expect(result.response.status).toBe(204);
    expect(h.liveMessages).toEqual([
      "SIGAPRO_LIVE_RELOAD_PROBE", "SIGAPRO_LIVE_RELOAD_REFRESH",
    ]);
    expect(h.fetcher).toHaveBeenCalledTimes(initialRequests);
  });

  it("rejeita cliente de outra origem mesmo que o canal declare sessão válida", async () => {
    const qaOrigin = "https://projetosigapro01-git-fix-homolog-53807b-roksparta8724s-projects.vercel.app";
    const h = harness(qaOrigin);
    await h.install();
    h.setLiveClient("https://outro-sistema.example/prefeitura/analise", true);
    h.fetcher.mockImplementation(async () => appHtml("network-checked"));
    const result = await h.navigate(qaOrigin + "/prefeitura/analise", undefined, {
      reload: true, clientId: "live-client",
    });
    expect(result.response.status).toBe(200);
    expect(await result.response.text()).toContain("network-checked");
    expect(h.liveMessages).toHaveLength(0);
  });

  it("preserva o DOM real no reload Chrome apenas com confirmação da sessão ativa", async () => {
    const qaOrigin = "https://projetosigapro01-git-fix-homolog-53807b-roksparta8724s-projects.vercel.app";
    const path = qaOrigin + "/prefeitura/protocolos";
    const h = harness(qaOrigin);
    await h.install();
    h.setLiveClient(path, true);
    const previousRequests = h.fetcher.mock.calls.length;
    const result = await h.navigate(path, undefined, { reload: true, clientId: "live-client" });
    expect(result.response.status).toBe(204);
    expect(await result.response.text()).toBeNull();
    expect(h.liveMessages).toEqual(["SIGAPRO_LIVE_RELOAD_PROBE", "SIGAPRO_LIVE_RELOAD_REFRESH"]);
    expect(h.fetcher).toHaveBeenCalledTimes(previousRequests);
    expect(result.background).toHaveLength(0);
  });

  it("nega preservação da tela se a sessão real responder que não está autorizada", async () => {
    const qaOrigin = "https://projetosigapro01-git-fix-homolog-53807b-roksparta8724s-projects.vercel.app";
    const path = qaOrigin + "/prefeitura/analise";
    const h = harness(qaOrigin);
    await h.install();
    h.setLiveClient(path, false);
    h.fetcher.mockImplementation(async () => appHtml("real-native-reload"));
    const result = await h.navigate(path, undefined, { reload: true, clientId: "live-client" });
    expect(result.response.status).toBe(200);
    expect(await result.response.text()).toContain("real-native-reload");
    expect(h.liveMessages).toEqual(["SIGAPRO_LIVE_RELOAD_PROBE"]);
  });

  it("não converte em atualização interna as visitas de outra rota, recargas forçadas ou acessos públicos", async () => {
    const qaOrigin = "https://projetosigapro01-git-fix-homolog-53807b-roksparta8724s-projects.vercel.app";
    const h = harness(qaOrigin);
    await h.install();
    h.setLiveClient(qaOrigin + "/prefeitura/protocolos", true);
    h.fetcher.mockImplementation(async () => appHtml("always-fresh"));
    for (const [path, options] of [
      ["/prefeitura/analise", { reload: true, clientId: "live-client" }],
      ["/prefeitura/protocolos", { reload: false, clientId: "live-client" }],
      ["/prefeitura/protocolos", { reload: true }],
      ["/acesso", { reload: true, clientId: "live-client" }],
    ] as const) {
      const result = await h.navigate(qaOrigin + path, undefined, options);
      expect(result.response.status).toBe(200);
      expect(await result.response.text()).toContain("always-fresh");
    }
    // The SPA path mismatch legitimately sends one PROBE and is denied by
    // the mounted React route. Login is excluded without probing at all.
    expect(h.liveMessages).toEqual(["SIGAPRO_LIVE_RELOAD_PROBE"]);
  });

});
