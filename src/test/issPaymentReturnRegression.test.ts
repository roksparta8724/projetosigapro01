import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("ISS payment return workflow", () => {
  it("returns a compensated ISS process to Urbanism ownership", () => {
    const platform = read("src/lib/platform.ts");

    expect(platform).toContain("hasCompensatedIssReturnedToAnalysis");
    expect(platform).toContain('guide.kind === "iss_obra" && guide.status === "compensada"');
    expect(platform).toContain('return userDepartment === "analise"');
  });

  it("moves the Finance user away from a process after payment instead of showing access denied", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(detail).toContain("Pagamento confirmado. O processo retornou automaticamente à Análise Urbanística.");
    expect(detail).toContain("/prefeitura/financeiro/protocolos?retorno=analise");
    expect(detail).toContain("{ replace: true }");
  });

  it("keeps paid processes in the Finance registry for audit history", () => {
    const finance = read("src/pages/saas/FinanceProtocolsPage.tsx");

    expect(finance).toContain("O Financeiro precisa manter o livro de registro");
    expect(finance).toContain("matchesOperationalScope");
    expect(finance).toContain("permanece registrado no histórico financeiro");
  });

  it("versions an atomic database guard for the final deployment", () => {
    const migration = read("neon/migrations/20261015_iss_payment_returns_to_analysis.sql");

    expect(migration).toContain("sync_paid_iss_return_to_analysis_v1");
    expect(migration).toContain("Retorno automático após compensação da Guia de ISSQN / Projeto");
    expect(migration).toContain("current_department='Análise Urbanística'");
    expect(migration).toContain("status='analise_tecnica'");
    expect(migration).toContain("trg_sync_paid_iss_return_to_analysis_v1");
  });
});
