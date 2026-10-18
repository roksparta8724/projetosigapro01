import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("payment responsibility boundaries", () => {
  it("keeps protocol-guide confirmation inside the Protocol department", () => {
    const protocol = read("src/pages/saas/ProtocolDeskPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(protocol).toContain('markGuideAsPaid(process.id, session.name, "protocolo")');
    expect(protocol).toContain("Confirmar pagamento recebido");
    expect(detail).not.toContain("handleConfirmProtocolPayment");
    expect(detail).not.toContain("confirm-protocol-payment");
  });

  it("lets Finance confirm only the released construction payment inside the process", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(detail).toContain("canFinanceConfirmConstructionPayment");
    expect(detail).toContain("constructionGuideSentExternally");
    expect(detail).toContain('markGuideAsPaid(process.id, session.name, "iss_obra")');
    expect(detail).toContain("Confirmar pagamento da obra");
    expect(detail).toContain("Somente o Setor Financeiro pode confirmar");
  });

  it("keeps protocol guides visible for financial audit without transferring operational responsibility", () => {
    const finance = read("src/pages/saas/FinanceProtocolsPage.tsx");

    expect(finance).toContain('if (kind === "protocolo") return "Baixa operacional: Protocolo"');
    expect(finance).toContain('const isProtocolGuide = guide.kind === "protocolo"');
    expect(finance).toContain("!isProtocolGuide");
    expect(finance).toContain("O Financeiro enxerga todos os protocolos ativos do município.");
  });
});
