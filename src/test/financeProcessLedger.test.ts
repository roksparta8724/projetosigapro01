import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("finance process accounting ledger", () => {
  const protocols = readFileSync(
    resolve(process.cwd(), "src/pages/saas/FinanceProtocolsPage.tsx"),
    "utf8",
  );
  const desk = readFileSync(
    resolve(process.cwd(), "src/pages/saas/FinanceDeskPage.tsx"),
    "utf8",
  );
  const detail = readFileSync(
    resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"),
    "utf8",
  );

  it("keeps every active municipal protocol visible even before a finance guide exists", () => {
    expect(protocols).toContain("scopedProcesses");
    expect(protocols).toContain("isOpenMunicipalProcess");
    expect(protocols).toContain("Protocolos em aberto");
    expect(protocols).toContain("Nenhum lançamento financeiro emitido");
    expect(protocols).not.toContain(
      'return getProcessPaymentGuides(process, tenantSettings).some(\n      (guide) => guide.kind !== "protocolo"',
    );
  });

  it("maintains an individual accounting ledger for every process", () => {
    expect(protocols).toContain("Contabilidade do processo");
    expect(protocols).toContain("totalIssued");
    expect(protocols).toContain("totalPaid");
    expect(protocols).toContain("totalPending");
    expect(protocols).toContain("Lançamentos vinculados ao protocolo");
  });

  it("shows protocol fees for control without moving their operational responsibility to Finance", () => {
    expect(protocols).toContain('if (guideKind === "protocolo")');
    expect(protocols).toContain("Baixa operacional: Protocolo");
    expect(protocols).toContain("Taxa de protocolo");
    expect(protocols).toContain("!isProtocolGuide");
  });

  it("keeps finance protocol cards compact and expands only the selected process", () => {
    expect(protocols).toContain("expandedProcessId");
    expect(protocols).toContain('data-expanded={isExpanded ? "true" : "false"}');
    expect(protocols).toContain("Ver detalhes");
    expect(protocols).toContain("Recolher");
    expect(protocols).toContain('finance-process-details-');
    expect(protocols).toContain("current === process.id ? null : process.id");
  });

  it("forces active finance filters to use white text and icons on the dark background", () => {
    expect(protocols).toContain("!text-white");
    expect(protocols).toContain("[&_svg]:!text-white");
    expect(protocols).toContain("[&_*]:!text-white");
  });

  it("gives the finance overview portfolio-level values, not only ISSQN guide counts", () => {
    expect(desk).toContain("controlGuides");
    expect(desk).toContain("openProcessCount");
    expect(desk).toContain("controlIssuedValue");
    expect(desk).toContain("controlPendingValue");
    expect(desk).toContain("controlSettledValue");
    expect(desk).toContain("Protocolos em aberto");
  });

  it("keeps the clicked ledger row bound to the exact guide instead of falling back to another guide in the same process", () => {
    expect(desk).toContain('&guia=${encodeURIComponent(guide.code)}#guia-selecionada');
    expect(desk).toMatch(
      /key=\{\`\$\{process\.id\}-\$\{guide\.kind\}-\$\{guide\.code\}\`\}[\s\S]{0,380}to=\{\`\$\{buildProcessPath\(process, "financeiro"\)\}&guia=\$\{encodeURIComponent\(guide\.code\)\}#guia-selecionada\`\}/,
    );
    expect(detail).toContain('new URLSearchParams(location.search).get("guia")');
    expect(detail).toContain("paymentGuides.find((guide) => guide.code === requestedGuideCode)");
    expect(detail).toContain("const displayGuide = requestedPaymentGuide ?? approvalGuide ?? constructionGuide ?? protocolGuide;");
    expect(detail).toContain("printGuide(displayGuide.kind, false, displayGuide.code)");
    expect(detail).toContain("printGuide(displayGuide.kind, true, displayGuide.code)");
    expect(detail).toContain('id="guia-selecionada"');
    expect(detail).toContain('data-selected-guide-summary="true"');
    expect(detail).toContain('data-guide-selected="true"');
    expect(detail).toContain('data-guide-code={requestedPaymentGuide.code}');
    expect(detail).toContain("prewarmGuideSignature");
    expect(detail).toContain("[activeTab, requestedGuideCode, processId, prewarmGuideSignature]");
    expect(detail).toContain("printGuide(requestedPaymentGuide.kind, false, requestedPaymentGuide.code)");
    expect(detail).toContain("visiblePaymentGuides.find((guide) => guide.code === guideCode)");
  });

  it("shows every emitted guide in official process order while preserving protocol responsibility", () => {
    expect(desk).toContain("issuedGuideRows");
    expect(desk).toContain("[...controlGuides].sort");
    expect(desk).toContain("getOfficialProcessSequence");
    expect(desk).toContain("getPaymentGuideDisplayReference");
    expect(desk).toContain("bSequence.number - aSequence.number");
    expect(desk).toContain("bIssued - aIssued");
    expect(desk).toContain("lg:grid-cols-[54px_minmax(220px,1.2fr)_minmax(170px,1fr)_110px_110px_minmax(170px,1fr)_100px_34px]");
    expect(desk).toContain("Ordem oficial dos processos");
    expect(desk).toContain("Pré-protocolos ainda não pagos aparecem como PRE");
    expect(desk).toContain("Guia paga no pré-protocolo:");
    expect(desk).toContain("Baixa operacional: Protocolo");
    expect(desk).toContain("Controle: Financeiro");
    expect(desk).toContain('title="Guias emitidas"');
    expect(desk).not.toContain("guidesByIssueDate");
    expect(desk).not.toContain('String(index + 1).padStart(2, "0")');
  });
});
