import {describe,expect,it} from "vitest";
import {
  isSyntheticQaProtocolGuideCode, protocolPaymentEvidenceLabel,
  isFinancialTestGuide,isReportedCompensatedGuide,guideFinancialEvidenceLabel,
  summarizeFinancialGuideEvidence,
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
    expect(dashboard).toContain("financialOverview = summarizeFinancialGuideEvidence");
    expect(dashboard).toContain("paymentVolume = financialOverview.issuedAmount");
    expect(dashboard).toContain('guides.some((guide)=>guide.status==="pendente"&&!isFinancialTestGuide(guide))');
  });
});

describe("resumo financeiro unificado entre perfis",()=>{
  it("exclui QA de totais e pendências independentemente do status",()=>{
    const summary=summarizeFinancialGuideEvidence([
      {code:"QA-FICTICIA-SEM-COBRANCA-04",status:"compensada",amount:5000},
      {code:"G-002",status:"compensada",amount:120,bankStatus:"QA_SYNTHETIC_NOT_BANK_PAID"},
      {code:"G-003",status:"pendente",amount:99,providerEnvironment:"test"},
      {code:"G-004",status:"pendente",amount:180,providerEnvironment:"production"},
      {code:"G-005",status:"compensada",amount:450,providerEnvironment:"production"},
    ]);
    expect(summary.synthetic).toHaveLength(3);
    expect(summary.issuedCount).toBe(2);
    expect(summary.pendingCount).toBe(1);
    expect(summary.compensatedCount).toBe(1);
    expect(summary.issuedAmount).toBe(630);
    expect(summary.pendingAmount).toBe(180);
    expect(summary.compensatedAmount).toBe(450);
  });
  it("ignora números inválidos sem corromper os gráficos",()=>{
    const summary=summarizeFinancialGuideEvidence([
      {code:"G-1",status:"pendente",amount:Number.NaN},
      {code:"G-2",status:"compensada",amount:Number.POSITIVE_INFINITY},
      {code:"G-3",status:"compensada",amount:-100},
      {code:"G-4",status:"compensada",amount:18.5},
    ]);
    expect(summary.issuedCount).toBe(4);
    expect(summary.issuedAmount).toBe(18.5);
    expect(summary.compensatedAmount).toBe(18.5);
  });
  it("impede alertas de divergência gerados por fixtures",()=>{
    const source=readFileSync("src/pages/saas/FinanceDeskPage.tsx","utf8");
    expect(source).toContain('guide.status !== "pendente" || isFinancialTestGuide(guide)');
    expect(source).toContain("controlFinancialSummary.compensatedAmount");
  });
});
