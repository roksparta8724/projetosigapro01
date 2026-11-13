import { describe, expect, it } from "vitest";
import type { ProcessRecord, ProcessDocument } from "@/lib/platform";
import { hasCompensatedInitialGuide, isReadyForProtocolDispatch } from "@/lib/triageReadiness";

const types = ["Projeto Arquitetônico","Memorial Descritivo","ART/RRT","Escritura/Matrícula"];
const docs: ProcessDocument[] = types.map((label) => ({
  id: label, label, required: true, uploaded: true, signed: false,
  reviewStatus: "aprovado", version: 1, source: "profissional",
  filePath: "municipalities/qa/test.pdf",
}));
const fixture = (): ProcessRecord => ({
  id: "qa-protocol", type: "Aprovação de Projeto", isOfficial: true,
  status: "triagem", triage: { status: "concluido" }, documents: docs,
  payment: { guideNumber: "QA-01", status: "compensada", amount: 1, dueDate: "2026-11-01", guides: [
    { kind: "protocolo", code: "QA-01", label: "Guia de Protocolo", status: "compensada", amount: 1, dueDate: "2026-11-01" },
  ] },
} as ProcessRecord);

describe("SIGAPRO: formal protocol dispatch readiness", () => {
  it("permits dispatch after payment+review+triage even if workflow status was not refreshed", () => {
    expect(hasCompensatedInitialGuide(fixture())).toBe(true);
    expect(isReadyForProtocolDispatch(fixture())).toBe(true);
  });
  it("does not dispatch unpaid, partially triaged or missing-doc processes", () => {
    const unpaid = fixture(); unpaid.payment.guides![0].status = "pendente";
    expect(isReadyForProtocolDispatch(unpaid)).toBe(false);
    const triage = fixture(); triage.triage.status = "em_triagem";
    expect(isReadyForProtocolDispatch(triage)).toBe(false);
    const missing = fixture(); missing.documents = docs.slice(0,2);
    expect(isReadyForProtocolDispatch(missing)).toBe(false);
    const draft = fixture(); draft.isOfficial = false;
    expect(isReadyForProtocolDispatch(draft)).toBe(false);
  });
});
