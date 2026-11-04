import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const worker = readFileSync(resolve(process.cwd(), "public/sigapro-sw.js"), "utf8");
const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
  git: { deploymentEnabled: Record<string, boolean> };
};

describe("entrega de ativos atuais no site oficial", () => {
  it("não usa cache-first para fotos privadas e brasões de prefeituras", () => {
    let fetchHandler: ((event: {
      request: { method: string; mode: string; url: string };
      respondWith: (result: Promise<unknown>) => void;
    }) => void) | null = null;
    const openCache = vi.fn();
    const scope = {
      self: {
        location: { origin: "https://sigapromunicipal.com.br" },
        addEventListener: (name: string, handler: typeof fetchHandler) => {
          if (name === "fetch") fetchHandler = handler;
        },
      },
      caches: { open: openCache },
      URL,
      fetch: vi.fn(),
    };
    runInNewContext(worker, scope);

    expect(fetchHandler).not.toBeNull();
    for (const endpoint of [
      "/api/profile-avatar-open?objectKey=municipalities%2Ftest%2Fprofiles%2Favatar.png",
      "/api/municipality-logo-open?objectKey=municipalities%2Ftest%2Flogo.png",
    ]) {
      const respondWith = vi.fn();
      fetchHandler!({
        request: {
          method: "GET",
          mode: "cors",
          url: `https://sigapromunicipal.com.br${endpoint}`,
        },
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(openCache).not.toHaveBeenCalled();
    expect(worker).not.toContain("AVATAR_CACHE");
  });

  it("invalida caches de versões anteriores sem afetar dados do Neon", () => {
    expect(worker).toContain('CACHE_VERSION = "sigapro-enterprise-v6"');
    expect(worker).toContain('key.startsWith("sigapro-enterprise-")');
    expect(worker).toContain('event.respondWith(fetch(request, { cache: "no-store" }))');
    expect(worker).not.toContain("indexedDB");
    expect(worker).not.toContain("localStorage");
  });

  it("impede cache HTTP do HTML e das imagens privadas", () => {
    for (const source of ["/", "/index.html", "/api/profile-avatar-open", "/api/municipality-logo-open"]) {
      const rule = vercel.headers.find((item) => item.source === source);
      expect(rule, `Ausente regra de cache para ${source}`).toBeDefined();
      expect(rule?.headers.some((entry) => entry.key === "Cache-Control" && entry.value.includes("no-store"))).toBe(true);
    }
    expect(vercel.git.deploymentEnabled["workbench/logo-preview-premium-no-deploy-20261016"]).toBe(false);
  });
});
