import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("api/storage-connection.ts", "utf8");

describe("SIGAPRO QA — saúde pública sem divulgação de infraestrutura", () => {
  it("responde somente liveness, sem expor inventário de chaves, provedores e buckets", () => {
    const beginning = source.indexOf('if (req.method === "GET" && actionFromQuery === "health")');
    const ending = source.indexOf('if (req.method === "OPTIONS")', beginning);
    expect(beginning).toBeGreaterThan(0);
    expect(ending).toBeGreaterThan(beginning);
    const health = source.slice(beginning, ending);
    expect(health).toContain('status: "alive"');
    expect(health).toContain('service: "sigapro"');
    expect(health).not.toContain("process.env");
    expect(health).not.toContain("env:");
    expect(health).not.toContain("hasR2");
    expect(health).not.toContain("hasOpenAi");
  });

  it("evita cache de resposta sensível e impede sniffing de conteúdo", () => {
    expect(source).toContain('res.setHeader("Cache-Control", "no-store")');
    expect(source).toContain('res.setHeader("X-Content-Type-Options", "nosniff")');
    expect(source).toContain('res.setHeader("Content-Type", "application/json; charset=utf-8")');
  });

  it("não remove o controle de autorização dos endpoints de gestão de armazenamento", () => {
    expect(source).toContain('getMunicipalStorageSecretAdmin(req, municipalityId)');
    expect(source).toContain('callDataApiRpc<T>(req, fn, body)');
    expect(source).toContain('if (req.method !== "POST")');
  });
});
