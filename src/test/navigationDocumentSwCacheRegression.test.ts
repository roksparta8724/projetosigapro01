// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const origin = "https://sigapromunicipal.com.br";
const indexUrl = origin + "/index.html";
const sw = readFileSync(resolve(process.cwd(), "public/sigapro-sw.js"), "utf8");

function appHtml(release: string) {
  return new Response("<!doctype html><html><body><div id='root'></div>" + release + "</body></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function harness() {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const opened: string[] = [];
  const removed: string[] = [];
  const fetcher = vi.fn(async (_request: Request | { url: string }) => appHtml("release-A"));

  const cachesMock = {
    keys: async () => Array.from(stores.keys()),
    delete: async (name: string) => {
      removed.push(name);
      return stores.delete(name);
    },
    open: async (name: string) => {
      opened.push(name);
      if (!stores.has(name)) stores.set(name, new Map());
      const cache = stores.get(name)!;
      return {
        match: async (request: string | Request) => cache.get(typeof request === "string" ? request : request.url),
        put: async (request: string | Request, response: Response) => {
          cache.set(typeof request === "string" ? request : request.url, response);
        },
        delete: async (request: string | Request) => cache.delete(typeof request === "string" ? request : request.url),
      };
    },
  };

  runInNewContext(sw, {
    self: {
      location: { origin },
      addEventListener: (name: string, fn: (event: unknown) => void) => handlers.set(name, fn),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches: cachesMock,
    fetch: fetcher,
    URL,
    Request,
    Response,
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
    let reply: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: { method: "GET", mode: "navigate", url },
      respondWith: (p: Promise<Response>) => { reply = p; },
      waitUntil: (p: Promise<unknown>) => background.push(p),
    });
    return { response: await reply!, background };
  }

  return { install, navigate, fetcher, opened, removed, stores, handlers, cachesMock };
}

describe("SIGAPRO F5 — HTML público preparado pelo Service Worker", () => {
  it("já armazena o documento público na instalação e entrega HTML sem aguardar a rede", async () => {
    const h = harness();
    await h.install();
    expect(h.stores.get("sigapro-enterprise-v8:public-html")?.has(indexUrl)).toBe(true);
    const count = h.fetcher.mock.calls.length;
    h.fetcher.mockImplementation(async () => new Promise<Response>(() => undefined)); // rede travada
    const result = await h.navigate(origin + "/prefeitura");
    expect(await result.response.text()).toContain("release-A");
    expect(h.fetcher).toHaveBeenCalledTimes(count + 1); // revalidação assíncrona
  });

  it("atualiza o HTML público em background sem atrasar a visualização", async () => {
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

  it("não intercepta endpoint protegido nem salva avatar, token, documento ou guia", async () => {
    const h = harness();
    await h.install();
    const cache = h.stores.get("sigapro-enterprise-v8:public-html")!;
    const initialEntries = cache.size;
    const paths = [
      "/api/profile-avatar-open?user=1",
      "/api/municipality-logo-open?tenant=2",
      "/api/processes",
      "/api/guide-payments",
      "/api/e-sign-artifact",
    ];
    for (const path of [...paths, "/file.pdf", "/assets/index.js", "/.well-known/security.txt"]) {
      for (const mode of ["cors", "navigate"]) {
        let responded = false;
        h.handlers.get("fetch")!({
          request: { method: "GET", mode, url: origin + path },
          respondWith: () => { responded = true; },
        });
        expect(responded).toBe(false);
      }
    }
    expect(cache.size).toBe(initialEntries);
    expect([...cache.keys()]).toEqual([indexUrl]);
  });

  it("nunca guarda resposta HTML inválida nem expõe HTML individual no cache de /assets", async () => {
    const h = harness();
    h.fetcher.mockImplementation(async () => new Response("redirected", {
      status: 302, headers: { location: "/acesso", "content-type": "text/html" },
    }));
    await h.install();
    expect(h.stores.get("sigapro-enterprise-v8:public-html")?.size ?? 0).toBe(0);
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
