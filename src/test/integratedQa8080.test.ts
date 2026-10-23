import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const launcher = readFileSync(resolve(process.cwd(), "scripts/dev-qa.mjs"), "utf8");
const vite = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
const orchestrator = readFileSync(resolve(process.cwd(), "scripts/start-integrated-qa-8080.ps1"), "utf8");
const analyst = readFileSync(resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"), "utf8");

describe("SIGAPRO QA: UI integrada no localhost 8080 sem misturar bancos", () => {
  it("permite apenas 8080/8081 e fixa Neon QA", () => {
    expect(launcher).toContain('requestedPort !== "8080" && requestedPort !== "8081"');
    expect(launcher).toContain('SIGAPRO_LOCAL_QA_LAUNCH: "true"');
    expect(launcher).toContain('VITE_SIGAPRO_NEON_ISOLATED: "true"');
    expect(launcher).toContain("VITE_NEON_DATA_API_URL: qaBranchData");
    expect(launcher).toContain('SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES: "true"');
  });
  it("servidor mostra porta real no dev-source e preserva bloqueios de escrita", () => {
    expect(vite).toContain('process.env.SIGAPRO_LOCAL_QA_PORT === "8080"');
    expect(vite).toContain('neonEnvironment: process.env.SIGAPRO_LOCAL_QA_LAUNCH === "true" ? "isolated-qa" : "official"');
    expect(vite).toContain("SIGAPRO_QA_PUBLIC_BRANDING_READ");
    expect(vite).toContain('"/api/r2-upload"');
    expect(vite).toContain('"/api/mercadopago/guide-boleto"');
  });
  it("exige branch limpa e servidor SIGAPRO identificado antes de trocar 8080", () => {
    expect(orchestrator).toContain("git -C $root merge --ff-only");
    expect(orchestrator).toContain("git -C $root status --porcelain");
    expect(orchestrator).toContain('source.app -ne "SIGAPRO"');
    expect(orchestrator).toContain('neonEnvironment -ne "isolated-qa"');
    expect(orchestrator).not.toMatch(/\bgit[^\r\n]*\breset\b/i);
    expect(orchestrator).not.toContain("Remove-Item");
  });
  it("confere se o módulo de análise servido realmente contém o card IA", () => {
    expect(analyst).toContain('data-sigapro-ai-access="pilot"');
    expect(orchestrator).toContain("data-sigapro-ai-access");
    expect(orchestrator).toContain("AnalystDeskPage.tsx");
  });
});