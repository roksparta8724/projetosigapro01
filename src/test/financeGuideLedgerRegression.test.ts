import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("finance municipal guide ledger", () => {
  const finance = readFileSync(
    resolve(process.cwd(), "src/pages/saas/FinanceDeskPage.tsx"),
    "utf8",
  );

  it("keeps issued guides visible after a process leaves the Financeiro queue", () => {
    expect(finance).toContain("financeLedgerProcesses");
    expect(finance).toContain("(process.municipalityId ?? process.tenantId) === effectiveScopeId");
    expect(finance).toContain("const controlGuides = financeLedgerProcesses.flatMap");
    expect(finance).toContain("const processes = getVisibleProcessesByScope");
  });

  it("preserves white text on the dark finance header action", () => {
    expect(finance).toContain("sig-force-dark-action");
    expect(finance).toContain("!text-white");
    expect(finance).toContain("[&_*]:!text-white");
    expect(finance).toContain("Controle por processo");
  });

  it("keeps the Habite-se finance action readable on the dark premium surface", () => {
    expect(finance).toContain('data-finance-habite-se-action="true"');
    expect(finance).toContain("sig-force-dark-action");
    expect(finance).toContain("bg-cyan-800");
    expect(finance).toContain("!text-white");
    expect(finance).toContain("[&_*]:!text-white");
    expect(finance).toContain("Abrir e emitir Guia de Habite-se");
  });

  it("orders the financial book by the official process sequence instead of guide creation time", () => {
    expect(finance).toContain("getOfficialProcessSequence");
    expect(finance).toContain("getPaymentGuideDisplayReference");
    expect(finance).toContain("bSequence.number - aSequence.number");
    expect(finance).toContain("Pré-protocolos ainda não pagos aparecem como PRE");
    expect(finance).toContain("Guia paga no pré-protocolo:");
    expect(finance).not.toContain("String(index + 1).padStart(2, \"0\")");
  });

  it("keeps the issued-guide section as a municipal historical ledger", () => {
    expect(finance).toContain('title="Guias emitidas"');
    expect(finance).toContain("Todas as guias vinculadas aos processos municipais");
    expect(finance).toContain("issuedGuideRows");
  });
});
