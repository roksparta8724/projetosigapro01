import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAnalyzeProcessDocument,
  canViewMunicipalProcessDocument,
  isProcessReleasedToUrbanAnalysis,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

const tenantId = "municipio-teste";

const analyst = {
  id: "analyst-1",
  name: "Analista de Urbanismo",
  role: "analista",
  accessLevel: 2,
  tenantId,
  municipalityId: tenantId,
  title: "Analista Técnico",
  email: "analyst@example.test",
  accountStatus: "active",
  userType: "Interno",
  department: "Urbanismo e Obras",
} as SessionUser;

function processFixture(): ProcessRecord {
  return {
    id: "qa-processo-04",
    tenantId,
    municipalityId: tenantId,
    isOfficial: true,
    status: "analise_tecnica",
    triage: { status: "concluido" },
    processControl: { currentFolder: "Urbanismo e Obras" },
    analysis: { assignedProfileId: analyst.id, assignedTo: analyst.name },
    payment: {
      guideNumber: "DAM-PROTOCOLO-04",
      amount: 1,
      status: "compensada",
      dueDate: "2026-11-01",
      guides: [
        {
          kind: "protocolo",
          label: "Guia de Protocolo",
          code: "DAM-PROTOCOLO-04",
          amount: 1,
          status: "compensada",
          dueDate: "2026-11-01",
        },
      ],
    },
  } as ProcessRecord;
}

describe("QA release gate: Protocolo -> Triagem -> Análise Urbanística", () => {
  it("libera o processo após a guia compensada e a triagem concluída", () => {
    const process = processFixture();
    expect(isProcessReleasedToUrbanAnalysis(process)).toBe(true);
    expect(canAnalyzeProcessDocument(analyst, process, tenantId)).toBe(true);
    expect(canViewMunicipalProcessDocument(analyst, process, tenantId)).toBe(true);
  });

  it("não confunde atribuição e status de Análise com liberação se a triagem está pendente", () => {
    const process = { ...processFixture(), triage: { status: "em_triagem" } } as ProcessRecord;
    expect(isProcessReleasedToUrbanAnalysis(process)).toBe(false);
    expect(canAnalyzeProcessDocument(analyst, process, tenantId)).toBe(false);
    expect(canViewMunicipalProcessDocument(analyst, process, tenantId)).toBe(false);
  });

  it("não libera antes da compensação da guia inicial, mesmo com triagem marcada como concluída", () => {
    const process = processFixture();
    process.payment.guides![0].status = "pendente";
    expect(isProcessReleasedToUrbanAnalysis(process)).toBe(false);
    expect(canAnalyzeProcessDocument(analyst, process, tenantId)).toBe(false);
  });

  it("não libera pré-protocolo nem processo sem guia oficial confirmada", () => {
    const preProtocol = { ...processFixture(), isOfficial: false };
    expect(isProcessReleasedToUrbanAnalysis(preProtocol)).toBe(false);
    const noGuide = processFixture();
    noGuide.payment.guides = [];
    noGuide.payment.guideNumber = "";
    expect(isProcessReleasedToUrbanAnalysis(noGuide)).toBe(false);
  });

  it("preserva a guia inicial histórica autenticada somente no objeto payment", () => {
    const legacy = processFixture();
    legacy.payment.guides = [];
    expect(isProcessReleasedToUrbanAnalysis(legacy)).toBe(true);
  });

  it("impede que a fila técnica mostre processo prematuro por mera atribuição antiga", () => {
    const desk = readFileSync(resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
    expect(desk).toContain(".filter(isProcessReleasedToUrbanAnalysis)");
    expect(desk).toContain("if (!isProcessReleasedToUrbanAnalysis(item)) return false;");
  });
});
