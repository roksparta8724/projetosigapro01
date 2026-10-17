import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canFollowUpIssuedIssGuide,
  canTrackProcess,
  getExternallyVisibleProcessPaymentGuides,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

const analyst = {
  id: "profile-analyst-1",
  role: "analista",
  municipalityId: "prefeitura-a",
  tenantId: "prefeitura-a",
  department: "Urbanismo e Obras",
  accountStatus: "active",
} as SessionUser;

function movedProcess(overrides: Partial<ProcessRecord> = {}): ProcessRecord {
  return {
    id: "process-a",
    tenantId: "prefeitura-a",
    municipalityId: "prefeitura-a",
    status: "pagamento_pendente",
    processControl: { currentFolder: "Financeiro" },
    triage: { status: "concluido" },
    dispatches: [],
    analysis: { assignedProfileId: analyst.id, assignedTo: "Analista", startedAt: "2026-10-13T18:30:00Z" },
    payment: {
      guideNumber: "DAM-0001",
      amount: 10,
      status: "compensada",
      dueDate: "15/10/2026",
      guides: [
        { kind: "iss_obra", code: "DAM-ISS-001", label: "ISSQN / Projeto", amount: 120, status: "pendente", dueDate: "15/10/2026", issuedAt: "2026-10-13T18:57:16Z" },
      ],
    },
    auditTrail: [
      {
        id: "audit-iss",
        category: "financeiro",
        title: "Guia ISSQN / Projeto emitida",
        detail: "Guia registrada no Financeiro",
        actor: "Analista",
        actorProfileId: analyst.id,
        visibleToExternal: false,
        at: "13/10/2026",
      },
    ],
    ...overrides,
  } as ProcessRecord;
}

describe("ISSQN after transfer to Financeiro", () => {
  it("keeps the analyzed process trackable after the operational handoff", () => {
    const process = movedProcess();
    expect(canTrackProcess(analyst, process, analyst.municipalityId)).toBe(true);
    expect(canFollowUpIssuedIssGuide(analyst, process)).toBe(true);
  });

  it("keeps issuer audit compatibility scoped to the recorded issuer", () => {
    const process = movedProcess();
    expect(canFollowUpIssuedIssGuide({ ...analyst, id: "another-user" }, process)).toBe(false);
    expect(canFollowUpIssuedIssGuide({ ...analyst, municipalityId: "prefeitura-b", tenantId: "prefeitura-b" }, process)).toBe(false);
    expect(canFollowUpIssuedIssGuide({ ...analyst, accountStatus: "blocked" }, process)).toBe(false);
  });

  it("keeps an issued ISS guide private until the analyst explicitly shares it", () => {
    const process = movedProcess();
    process.payment.guides = [
      { kind: "protocolo", code: "DAM-001", label: "Protocolo", amount: 35.24, status: "compensada", dueDate: "14/10/2026", issuedAt: "2026-10-12T21:31:34Z" },
      { kind: "iss_obra", code: "DAM-ISS-001", label: "ISSQN / Projeto", amount: 300, status: "pendente", dueDate: "15/10/2026", issuedAt: "2026-10-13T18:57:16Z" },
    ];
    process.messages = [];

    expect(getExternallyVisibleProcessPaymentGuides(process).map((guide) => guide.code)).toEqual(["DAM-001"]);

    process.messages = [{
      id: "external-share",
      senderName: "Analista",
      senderRole: "analista",
      audience: "externo",
      message: "Guia DAM-ISS-001 liberada ao profissional.",
      at: "13/10/2026",
    }];

    expect(getExternallyVisibleProcessPaymentGuides(process).map((guide) => guide.code)).toEqual([
      "DAM-001",
      "DAM-ISS-001",
    ]);
  });

  it("requires explicit analyst review before external release and supports revision", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const backend = readFileSync(resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"), "utf8");
    expect(detail).toContain("constructionGuideSentExternally");
    expect(detail).toContain("handleReviseConstructionGuide");
    expect(detail).toContain("reviseIssProjectGuide");
    expect(detail).toContain("shareIssProjectGuide");
    expect(detail).toContain("Aguardando revisão e envio");
    expect(detail).toContain("Revisado — enviar ao profissional");
    expect(detail).toContain("showAnalysisMilestone");
    expect(detail).toContain("AnalysisReadinessPanel");
    expect(detail).toContain("ProcessIdentityPanel");
    expect(detail).toContain("ensureMercadoPagoGuideCharge");
    expect(detail).toContain("codigoBarras: barcode");
    expect(detail).toContain("linhaDigitavel: digitableLine");
    expect(detail).toContain("A guia ainda está sendo preparada. Aguarde a conclusão dos dados bancários antes de abrir.");
    expect(detail).not.toContain('.padEnd(44, "7")');
    expect(backend).toContain("actorProfileId: entry.actor_profile_id ?? undefined");
  });
});


describe("process detail workflow integrity", () => {
  it("keeps an unshared issued ISS guide in Urbanismo and exposes a dedicated process exit", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const backend = readFileSync(resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"), "utf8");

    expect(detail).toContain("holdsIssuedIssInsideUrbanism");
    expect(detail).toContain("constructionGuideSentExternally");
    expect(detail).toContain("const processExitPath");
    expect(detail).toContain("Sair do processo");
    expect(backend).toContain('issue_process_payment_guide_v2');
    const migration = readFileSync(resolve(process.cwd(), "neon/migrations/20261014_iss_manual_release_workflow.sql"), "utf8");
    expect(migration).toContain("issue_process_payment_guide_v3");
  });
});
