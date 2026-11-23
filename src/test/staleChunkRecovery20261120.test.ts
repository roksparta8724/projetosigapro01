import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { canRetryMissingChunk, isStaleChunkFailure } from "@/lib/chunkRecovery";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const vercel = JSON.parse(read("vercel.json")) as {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const sw = read("public/sigapro-sw.js");

describe("SIGAPRO — falta de chunk PortalFrame após atualização Vercel", () => {
  it("não entrega index.html a JS antigo e preserva rotas legítimas", () => {
    const rule = vercel.rewrites.find((x) => x.destination === "/index.html");
    expect(rule).toBeDefined();
    const route = new RegExp("^" + rule!.source + "$");
    for (const page of ["/", "/acesso", "/prefeitura", "/prefeitura/analise", "/prefeitura/organograma"]) {
      expect(route.test(page), page).toBe(true);
    }
    for (const asset of ["/assets/PortalFrame-BZ04PhkO.js", "/assets/index-legacy.css",
      "/api/profile-avatar-open", "/favicon.svg", "/.well-known/assetlinks.json"]) {
      expect(route.test(asset), asset).toBe(false);
    }
    const html = vercel.headers.find(x => x.source === rule!.source);
    expect(html?.headers.some(x => x.key === "Cache-Control" && x.value.includes("no-store"))).toBe(true);
  });

  it("usa network-first em domínios oficiais e cache do HTML apenas em preview imutável", () => {
    expect(sw).toContain('CACHE_VERSION = "sigapro-enterprise-v10"');
    expect(sw).toContain("const IS_MUTABLE_APP_HOST = !IS_SIGAPRO_PREVIEW || IS_MUTABLE_PREVIEW_ALIAS;");
    expect(sw).toContain('if (IS_MUTABLE_APP_HOST || isIdentityRoute)');
    expect(sw).toContain("await event.preloadResponse");
    expect(sw).toContain("safeAssetResponse(request, response)");
    const define = (host: string) => runInNewContext(sw + "\nIS_MUTABLE_APP_HOST", {
      self: { location: { origin: "https://" + host, hostname: host }, addEventListener: () => undefined },
      URL,
    }) as boolean;
    expect(define("campolimpopaulista.sigapromunicipal.com.br")).toBe(true);
    expect(define("sigapromunicipal.com.br")).toBe(true);
    expect(define("projetosigapro01-git-qa-avatar-c-roksparta8724s-projects.vercel.app")).toBe(true);
    expect(define("projetosigapro01-123456-roksparta8724s-projects.vercel.app")).toBe(false);
  });

  it("mantém URL e autenticação e faz no máximo uma recarga por falha/rota", () => {
    const route = "/prefeitura?secao=usuarios&utm_source=chatgpt.com";
    const error = new Error("Failed to fetch dynamically imported module: https://campolimpopaulista.sigapromunicipal.com.br/assets/PortalFrame-BZ04PhkO.js");
    expect(isStaleChunkFailure(error, "https://campolimpopaulista.sigapromunicipal.com.br")).toBe(true);
    expect(isStaleChunkFailure(new Error("Falha ao carregar dados da Prefeitura"))).toBe(false);
    expect(canRetryMissingChunk(null, route, 1000)).toBe(true);
    expect(canRetryMissingChunk(JSON.stringify({ route, at: 1000 }), route, 2000)).toBe(false);
    expect(canRetryMissingChunk(JSON.stringify({ route, at: 1000 }), route, 121001)).toBe(true);
    expect(canRetryMissingChunk(JSON.stringify({ route, at: 1000 }), "/prefeitura?secao=historico", 2000)).toBe(true);
    expect(read("src/main.tsx")).toContain('window.addEventListener("vite:preloadError"');
    expect(read("src/components/platform/AppErrorBoundary.tsx")).toContain("recoverStaleChunkOnce(error)");
    expect(sw).toContain("SIGAPRO_CLEAR_STALE_APP_SHELL");
    expect(sw).not.toContain("indexedDB");
  });

  it("rejeita resposta HTML em pedidos de módulo, nunca grava HTML como chunk", async () => {
    const callbacks = new Map<string, (event: any) => void>();
    const put = vi.fn();
    const cache = { match: vi.fn(async () => undefined), put, delete: vi.fn(async () => true) };
    const documentHTML = new Response("<html>fallback errado</html>", {
      status: 200, headers: { "content-type": "text/html; charset=utf-8" },
    });
    const network = vi.fn(async () => documentHTML.clone());
    runInNewContext(sw, {
      self: {
        location: { origin: "https://campolimpopaulista.sigapromunicipal.com.br", hostname: "campolimpopaulista.sigapromunicipal.com.br" },
        addEventListener: (name: string, handler: (event: any) => void) => callbacks.set(name, handler),
      },
      caches: { open: vi.fn(async () => cache) },
      fetch: network, URL, Request, Response,
    });
    let pending: Promise<Response> | null = null;
    callbacks.get("fetch")?.({
      request: { method: "GET", mode: "cors", url: "https://campolimpopaulista.sigapromunicipal.com.br/assets/PortalFrame-BZ04PhkO.js" },
      respondWith: (value: Promise<Response>) => { pending = value; },
    });
    expect(pending).not.toBeNull();
    const response = await pending!;
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(put).not.toHaveBeenCalled();
  });
});
