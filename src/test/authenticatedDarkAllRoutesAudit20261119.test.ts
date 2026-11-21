import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const root = read("src/components/platform/PortalFrame.tsx");
const css = read("src/styles/sigapro-authenticated-dark-surface-audit.css");
const inverse = read("src/styles/sigapro-inverse-workspace-premium.css");
const main = read("src/main.tsx");
const finance = read("src/pages/saas/FinanceProtocolsPage.tsx");
const registry = read("src/components/platform/CompactProcessRegistry.tsx");
const tabs = read("src/components/platform/InternalTabs.tsx");
const analyst = read("src/pages/saas/AnalystDeskPage.tsx");

const relativeLuminance = (color: string) => {
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const ratio = (ink: string, surface: string) => {
  const a = relativeLuminance(ink), b = relativeLuminance(surface);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

describe("SIGAPRO — vistoria do tema em todas as páginas", () => {
  it("verifica o inventário completo de telas e subpáginas em vez de uma captura", () => {
    const pages = readdirSync("src/pages/saas")
      .filter((name) => name.endsWith("Page.tsx"));
    expect(pages.length).toBeGreaterThanOrEqual(38);
    for (const name of pages) {
      expect(read("src/pages/saas/" + name).length, name).toBeGreaterThan(50);
    }
    for (const name of [
      "ProtocolDeskPage", "AnalystDeskPage", "FinanceDeskPage",
      "FinanceProtocolsPage", "TenantAdminPage", "MasterAdminPage",
      "MunicipalOrganizationPage", "MunicipalProcessRegistryPage",
      "DocumentAnalysisPage", "DocumentViewerPage", "ProtocolarProjetoPage",
      "ProcessDetailPage", "ConfiguracoesPage", "PerfilPage",
      "LegislationPage", "ZoningPage", "NotificationsPage",
      "IptuDeskPage", "ExternalPortalPage", "ExternalProcessControlPage",
      "ExternalDraftsPage", "ExternalPaymentsPage", "OwnerPortalPage",
      "DashboardHomePage", "MasterPlansPage", "MovementHistoryPage",
    ]) {
      expect(pages, name).toContain(name + ".tsx");
    }
  });

  it("ativa os dark: utilities na raiz autenticada, sem afetar html/body públicos", () => {
    expect(root).toContain('inverseMainTheme && "dark"');
    expect(root).toContain('data-layout-mode={inverseMainTheme ? "inverse-main" : "default"}');
    expect(root).toContain('data-theme-family={inverseMainTheme ? "dark" : "light"}');
    expect(root).toContain('"sig-app-frame min-h-screen text-foreground"');
    expect(root).not.toContain('document.documentElement.classList.add("dark")');
    expect(root).not.toContain('document.body.classList.add("dark")');
    expect(main.indexOf("sigapro-authenticated-dark-surface-audit.css"))
      .toBeGreaterThan(main.indexOf("sigapro-inverse-workspace-premium.css"));
    expect(css).toContain('[data-layout-mode="inverse-main"] .sig-main-shell');
  });

  it("corrige fundos e tipografia dos cards reutilizados por todos os módulos", () => {
    expect(css).toContain('.sig-section-icon');
    expect(css).toContain('.sig-section-title,.sig-subtitle');
    expect(css).toContain('.sig-ui-card,.sig-section-card');
    expect(css).toContain('background: linear-gradient(180deg, #162f46, #10263a)');
    expect(css).toContain('background: #182f46 !important');
    expect(css).toContain('[class~="bg-white"]');
    expect(css).toContain('[class*="bg-[linear-gradient("][class*="#ffffff"]');
    expect(css).toContain('[class~="bg-slate-50"]');
    expect(css).toContain('-webkit-text-fill-color: #d5e7f5 !important');
  });

  it("remove a faixa branca de pesquisa do Financeiro, sem alterar os filtros", () => {
    expect(finance).toContain('data-finance-protocol-filter-bar="true"');
    expect(finance).toContain('aria-pressed={view === "abertos"}');
    expect(finance).toContain('aria-pressed={view === "todos"}');
    expect(finance).toContain('onClick={() => setView("abertos")}');
    expect(finance).toContain('onClick={() => setView("todos")}');
    expect(css).toContain('[data-finance-view-control="true"][aria-pressed="true"]');
    expect(css).toContain('[data-finance-view-control="true"][aria-pressed="false"]');
    expect(css).toContain('[data-finance-protocol-unverified="true"]');
  });

  it("corrige as legendas pastéis e o rodapé das tabelas em qualquer departamento", () => {
    expect(registry).toContain('data-sigapro-process-footer="reference"');
    for (const tone of ["pending","warning","blue","purple","green"]) {
      expect(registry).toContain('sig-reference-legend-chip ' + tone);
      expect(css).toContain(".sig-reference-legend-chip." + tone);
    }
    expect(css).toContain(".sig-reference-footer");
    expect(css).toContain(".sig-reference-page-button.active");
    expect(css).toContain(".sig-reference-legend-chip svg");
    expect(css).toContain("color: currentColor !important");
  });

  it("garante a aparência escura da Mesa Técnica, do Protocolo e dos painéis comuns", () => {
    expect(analyst).toContain('className="sig-analysis-tabs"');
    expect(analyst).toContain('data-analysis-command-bar="true"');
    expect(css).toContain(".sig-section-icon");
    expect(inverse).toContain('sig-protocol-section-nav');
    expect(inverse).toContain('.sig-workspace-actions');
    expect(inverse).toContain(".sig-finance-ledger__row");
    expect(tabs).toContain("<InternalSectionNav");
  });

  it("nunca altera a composição original do PDF, QR Code ou brasões", () => {
    for (const exempt of [
      '[data-contrast-surface="light"]', "[data-pdf-page]",
      "[data-print-document]", ".sig-image-frame-stage",
      ".sig-institution-logo-surface", ".sig-finance-pix-surface",
      "[data-municipal-logo-live-preview]", "[data-institutional-header-preview]",
    ]) expect(css).toContain(exempt);
    expect(css).not.toContain(".sig-premium-topbar");
    expect(css).not.toContain("window.location.reload");
    expect(css).not.toContain("pointer-events: none !important");
  });

  it("as cores do inventário escuro excedem WCAG AA (4,5:1)", () => {
    const pairs = [
      ["#f3f9ff","#162f46"], ["#d3efff","#244763"],
      ["#f7fbff","#102a40"], ["#eff7ff","#264b66"],
      ["#ffffff","#12638e"], ["#fff0cc","#46371f"],
      ["#e7f4ff","#19334a"], ["#ffe4e9","#592a38"],
      ["#ffdef8","#522a4a"], ["#fff0c9","#523d21"],
      ["#dcf0ff","#1d4564"], ["#efe5ff","#3e3761"],
      ["#e0ffed","#194b3b"], ["#d5e7f5","#182f46"],
    ] as const;
    for (const [ink, background] of pairs) {
      expect(ratio(ink, background), ink + " on " + background)
        .toBeGreaterThanOrEqual(4.5);
    }
  });
});
