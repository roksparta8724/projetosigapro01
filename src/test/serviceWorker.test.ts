import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerEvent = { waitUntil: (work: Promise<unknown>) => void };
type FetchEvent = { request: { method: string; mode: string; url: string }; respondWith: (work: Promise<unknown>) => void };

function loadWorker() {
  const listeners = new Map<string, (event: WorkerEvent & FetchEvent) => void>();
  const deleteCache = vi.fn(async () => true);
  const openCache = vi.fn(async () => ({ match: vi.fn(), put: vi.fn() }));
  const fetch = vi.fn(async () => "fresh-html");
  const self = {
    location: { origin: "https://municipio.sigapromunicipal.com.br" },
    addEventListener: (name: string, listener: (event: WorkerEvent & FetchEvent) => void) => listeners.set(name, listener),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };

  runInNewContext(readFileSync(resolve(process.cwd(), "public/sigapro-sw.js"), "utf8"), {
    self,
    caches: {
      keys: async () => ["sigapro-enterprise-v1:app", "sigapro-enterprise-v1:assets", "sigapro-enterprise-v2:assets"],
      delete: deleteCache,
      open: openCache,
    },
    fetch,
    URL,
  });

  return { listeners, deleteCache, openCache, fetch };
}

describe("service worker do SIGAPRO", () => {
  it("busca HTML de navegacao na rede sem reutilizar o app shell antigo", async () => {
    const worker = loadWorker();
    let response: Promise<unknown> | undefined;
    worker.listeners.get("fetch")?.({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://municipio.sigapromunicipal.com.br/criar-conta",
      },
      respondWith: (work) => { response = work; },
    } as FetchEvent & WorkerEvent);

    expect(await response).toBe("fresh-html");
    expect(worker.fetch).toHaveBeenCalledWith(expect.objectContaining({ mode: "navigate" }), { cache: "no-store" });
    expect(worker.openCache).not.toHaveBeenCalled();
  });

  it("remove o cache de HTML da versao anterior na ativacao", async () => {
    const worker = loadWorker();
    let activation: Promise<unknown> | undefined;
    worker.listeners.get("activate")?.({ waitUntil: (work) => { activation = work; } } as WorkerEvent & FetchEvent);

    await activation;
    expect(worker.deleteCache).toHaveBeenCalledWith("sigapro-enterprise-v1:app");
    expect(worker.deleteCache).toHaveBeenCalledWith("sigapro-enterprise-v1:assets");
    expect(worker.deleteCache).not.toHaveBeenCalledWith("sigapro-enterprise-v2:assets");
  });
});
