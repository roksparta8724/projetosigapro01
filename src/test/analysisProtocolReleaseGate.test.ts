import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAnalyzeProcessDocument,
  canEditAssignedAnalysisArtifact,
  canSuperviseProcessAnalysis,
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

  it("não considera triagem concluída como despacho para Análise", () => {
    const process = { ...processFixture(), status: "triagem" } as ProcessRecord;
    expect(isProcessReleasedToUrbanAnalysis(process)).toBe(false);
    expect(canAnalyzeProcessDocument(analyst, process, tenantId)).toBe(false);
  });

  it("não confunde atribuição e status de Análise com liberação se a triagem está pendente", () => {
    const process = { ...processFixture(), triage: { status: "em_triagem" } } as ProcessRecord;
    expect(isProcessReleasedToUrbanAnalysis(process)).toBe(false);
    expect(canAnalyzeProcessDocument(analyst, process, tenantId)).toBe(false);
    expect(canViewMunicipalProcessDocument(analyst, process, tenantId)).toBe(false);
  });

  it("bloqueia retificação assinada e intervenção de diretor enquanto a triagem estiver pendente", () => {
    const process = { ...processFixture(), triage: { status: "recebido" } } as ProcessRecord;
    const supervisor = { ...analyst, id: "director-1", name: "Diretor", role: "prefeitura_supervisor", title: "Diretor de Urbanismo" } as SessionUser;
    expect(canEditAssignedAnalysisArtifact(analyst, process, tenantId)).toBe(false);
    expect(canSuperviseProcessAnalysis(supervisor, process)).toBe(false);
    expect(canEditAssignedAnalysisArtifact(supervisor, process, tenantId)).toBe(false);
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


  it("possui defesa no banco em atribuição, início, escrita e despacho", () => {
    const migration = readFileSync(resolve(process.cwd(), "neon/migrations/20261101_technical_analysis_protocol_release_gate.sql"), "utf8");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.process_technical_release_verified_v1");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.process_technical_release_verified_v1(uuid) FROM PUBLIC");
    expect(migration).toContain("if not public.process_technical_release_verified_v1(_process_id) then");
    expect(migration).toContain("if not public.process_technical_release_verified_v1(_process_id)");
    expect(migration).toContain("or not public.process_is_in_analysis_area(_process_id)");
    expect(migration).toContain("if coalesce(_process.triage_status,'recebido') <> 'concluido' then");
    expect(migration).toContain("raise exception 'Conclua a triagem documental antes de encaminhar");
  });

  it("impede que a fila técnica mostre processo prematuro por mera atribuição antiga", () => {
    const desk = readFileSync(resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
    const registry = readFileSync(resolve(process.cwd(), "src/lib/analysisRegistry.ts"), "utf8");
    expect(desk).toContain("buildAnalysisRegistry(");
    expect(registry).toContain(".filter(isProcessReleasedToUrbanAnalysis)");
    expect(registry).toContain("if (!matchesOperationalScope(municipalityId, item)) return false;");
    expect(registry).toContain("return currentIds.has(item.id) || wasAnalyzed;");
  });
});
