import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildConstructionPermitNumber } from "@/lib/constructionPermit";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("construction permit workflow", () => {
  it("moves a compensated ISS guide out of the current Finance stage", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(detail).toContain('issuedConstructionGuide?.status === "compensada"');
    expect(detail).toContain("Alvará de Construção");
    expect(detail).toContain("currentFlowIndex = 4");
    expect(detail).toContain(
      "Pagamento compensado pelo Financeiro. Esta etapa foi concluída",
    );
  });

  it("creates a stable municipal construction permit number", () => {
    expect(buildConstructionPermitNumber("PM-2026-00002")).toBe(
      "ALV-2026-000002",
    );
  });

  it("requires technical and director signatures before final issuance", () => {
    const model = read("src/lib/constructionPermit.ts");
    const panel = read("src/components/platform/ConstructionPermitPanel.tsx");

    expect(model).toContain('"aguardando_diretor"');
    expect(model).toContain("userCanSignPermitAsDirector");
    expect(panel).toContain("Assinatura da Análise Técnica");
    expect(panel).toContain("Assinatura da Diretoria");
    expect(panel).toContain("O sistema não cria assinatura fictícia");
  });

  it("generates a PDF with property, technical responsibility and signatures", () => {
    const pdf = read("src/lib/constructionPermitPdf.ts");

    expect(pdf).toContain("ALVARÁ DE CONSTRUÇÃO");
    expect(pdf).toContain("RESPONSÁVEL TÉCNICO");
    expect(pdf).toContain("IDENTIFICAÇÃO DO IMÓVEL E DA OBRA");
    expect(pdf).toContain("CONDIÇÕES DA LICENÇA");
    expect(pdf).toContain("ASSINATURAS MUNICIPAIS");
    expect(pdf).toContain("RASCUNHO - SEM VALIDADE");
  });

  it("keeps the database schema versioned without applying it during local validation", () => {
    const migration = read(
      "neon/migrations/20261015_construction_permit_workflow.sql",
    );

    expect(migration).toContain("create table if not exists public.construction_permits");
    expect(migration).toContain("analyst_signed_at");
    expect(migration).toContain("director_signed_at");
    expect(migration).toContain("status = 'emitido'");
  });
});
