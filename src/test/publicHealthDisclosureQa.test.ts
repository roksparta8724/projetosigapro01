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
    const helper=readFileSync("server/municipal-storage.ts","utf8");
    const sql=readFileSync("neon/migrations/20261127_municipal_storage_ready_v2.sql","utf8");
    expect(source).toContain('municipalStorageCommand(req,municipalityId,"save"');
    expect(helper).toContain('callDataApiRpc<MunicipalStorageConnection>(req,"municipal_storage_command_v2"');
    expect(helper).toContain('if (!token)');
    expect(sql).toContain("expected IS DISTINCT FROM _mac");
    expect(sql).toContain("public.current_profile_id()");
    expect(sql).toContain("Sem permissão para o armazenamento desta Prefeitura");
    expect(sql).toContain("FROM PUBLIC,anonymous");
    expect(source).toContain('if (req.method !== "POST")');
  });
});
