import {describe,expect,it} from "vitest";
import {
  isSyntheticQaProtocolGuideCode, protocolPaymentEvidenceLabel,
} from "@/lib/qaPaymentEvidence";
import {readFileSync} from "node:fs";

describe("guia fictícia QA não é confirmação bancária",()=>{
  it("identifica somente a guia sintética explícita do processo QA 04",()=>{
    expect(isSyntheticQaProtocolGuideCode("QA-FICTICIA-SEM-COBRANCA-20261024")).toBe(true);
    expect(isSyntheticQaProtocolGuideCode("QA-FICTICIA-SEM-COBRANCA")).toBe(true);
    expect(isSyntheticQaProtocolGuideCode("GUIA-REAL-20261024")).toBe(false);
    expect(isSyntheticQaProtocolGuideCode("")).toBe(false);
    expect(isSyntheticQaProtocolGuideCode(null)).toBe(false);
  });
  it("nunca chama uma guia sintética compensada de pagamento confirmado",()=>{
    expect(protocolPaymentEvidenceLabel({
      code:"QA-FICTICIA-SEM-COBRANCA-20261024",
      status:"compensada",
    })).toContain("sem pagamento bancário");
    expect(protocolPaymentEvidenceLabel({
      code:"REAL-001",status:"compensada",
    })).toBe("Confirmado");
    expect(protocolPaymentEvidenceLabel({
      code:"REAL-001",status:"pendente",
    })).toBe("Pendente");
  });
  it("mantém identificadas simulações também nas mensagens da triagem",()=>{
    const source=readFileSync("src/pages/saas/ProtocolDeskPage.tsx","utf8");
    expect(source).toContain('protocolPaymentEvidenceLabel(protocolGuide)');
    expect(source).toContain('isSyntheticQaProtocolGuideCode(guide.code)');
    expect(source).toContain('não comprova pagamento bancário');
  });
});
