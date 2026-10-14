import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatOfficialProcessLabel, formatOfficialProcessNumber, formatOfficialProcessTitle, getChecklistTemplate } from "@/lib/platform";

const presentationPages = [
  "src/pages/saas/ProtocolDeskPage.tsx",
  "src/pages/saas/AnalystDeskPage.tsx",
  "src/pages/saas/ExternalProcessControlPage.tsx",
  "src/pages/saas/DashboardHomePage.tsx",
  "src/pages/saas/ProcessDetailPage.tsx",
  "src/pages/saas/FinanceProtocolsPage.tsx",
  "src/pages/saas/GlobalSearchPage.tsx",
  "src/pages/saas/MovementHistoryPage.tsx",
  "src/pages/saas/NotificationsPage.tsx",
  "src/pages/saas/ExternalHistoryPage.tsx",
  "src/pages/saas/ExternalPaymentsPage.tsx",
  "src/pages/saas/OwnerPortalPage.tsx",
  "src/pages/saas/FinanceDeskPage.tsx",
  "src/pages/saas/IptuDeskPage.tsx",
];

describe("premium process presentation", () => {
  it("converts legacy audit identifiers into neutral official numbering", () => {
    expect(formatOfficialProcessNumber("AUDIT-CLP-20261009-001"))
      .toBe("Processo nº 000001/2026");
    expect(formatOfficialProcessNumber("AUDIT-CLP-2026-12"))
      .toBe("Processo nº 000012/2026");
    expect(formatOfficialProcessLabel({ protocol: "AUDIT-CLP-20261009-001", type: "licenciamento" }))
      .toBe("Processo de Licenciamento Urbanístico nº 000001/2026");
  });

  it("provides a required-document checklist for licensing records", () => {
    const checklist = getChecklistTemplate("licenciamento");
    expect(checklist).toBeTruthy();
    expect(checklist?.items.filter((item) => item.required).length).toBeGreaterThan(0);
  });

  it("converts technical audit titles into professional service names", () => {
    expect(formatOfficialProcessTitle({ title: "AUDIT fluxo CLP", type: "licenciamento" }))
      .toBe("Licenciamento Urbanístico");
    expect(formatOfficialProcessTitle({ title: "AUDIT teste", type: "regularizacao" }))
      .toBe("Regularização Urbanística");
  });

  it("uses the centralized presentation helpers across operational screens", () => {
    for (const page of presentationPages) {
      const source = readFileSync(resolve(process.cwd(), page), "utf8");
      expect(source, page).toContain("formatOfficialProcessNumber");
    }
  });
});

describe("process guide placement and organogram regression", () => {
  it("keeps guide actions inside the guide card instead of the page hero", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const heroStart = detail.indexOf("<PageHero");
    const heroEnd = detail.indexOf("/>", heroStart);
    const hero = detail.slice(heroStart, heroEnd + 2);

    expect(hero).not.toContain('printGuide("protocolo"');
    expect(detail).toContain('onClick={() => printGuide(constructionGuide ? "iss_obra" : "protocolo", false)}');
    expect(detail).toContain('onClick={() => printGuide(constructionGuide ? "iss_obra" : "protocolo", true)}');
  });

  it("loads the municipal organogram for external process viewers and hides stale premature Finance handoff", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

    expect(detail).not.toContain("!effectiveScopeId || !isInternalRole(session.role)");
    expect(detail).toContain("const displayOrganizationPath = currentOrganizationPath");
    expect(detail).toContain("isPrematureIssFinanceHandoff");
    expect(detail).toContain('holdsIssuedIssInsideUrbanism ? "Análise Urbanística em andamento"');
  });
});



describe("process navigation continuity", () => {
  it("opens the process only once and keeps Voltar beside Sair do processo", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

    expect(detail).not.toContain("const canonicalKey = toProcessRouteKey(process.protocol)");
    expect(detail).not.toContain('navigate(`/processos/${encodeURIComponent(canonicalKey)}');
    expect(detail).toContain("platformDataLoading || !dataReadyForCurrentUser");

    const actionsStart = detail.indexOf('subjectLabel="processo"');
    const actionsBlock = detail.slice(actionsStart, actionsStart + 2200);
    const markerIndex = actionsBlock.indexOf('subjectLabel="processo"');
    const backIndex = actionsBlock.indexOf("Voltar");
    const exitIndex = actionsBlock.indexOf("Sair do processo");

    expect(markerIndex).toBeGreaterThanOrEqual(0);
    expect(backIndex).toBeGreaterThan(markerIndex);
    expect(exitIndex).toBeGreaterThan(backIndex);
  });
});


