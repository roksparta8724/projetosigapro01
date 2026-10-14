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
    expect(css).toContain("SIGAPRO SEMANTIC SURFACE CONTRACT 2026-10-14");
    expect(css).toContain('[data-surface-tone="dark"]');
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


describe("topbar and card contrast isolation", () => {
  it("restores topbar branding while isolating card contrast to process surfaces", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(css).toContain("SIGAPRO TOPBAR RESTORE + CARD CONTRAST HARD GUARD");
    expect(css).toContain("var(--sig-topbar-highlight)");
    expect(css).toContain("var(--sig-topbar-depth)");
    expect(css).toContain(".sig-main-shell .sig-premium-command-surface *");
    expect(css).toContain('[data-process-document-card="true"]');
    expect(css).toContain(".sig-primary-document-action");
  });
});
