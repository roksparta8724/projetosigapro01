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
    expect(financeDesk).toContain('data-finance-guide-list="premium-v4"');
    expect(financeDesk).toContain('data-finance-guide-row="true"');
    expect(financeDesk).toContain('sig-finance-ledger__reference');
    expect(financeDesk).toContain('sig-finance-ledger__value');
    expect(financeDesk).toContain('sig-finance-ledger__status');
    expect(financeDesk).toContain('data-finance-register="process-style"');
    expect(financeDesk).toContain("guideFinancialEvidenceLabel(guide)");
    expect(financeDesk).toContain("getPaymentGuideDisplayReference");
    expect(financeDesk).toContain('data-official-sequence={sequence ? "true" : "false"}');
    expect(financeDesk).toContain('buildProcessPath(process, "financeiro")');
    expect(financeDesk).toContain('keepsOriginalPreprotocolCode');
    expect(financeCss).toContain("container: finance-guides / inline-size");
    expect(financeCss).toContain("@container finance-guide-table (max-width: 650px)");
    expect(financeCss).toContain("html.dark body #root .sig-main-shell .sig-finance-ledger__row");
    expect(financeDesk).not.toContain('data-finance-guide-header="wide"');
  });

  it("inclui busca e paginação sem filtrar município nem modificar situação financeira", () => {
    expect(financeDesk).toContain('aria-label="Buscar guia ou processo"');
    expect(financeDesk).toContain("filteredIssuedGuideRows");
    expect(financeDesk).toContain("paginatedIssuedProcessGroups");
    expect(financeDesk).toContain("currentGuidePage * guidePageSize");
    expect(financeDesk).toContain("setGuidePage(1)");
    expect(financeDesk).toContain('aria-label="Processos por página"');
    expect(financeDesk).toContain('onClick={() => setGuidePage(Math.max(1, currentGuidePage - 1))}');
    expect(financeDesk).toContain('onClick={() => setGuidePage(Math.min(guidePageCount, currentGuidePage + 1))}');
    expect(financeDesk).toContain("getVisibleProcessesByScope");
    expect(financeDesk).toContain("financeLedgerProcesses");
    expect(financeDesk).toContain("markGuideAsPaid");
  });


  it("espelha o registro compacto dos processos com filtros, 25–100 registros e contraste ativo", () => {
    expect(financeDesk).toContain('role="table" aria-label="Ordem oficial das guias financeiras"');
    expect(financeDesk).toContain('role="columnheader"');
    expect(financeDesk).toContain('role="row"');
    expect(financeDesk).toContain('value: "pendentes"');
    expect(financeDesk).toContain('value: "pre"');
    expect(financeDesk).toContain('<option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>');
    expect(financeDesk).toContain('data-selected={selected ? "true" : "false"}');
    expect(financeCss).toContain('.sig-finance-ledger__filter[data-active="true"]');
    expect(financeCss).toContain('.sig-finance-ledger__row[data-selected="true"]');
    expect(financeCss).toContain('html.dark body #root .sig-main-shell .sig-finance-ledger__filter[data-active="true"]');
    expect(financeCss).toContain('grid-template-columns:30px minmax(0,1fr) 105px 31px');
  });

  it("encaminha somente processos oficiais à conclusão da unidade com confirmação na mesa central", () => {
    expect(financeDesk).toContain('const canRequestUnitCompletion');
    expect(financeDesk).toContain('session.role !== "prefeitura_admin"');
    expect(financeDesk).toContain('resolveSessionOperationalArea(session) === "financeiro"');
    expect(financeDesk).toContain('process.isOfficial !== false && Boolean(getOfficialProcessSequence(process))');
    expect(financeDesk).toContain('const processIds = selectedGuideProcessIds.filter(id => eligible.has(id)).slice(0, 25)');
    expect(financeDesk).toContain('sigaproProcessBatchRequest: { action: "concluir", processIds }');
    expect(financeDesk).toContain('to="/prefeitura/processos"');
    expect(financeDesk).toContain('Concluir nesta unidade');
    expect(financeDesk).toContain('Concluir na unidade não altera guias nem o status oficial.');
    expect(financeDesk).not.toContain('setMyUnitProcessCompletion(');
  });


  it("mantém tinta branca nos cards Financeiro ativos e escura nos inativos, inclusive em hover", () => {
    const v5 = financeCss.split("/* SIGAPRO FINANCE CONTRAST CONTRACT v5 */")[1];
    expect(v5).toBeTruthy();
    expect(v5).toContain('.sig-nav-item[data-nav-active="true"]:hover');
    expect(v5).toContain('.sig-nav-item[data-nav-active="true"] .sig-nav-item-label');
    expect(v5).toContain('.sig-nav-item[data-nav-active="true"] .sig-nav-item-helper');
    expect(v5).toContain("background: linear-gradient(135deg,#104f75 0%,#0c567c 100%) !important");
    expect(v5).toContain("-webkit-text-fill-color: #ffffff !important");
    expect(v5).toContain('.sig-nav-item[data-nav-active="false"] .sig-nav-item-label');
    expect(v5).toContain('.sig-nav-item[data-nav-active="false"] .sig-nav-item-helper');
    expect(v5).toContain("background: #f7fbff !important");
  });

  it("impede cards/linhas selecionados com fundo escuro e letras escuras, nos dois temas", () => {
    const v5 = financeCss.split("/* SIGAPRO FINANCE CONTRAST CONTRACT v5 */")[1];
    expect(v5).toContain('.sig-finance-ledger__row[data-selected="true"]:hover');
    expect(v5).toContain("background: #d9ebf6 !important");
    expect(v5).toContain('[data-layout-mode="inverse-main"]');
    expect(v5).toContain("background: #204d66 !important");
    expect(v5).toContain("-webkit-text-fill-color: #f5fbff !important");
    expect(v5).toContain('.sig-finance-ledger__status[data-finance-evidence="pending"]');
    expect(v5).toContain('.sig-finance-ledger__status[data-finance-evidence="reported"]');
    expect(v5).toContain('.sig-finance-ledger__status[data-finance-evidence="simulation"]');
    expect(v5).toContain('.sig-finance-ledger__filter[data-active="true"] > span');
    expect(v5).toContain('.sig-finance-ledger__unit-action:not(:disabled)');
  });


  it("preserva o contraste dos controles internos da tabela quando o tema inverso está ativo", () => {
    const inverse = financeCss.split("/* SIGAPRO FINANCE CONTRAST CONTRACT v5 — inverse nested surfaces */")[1];
    expect(inverse).toBeTruthy();
    for (const control of [
      ".sig-finance-ledger__counter", ".sig-finance-ledger__header-icon",
      '.sig-finance-ledger__sequence[data-official-sequence="false"]',
      ".sig-finance-ledger__open", ".sig-finance-ledger__empty",
      ".sig-finance-ledger__feedback", ".sig-finance-ledger__page-controls button",
    ]) expect(inverse).toContain(control);
    expect(inverse).toContain('[data-layout-mode="inverse-main"]');
    expect(inverse).toContain("html.dark");
    expect(inverse).toContain("-webkit-text-fill-color: #edf8ff !important");
    expect(inverse).toContain("-webkit-text-fill-color: #805512 !important");
  });

  it("mantém pares de cores de texto e fundo acima de 4,5:1 no Financeiro", () => {
    const luminance = (hex: string) => {
      const normalized = hex.replace("#", "");
      const [r,g,b] = [0,2,4].map(offset => parseInt(normalized.slice(offset, offset+2),16) / 255)
        .map(value => value <= 0.04045 ? value/12.92 : ((value+0.055)/1.055)**2.4);
      return 0.2126*r+0.7152*g+0.0722*b;
    };
    const contrast = (foreground: string, background: string) => {
      const top = Math.max(luminance(foreground), luminance(background));
      const bottom = Math.min(luminance(foreground), luminance(background));
      return (top + 0.05)/(bottom + 0.05);
    };
    for (const [ink, surface] of [
      ["#ffffff","#104f75"], ["#eaf6ff","#104f75"],
      ["#15364d","#f7fbff"], ["#435e73","#ffffff"],
      ["#ffffff","#0c567c"], ["#ffffff","#1d6384"],
      ["#edf8ff","#0f2d43"], ["#bfd9e8","#0f2d43"],
      ["#f5fbff","#204d66"], ["#805512","#fff3da"],
      ["#1c6742","#e7f5ec"], ["#7b5417","#fff5df"],
      ["#225978","#eaf3fa"], ["#d1ffe6","#174431"],
      ["#d6efff","#173f57"], ["#fff0c8","#57421c"],
    ]) {
      expect(contrast(ink,surface), `${ink} / ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(financeCss).toContain(ink);
      expect(financeCss).toContain(surface);
    }
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
