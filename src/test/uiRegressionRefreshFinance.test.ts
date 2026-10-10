import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("regressões visuais e financeiras do SIGAPRO", () => {
  const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
  const processDetail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
  const protocolDesk = readFileSync(resolve(process.cwd(), "src/pages/saas/ProtocolDeskPage.tsx"), "utf8");
  const financeProtocols = readFileSync(resolve(process.cwd(), "src/pages/saas/FinanceProtocolsPage.tsx"), "utf8");

  it("remove o atalho Ctrl K visível da busca", () => {
    expect(portal).not.toContain("Ctrl K");
  });

  it("mostra a estrutura configurada do departamento atual no banner", () => {
    expect(portal).toContain("departmentOwnershipKey");
    expect(portal).toContain("activeDepartmentOwnership");
    expect(portal).toContain("Estrutura do departamento");
    expect(portal).toContain("Secretaria de Finanças");
    expect(portal).toContain("Diretoria Financeira");
    expect(portal).toContain("Secretaria de Administração");
    expect(portal).toContain("Diretoria de Protocolo");
    expect(portal).not.toContain(">Diretoria responsável<");
  });

  it("controla o contraste da busca pela superfície real do card", () => {
    expect(portal).toContain('data-theme-family={inverseMainTheme ? "dark" : "light"}');
    expect(css).toContain("Premium search: one source of truth");
    expect(css).not.toContain("Search contrast is intentionally inverted by theme family");
    expect(css).not.toContain("Topbar search contrast hardening");
    expect(css).not.toContain("Search foreground follows the actual search-card surface");
    expect(css).toContain("background: linear-gradient(180deg, #111827 0%, #0b1220 48%, #020617 100%)");
    expect(css).toContain("background: linear-gradient(180deg, #ffffff 0%, #f8fafc 48%, #eef2f7 100%)");
    expect(css).toContain('data-search-surface="dark"');
    expect(css).toContain('data-search-surface="light"');
    expect(css).toContain("color: #ffffff !important");
    expect(css).toContain("stroke: #ffffff !important");
    expect(css).toContain("color: #0f172a !important");
    expect(css).toContain('background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%) !important');
    expect(css).toContain("visibility: visible !important");
    expect(portal).toContain('data-search-surface={inverseMainTheme ? "light" : "dark"}');
    expect(css).toContain('data-search-surface="dark"');
    expect(css).toContain('data-search-surface="light"');
  });

  it("restaura hierarquia visual premium sem perder contraste", () => {
    expect(portal).toContain("topbarFill = darken(primaryColor, -5)");
    expect(portal).toContain("topbarHighlight = darken(primaryColor, -11)");
    expect(css).toContain('background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%) !important');
    expect(css).toContain('color: var(--sig-primary-deep) !important');
    expect(portal).toContain("normalizeInstitutionText");
    expect(portal).toContain("Identidade institucional ativa");
  });

  it("não quebra palavras institucionais dentro dos cards em zoom reduzido", () => {
    expect(css).toContain("Professional typography at browser/app zoom");
    expect(css).toContain("word-break: normal !important");
    expect(css).toContain("hyphens: none !important");
    expect(css).toContain("Commercial visual recovery");
    expect(css).toContain("font-size: 0.69rem !important");
  });

  it("preserva a geometria exata do viewport no snapshot do F5", () => {
    expect(main).toContain("viewportWidth: document.documentElement.clientWidth || window.innerWidth");
    expect(main).toContain("viewportHeight: window.innerHeight");
    expect(main).toContain("cssText: collectLoadedCssText()");
    expect(main).toContain("function restoreFrozenSnapshot()");
    expect(main).toContain("restoreFrozenSnapshot();");
    expect(main).toContain("sigapro-refresh-snapshot-css");
    expect(html).not.toContain('var key = "sigapro.visual.snapshot.v1"');
    expect(html).toContain("--sig-snapshot-viewport-width");
    expect(html).toContain("--sig-snapshot-viewport-height");
    expect(html).toContain("transform: none");
    expect(html).not.toContain("contain: layout paint style");
  });

  it("permite que a unidade de Protocolo confirme recebimento da guia inicial", () => {
    expect(processDetail).toContain('protocolUnitIdentity.includes("protocolo")');
    expect(processDetail).toContain('markGuideAsPaid(process.id, session.name, "protocolo")');
    expect(processDetail).toContain("Confirmar pagamento recebido");
    expect(processDetail).toContain('process.status === "pagamento_pendente"');
    expect(protocolDesk).toContain("handleConfirmProtocolPayment");
    expect(protocolDesk).toContain('markGuideAsPaid(process.id, session.name, "protocolo")');
    expect(protocolDesk).toContain("Confirmar pagamento recebido");
  });

  it("não deixa referência quebrada na rota de protocolos financeiros", () => {
    expect(financeProtocols).not.toContain("FinanceSectionNav");
    expect(financeProtocols).toContain("Voltar ao Financeiro");
  });
});
