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
  constructor(private body: string, private options: { status?: number; contentType?: string } = {}) {}
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

function harness() {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, TestResponse>>();
  const removed: string[] = [];
  const fetcher = vi.fn(async (_request: TestRequest | { url: string }) => appHtml("release-A"));

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
      location: { origin },
      addEventListener: (name: string, fn: (event: unknown) => void) => handlers.set(name, fn),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches: cachesMock,
    fetch: fetcher,
    URL,
    Request: TestRequest,
    Response: TestResponse,
    Set,
    Promise,
  });

  async function install() {
    const waits: Promise<unknown>[] = [];
    handlers.get("install")!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  async function navigate(url = origin + "/prefeitura") {
    const background: Promise<unknown>[] = [];
    let reply: Promise<TestResponse> | undefined;
    handlers.get("fetch")!({
      request: { method: "GET", mode: "navigate", url },
      respondWith: (p: Promise<TestResponse>) => { reply = p; },
      waitUntil: (p: Promise<unknown>) => background.push(p),
    });
    return { response: await reply!, background };
  }

  return { install, navigate, fetcher, removed, stores, handlers, cachesMock };
}

describe("SIGAPRO F5 — HTML público preparado pelo Service Worker", () => {
  it("armazena na instalação e entrega o documento sem esperar a rede", async () => {
    const h = harness();
    await h.install();
    expect(h.stores.get("sigapro-enterprise-v8:public-html")?.has(indexUrl)).toBe(true);
    const count = h.fetcher.mock.calls.length;
    h.fetcher.mockImplementation(async () => new Promise<TestResponse>(() => undefined)); // rede travada
    const result = await h.navigate(origin + "/prefeitura");
    expect(await result.response.text()).toContain("release-A");
    expect(h.fetcher).toHaveBeenCalledTimes(count + 1);
  });

  it("atualiza o HTML em background sem atrasar a visualização", async () => {
    const h = harness();
    await h.install();
    h.fetcher.mockImplementation(async () => appHtml("release-B"));
    const first = await h.navigate(origin + "/dashboard");
    expect(await first.response.text()).toContain("release-A");
    await Promise.all(first.background);
    const second = await h.navigate(origin + "/dashboard");
    expect(await second.response.text()).toContain("release-B");
    await Promise.all(second.background);
  });

  it("não intercepta URLs de APIs, PDFs, downloads ou assets diretos", async () => {
    const h = harness();
    await h.install();
    const cache = h.stores.get("sigapro-enterprise-v8:public-html")!;
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
      expect(h.stores.get("sigapro-enterprise-v8:public-html")?.size ?? 0).toBe(0);
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

    const assets = h.stores.get("sigapro-enterprise-v8:assets")!;
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

  it("preserva a geração anterior de chunks durante a ativação", async () => {
    const h = harness();
    await h.cachesMock.open("sigapro-enterprise-v7:assets");
    await h.cachesMock.open("sigapro-enterprise-v6:assets");
    await h.install();
    const waits: Promise<unknown>[] = [];
    h.handlers.get("activate")!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect(h.removed).toContain("sigapro-enterprise-v6:assets");
    expect(h.removed).not.toContain("sigapro-enterprise-v7:assets");
    expect(h.removed).not.toContain("sigapro-enterprise-v8:public-html");
  });
});