describe("premium document center and direct PDF analysis", () => {
  it("shows a premium document command center with progress and direct analysis actions", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

    expect(detail).toContain("Central documental do processo");
    expect(detail).toContain("documentDeliveryProgress");
    expect(detail).toContain("documentReviewProgress");
    expect(detail).toContain("Abrir documento");
    expect(detail).toContain("Abrir documento");
    expect(detail).toContain("Use “Analisar / marcar PDF” para marca-texto");
  });
});


describe("theme-safe premium process and document cards", () => {
  it("keeps document header and process cards readable in both themes", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const protocol = readFileSync(resolve(process.cwd(), "src/pages/saas/ProtocolDeskPage.tsx"), "utf8");
    const analysis = readFileSync(resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
    const external = readFileSync(resolve(process.cwd(), "src/pages/saas/ExternalProcessControlPage.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(detail).toContain("!text-white");
    expect(detail).toContain('data-premium-inverse-surface="true"');
    expect(detail).toContain('data-surface-tone="dark"');
    expect(detail).toContain('data-process-document-card="true"');
    expect(detail).toContain("dark:bg-slate-900");
    expect(detail).toContain("Abrir documento");
    expect(protocol).toContain("dark:bg-slate-900");
    expect(analysis).toContain("dark:bg-slate-900");
    expect(external).toContain("dark:bg-slate-900");
    expect(css).toContain("SIGAPRO PROCESS PREMIUM VISUAL CONTRACT 2026-10-14");
    expect(css).toContain(".sig-process-detail-premium .sig-process-card");
    expect(css).toContain(".sig-premium-command-surface");
    expect(css).toContain(".sig-primary-process-action");
  });
});


describe("external process primary action hierarchy", () => {
  it("places the main process action below secondary actions with explicit contrast", () => {
    const external = readFileSync(resolve(process.cwd(), "src/pages/saas/ExternalProcessControlPage.tsx"), "utf8");
    const flowIndex = external.indexOf("Acompanhar fluxo");
    const openIndex = external.indexOf("Abrir processo");

    expect(flowIndex).toBeGreaterThanOrEqual(0);
    expect(openIndex).toBeGreaterThan(flowIndex);
    expect(external).toContain("h-16 w-full");
    expect(external).toContain("sig-primary-process-action");
    expect(external).toContain("!text-white");
  });
});


describe("topbar and process-card contrast isolation", () => {
  it("keeps municipal topbar colors untouched while process styling stays scoped", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

    expect(portal).toContain("const topbarFill = darken(primaryColor, -5)");
    expect(portal).toContain("const topbarHighlight = darken(primaryColor, -11)");
    expect(portal).toContain("const topbarDepth = darken(primaryColor, 2)");
    expect(css).toContain("SIGAPRO PROCESS PREMIUM VISUAL CONTRACT 2026-10-14");
    expect(css).toContain(".sig-process-detail-premium");
    expect(css).not.toContain("SIGAPRO TOPBAR RESTORE + CARD CONTRAST HARD GUARD");
    expect(detail).toContain("sig-process-detail-premium");
    expect(detail).toContain('data-process-document-card="true"');
    expect(detail).toContain("sig-primary-document-action");
  });

  it("uses vivid tone accents instead of washed-out process cards", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const stat = readFileSync(resolve(process.cwd(), "src/components/platform/StatCard.tsx"), "utf8");

    expect(css).toContain("#0284c7");
    expect(css).toContain("#059669");
    expect(css).toContain("#d97706");
    expect(css).toContain("#7c3aed");
    expect(detail).toContain("sig-summary-blue");
    expect(detail).toContain("sig-summary-emerald");
    expect(detail).toContain("sig-summary-violet");
    expect(detail).toContain("sig-summary-amber");
    expect(stat).toContain("data-tone={tone}");
  });
});


