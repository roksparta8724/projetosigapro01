import {describe,expect,it} from "vitest";
import {
  isSyntheticQaProtocolGuideCode, protocolPaymentEvidenceLabel,
  isFinancialTestGuide,isReportedCompensatedGuide,guideFinancialEvidenceLabel,
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

describe("classificação financeira sem arrecadação fictícia",()=>{
  it("identifica QA04 pelo atestado bancário mesmo com status compensado",()=>{
    const fixture={code:"DAM-PRE-QA04",status:"compensada",bankStatus:"QA_SYNTHETIC_NOT_BANK_PAID"};
    expect(isFinancialTestGuide(fixture)).toBe(true);
    expect(isReportedCompensatedGuide(fixture)).toBe(false);
    expect(guideFinancialEvidenceLabel(fixture)).toContain("sem arrecadação real");
  });
  it("impede contabilização de transações de teste do prestador",()=>{
    expect(isFinancialTestGuide({code:"MP-TEST-001",providerEnvironment:"test"})).toBe(true);
    expect(isReportedCompensatedGuide({code:"MP-TEST-001",providerEnvironment:"test",status:"compensada"})).toBe(false);
    expect(isReportedCompensatedGuide({code:"REAL-002",providerEnvironment:"production",status:"compensada"})).toBe(true);
    expect(isFinancialTestGuide({code:"REAL-002",providerEnvironment:"production"})).toBe(false);
  });
  it("os dois painéis mantêm a guia visível no livro e fora do KPI",()=>{
    const finance=readFileSync("src/pages/saas/FinanceDeskPage.tsx","utf8");
    const dashboard=readFileSync("src/pages/saas/DashboardHomePage.tsx","utf8");
    expect(finance).toContain("simulatedGuideCount");
    expect(finance).toContain("isReportedCompensatedGuide(guide)");
    expect(finance).toContain("guideFinancialEvidenceLabel(guide)");
    expect(dashboard).toContain("simulatedGuideCount");
    expect(dashboard).toContain("displayGuides = allDisplayGuides.filter");
    expect(dashboard).toContain("paymentVolume = displayGuides.reduce");
  });
});
