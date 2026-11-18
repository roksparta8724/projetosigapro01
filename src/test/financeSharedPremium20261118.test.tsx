// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/platform/PageLayout";
import { PageHero } from "@/components/platform/PageHero";

const shared = readFileSync("src/components/platform/PageLayout.tsx", "utf8");
const generalCss = readFileSync("src/styles/sigapro-operational-header-premium.css", "utf8");
const financeCss = readFileSync("src/styles/sigapro-finance-premium.css", "utf8");
const financeDesk = readFileSync("src/pages/saas/FinanceDeskPage.tsx", "utf8");
const financeLedger = readFileSync("src/pages/saas/FinanceProtocolsPage.tsx", "utf8");
const master = readFileSync("src/pages/saas/MasterAdminPage.tsx", "utf8");
const analysis = readFileSync("src/pages/saas/AnalystDeskPage.tsx", "utf8");
const municipal = readFileSync("src/pages/saas/TenantAdminPage.tsx", "utf8");
const main = readFileSync("src/main.tsx", "utf8");

describe("SIGAPRO — cabeçalhos e navegação premium compartilhados", () => {
  it("renderiza título, descrição, unidade e ação como componentes visíveis da mesma faixa", () => {
    const { container } = render(
      <MemoryRouter>
        <PageHeader
          eyebrow="Operação financeira"
          title="Guias, pagamentos e conciliação"
          description="Controle das guias oficiais com evidência bancária"
          actions={<Link to="/prefeitura/financeiro/protocolos">Controle por processo</Link>}
        />
      </MemoryRouter>,
    );
    const heading = container.querySelector('[data-sigapro-operational-header="premium-v3"]');
    expect(heading).toBeInTheDocument();
    expect(heading?.querySelector('[data-sigapro-header-copy="true"]')).toHaveTextContent("Operação financeira");
    expect(screen.getByRole("heading", { name: "Guias, pagamentos e conciliação" })).toBeInTheDocument();
    expect(heading?.querySelector('[data-sigapro-header-text="true"]')).toHaveTextContent("evidência bancária");
    expect(heading?.querySelector('[data-sigapro-header-actions="true"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Controle por processo" })).toHaveAttribute(
      "href", "/prefeitura/financeiro/protocolos",
    );
  });

  it("PageHero de Master e livro financeiro reutiliza o mesmo cabeçalho legível", () => {
    const { container } = render(
      <MemoryRouter>
        <PageHero title="Controle financeiro por processo" description="Guias vinculadas aos processos" />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-sigapro-operational-header="premium-v3"]')).toHaveTextContent(
      "Controle financeiro por processo",
    );
    expect(master).toContain("<PageHero");
    expect(financeLedger).toContain("<PageHero");
    expect(analysis).toContain("<InternalTabs");
    expect(municipal).toContain("<InternalTabs");
    expect(shared).toContain('data-sigapro-operational-header="premium-v3"');
  });

  it("a faixa inferior não se torna card vazio com botão de largura total em telas de 1358px", () => {
    expect(generalCss).toContain('height: auto !important');
    expect(generalCss).toContain('min-height: 0 !important');
    expect(generalCss).toContain('[data-sigapro-header-copy="true"]');
    expect(generalCss).toContain('display: flex !important');
    expect(generalCss).toContain('visibility: visible !important');
    expect(generalCss).toContain('width: auto !important');
    expect(generalCss).toContain('flex: 0 1 auto !important');
    expect(generalCss).toContain('@media (max-width: 1050px)');
    expect(generalCss).not.toContain("display: none !important");
    expect(main).toContain('import "./styles/sigapro-operational-header-premium.css"');
  });

  it("Financeiro mantém 7 pastas operacionais com navegação sem palavras esmagadas", () => {
    expect(financeDesk).toContain('className="sig-finance-section-nav"');
    for (const section of ["guias", "pagamentos", "conciliacao", "tabelas", "workflow", "historico", "visao-geral"]) {
      expect(financeDesk).toContain(`value: "${section}"`);
    }
    expect(financeCss).toContain("flex: 0 0 174px !important");
    expect(financeCss).toContain("overflow-x: auto !important");
    expect(financeCss).toContain("word-break: normal !important");
    expect(financeCss).toContain('.sig-nav-item[data-nav-active="true"]');
    expect(financeDesk).toContain('to="/prefeitura/financeiro/protocolos"');
  });

  it("reconstrói o livro de guias com referência íntegra, evidência e valor destacados", () => {
    expect(financeDesk).toContain('data-finance-guide-list="premium-v3"');
    expect(financeDesk).toContain('data-finance-guide-row="true"');
    expect(financeDesk).toContain('sig-finance-ledger__reference');
    expect(financeDesk).toContain('sig-finance-ledger__value');
    expect(financeDesk).toContain('sig-finance-ledger__status');
    expect(financeDesk).toContain("guideFinancialEvidenceLabel(guide)");
    expect(financeDesk).toContain("getPaymentGuideDisplayReference");
    expect(financeDesk).toContain('data-official-sequence={sequence ? "true" : "false"}');
    expect(financeDesk).toContain('buildProcessPath(process, "financeiro")');
    expect(financeDesk).toContain('keepsOriginalPreprotocolCode');
    expect(financeCss).toContain("container: sigapro-guide-ledger / inline-size");
    expect(financeCss).toContain("@container sigapro-guide-ledger (max-width: 740px)");
    expect(financeCss).toContain("html.dark body #root .sig-main-shell .sig-finance-ledger__row");
    expect(financeDesk).not.toContain('data-finance-guide-header="wide"');
  });

  it("inclui busca e paginação sem filtrar município nem modificar situação financeira", () => {
    expect(financeDesk).toContain('aria-label="Buscar guia ou processo"');
    expect(financeDesk).toContain("filteredIssuedGuideRows");
    expect(financeDesk).toContain("paginatedIssuedGuideRows");
    expect(financeDesk).toContain("currentGuidePage * 12");
    expect(financeDesk).toContain("setGuidePage(1)");
    expect(financeDesk).toContain('aria-label="Paginação das guias financeiras"');
    expect(financeDesk).toContain('onClick={() => setGuidePage(Math.max(1, currentGuidePage - 1))}');
    expect(financeDesk).toContain('onClick={() => setGuidePage(Math.min(guidePageCount, currentGuidePage + 1))}');
    expect(financeDesk).toContain("getVisibleProcessesByScope");
    expect(financeDesk).toContain("financeLedgerProcesses");
    expect(financeDesk).toContain("markGuideAsPaid");
  });

  it("corrige tipografia de indicadores e amplia o padrão aos demais departamentos sem alterar fluxos", () => {
    expect(financeDesk).toContain("sig-finance-workspace");
    expect(financeLedger).toContain("sig-finance-workspace sig-finance-protocols-workspace");
    expect(financeCss).toContain("grid-template-columns: repeat(4,minmax(0,1fr)) !important");
    expect(financeCss).toContain("font-variant-numeric: tabular-nums");
    expect(financeCss).toContain('[data-finance-unverified-settlement="true"]');
    expect(generalCss).toContain(':not(.sig-protocol-section-nav):not(.sig-finance-section-nav)');
    expect(generalCss).toContain("scroll-snap-type: x proximity");
    expect(financeDesk).toContain("guideFinancialEvidenceLabel(guide)");
    expect(financeDesk).toContain("markGuideAsPaid");
    expect(financeLedger).toContain("totalBankVerified");
  });
});