describe("strict process surface contrast root", () => {
  it("forces dark cards to use light copy and light cards to use dark copy without touching topbar", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

    const contrastRoot = css.slice(css.indexOf("PROCESS SURFACE CONTRAST ROOT V3"));
    expect(contrastRoot).toContain("#sig-process-document-command-center");
    expect(contrastRoot).toContain(".sig-command-metric-blue");
    expect(contrastRoot).toContain(".sig-command-metric-emerald");
    expect(contrastRoot).toContain(".sig-command-metric-amber");
    expect(contrastRoot).toContain('[data-layout-mode="default"] .sig-main-shell .sig-process-detail-premium .sig-process-card');
    expect(contrastRoot).toContain('[data-layout-mode="inverse-main"] .sig-main-shell .sig-process-detail-premium .sig-process-card');
    expect(contrastRoot).toContain('[data-municipal-organogram="true"]');
    expect(contrastRoot).not.toContain(".sig-premium-topbar");
    expect(contrastRoot).not.toContain(".sig-topbar-shell");

    expect(detail).toContain('id="sig-process-document-command-center"');
    expect((detail.match(/sig-command-metric/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});


describe("process tab visibility", () => {
  it("keeps the active process tab unmistakable in light and dark themes", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(detail).toContain('data-process-tabbar="true"');
    expect(detail).toContain("aria-pressed={isActive}");
    expect(detail).toContain("bg-[linear-gradient(135deg,#0b4f7a_0%,#0b6fa8_100%)]");
    expect(detail).toContain("!text-white");
    expect(css).toContain('[data-process-tabbar="true"] button[aria-pressed="true"]');
  });
});


describe("authoritative process surface polarity file", () => {
  it("loads the final polarity contract after index.css and scopes it to process detail", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
    const polarity = readFileSync(resolve(process.cwd(), "src/styles/surface-polarity.css"), "utf8");

    expect(main.indexOf('import "./styles/surface-polarity.css"')).toBeGreaterThan(
      main.indexOf('import "./index.css"'),
    );
    expect(polarity).toContain("PROCESS DETAIL AUTHORITATIVE POLARITY V6");
    expect(polarity).toContain(".sig-process-detail-premium");
    expect(polarity).toContain('[data-layout-mode="default"]');
    expect(polarity).toContain('[data-layout-mode="inverse-main"]');
    expect(polarity).toContain('color:#ffffff !important');
    expect(polarity).toContain('color: #0f172a !important');
  });
});


describe("canonical process surface contract", () => {
  it("keeps one scoped source of truth for light and dark process cards", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(css).toContain("SIGAPRO PROCESS SURFACE CONTRACT — CANONICAL");
    expect(css).not.toContain("PROCESS SURFACE CONTRAST ROOT V3");
    expect(css).not.toContain("THEME + PROCESS CONTRAST FINAL CONTRACT");
    expect(css).not.toContain("FINAL SURFACE POLARITY LOCK");
    expect(css).toContain('[data-layout-mode="default"] .sig-main-shell .sig-process-detail-premium .sig-process-card');
    expect(css).toContain('[data-layout-mode="inverse-main"] .sig-main-shell .sig-process-detail-premium .sig-process-card');
    expect(css).toContain("#sig-process-document-command-center");
    expect(css).toContain("color: #ffffff !important");
  });

  it("covers process cards in every operational list", () => {
    const protocol = readFileSync(resolve(process.cwd(), "src/pages/saas/ProtocolDeskPage.tsx"), "utf8");
    const analyst = readFileSync(resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
    const external = readFileSync(resolve(process.cwd(), "src/pages/saas/ExternalProcessControlPage.tsx"), "utf8");
    const finance = readFileSync(resolve(process.cwd(), "src/pages/saas/FinanceDeskPage.tsx"), "utf8");
    const financeProtocols = readFileSync(resolve(process.cwd(), "src/pages/saas/FinanceProtocolsPage.tsx"), "utf8");

    expect(protocol).toContain('data-process-premium-card="true"');
    expect(analyst).toContain('data-process-premium-card="true"');
    expect(external).toContain('data-process-premium-card="true"');
    expect(finance).toContain('data-process-premium-card="true"');
    expect(financeProtocols).toContain('data-process-premium-card="true"');
  });
});
