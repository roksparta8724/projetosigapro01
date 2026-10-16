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
});
