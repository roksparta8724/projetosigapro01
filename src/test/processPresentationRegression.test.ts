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
    expect(detail).toContain('onClick={() => void printGuide("protocolo", false)}');
    expect(detail).toContain('onClick={() => void printGuide("protocolo", true)}');
    expect(detail).toContain("preparedGuideCharges");
  });

  it("loads the municipal organogram for external process viewers and hides stale premature Finance handoff", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

    expect(detail).not.toContain("!effectiveScopeId || !isInternalRole(session.role)");
    expect(detail).toContain("const displayOrganizationPath =");
    expect(detail).toContain(": currentOrganizationPath;");
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
    expect(detail).toContain("Abrir documento e analisar");
    expect(detail).toContain("?ferramenta=highlight");
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
    expect(css).toContain("SIGAPRO PROCESS SURFACE CONTRACT V3 — ROOT 2026-10-14");
    expect(css).toContain('[data-surface="fixed-dark"]');
    expect(css).toContain("#sig-process-document-command-center");
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
    const polarity = readFileSync(resolve(process.cwd(), "src/styles/surface-polarity.css"), "utf8");
    const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const v14Start = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V14");
    const v14End = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V14 END", v14Start);
    const v14 = polarity.slice(v14Start, v14End);

    expect(portal).toContain("const topbarFill = darken(primaryColor, -5)");
    expect(portal).toContain("const topbarHighlight = darken(primaryColor, -11)");
    expect(portal).toContain("const topbarDepth = darken(primaryColor, 2)");
    expect(v14Start).toBeGreaterThanOrEqual(0);
    expect(v14End).toBeGreaterThan(v14Start);
    expect(v14).not.toContain(".sig-premium-topbar");
    expect(v14).not.toContain(".sig-topbar-shell");
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
    const polarity = readFileSync(resolve(process.cwd(), "src/styles/surface-polarity.css"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

    const start = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V14");
    const end = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V14 END", start);
    const contrastRoot = polarity.slice(start, end);
    expect(contrastRoot).toContain("#sig-process-document-command-center");
    expect(contrastRoot).toContain(".sig-command-metric-blue");
    expect(contrastRoot).toContain(".sig-command-metric-emerald");
    expect(contrastRoot).toContain(".sig-command-metric-amber");
    expect(contrastRoot).toContain('[data-layout-mode="default"]');
    expect(contrastRoot).toContain('[data-layout-mode="inverse-main"]');
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
    expect(polarity).toContain("Surface Polarity Contract V8");
    expect(polarity).toContain("PROCESS DETAIL VISIBILITY LOCK V14");
    expect(polarity).toContain("#sig-process-document-command-center");
    expect(polarity).toContain('[data-layout-mode="default"]');
    expect(polarity).toContain('[data-layout-mode="inverse-main"]');
    expect(polarity).toMatch(/color:\s*#ffffff\s*!important/);
    expect(polarity).toMatch(/color:\s*#0f172a\s*!important/);
  });
});


describe("canonical process surface contract", () => {
  it("keeps one scoped source of truth for light and dark process cards", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(css).toContain("SIGAPRO PROCESS SURFACE CONTRACT V3 — ROOT 2026-10-14");
    expect(css).not.toContain("PROCESS SURFACE CONTRAST ROOT V3");
    expect(css).not.toContain("THEME + PROCESS CONTRAST FINAL CONTRACT");
    expect(css).not.toContain("FINAL SURFACE POLARITY LOCK");
    expect(css).toContain('[data-layout-mode="default"] .sig-main-shell .sig-process-detail-premium [data-surface="adaptive-card"]');
    expect(css).toContain('[data-layout-mode="inverse-main"] .sig-main-shell .sig-process-detail-premium [data-surface="adaptive-card"]');
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


describe("final process contrast authority", () => {
  it("keeps the final polarity lock after every earlier rule and never targets topbar", () => {
    const polarity = readFileSync(resolve(process.cwd(), "src/styles/surface-polarity.css"), "utf8");
    const finalIndex = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V14");
    const finalEnd = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V14 END", finalIndex);
    const block = polarity.slice(finalIndex, finalEnd);

    expect(finalIndex).toBeGreaterThan(0);
    expect(finalEnd).toBeGreaterThan(finalIndex);
    expect(block).toMatch(/color:\s*#ffffff\s*!important/);
    expect(block).toContain("#sig-process-document-command-center");
    expect(block).toContain('[data-analysis-dark-header="true"]');
    expect(block).toContain('[data-permit-dark-header="true"]');
    expect(block).not.toContain(".sig-topbar");
    expect(block).not.toContain(".sig-premium-topbar");
  });
});


describe("authoritative V14 process-only contrast", () => {
  it("runs after earlier process rules and keeps the topbar out of scope", () => {
    const polarity = readFileSync(resolve(process.cwd(), "src/styles/surface-polarity.css"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const start = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V14");
    const end = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V14 END", start);
    const v14 = polarity.slice(start, end);

    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(v14).toContain('[data-analysis-dark-header="true"]');
    expect(v14).toContain("[data-command-metric]");
    expect(v14).toContain('[data-process-summary-card="true"]');
    expect(v14).not.toContain(".sig-premium-topbar");
    expect(v14).not.toContain(".sig-topbar-shell");
    expect(detail).toContain('data-premium-process-dark-header="documents"');
    expect(detail).toContain('data-command-metric="blue"');
    expect(detail).toContain("sig-summary-sky");
  });
});


describe("process analysis premium contrast contract v7", () => {
  it("keeps every dark process header bright and every adaptive summary card theme-safe", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const analysis = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"), "utf8");
    const permit = readFileSync(resolve(process.cwd(), "src/components/platform/ConstructionPermitPanel.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(detail).toContain('id="sig-process-document-command-center"');
    expect(detail).toContain('data-command-header-copy="true"');
    expect(analysis).toContain('data-premium-process-dark-header="analysis"');
    expect(analysis).toContain('data-analysis-metric="blue"');
    expect(permit).toContain('data-premium-process-dark-header="permit"');
    expect(permit).toContain('data-permit-header-status="true"');
    expect(css).toContain("PROCESS DETAIL PREMIUM CONTRACT V7");
    expect(css).toContain("#sig-process-document-command-center");
  });

  it("makes technical checklist selections unmistakable", () => {
    const analysis = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(analysis).toContain("data-checklist-status={status}");
    expect(analysis).toContain('data-selected={selected ? "true" : "false"}');
    expect(analysis).toContain("aria-pressed={selected}");
    expect(css).toContain('button[data-checklist-status="A"][data-selected="true"]');
    expect(css).toContain('button[data-checklist-status="C"][data-selected="true"]');
  });

  it("keeps dispatch compact and uses the municipal organogram as the destination control", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

    expect(detail).toContain('data-dispatch-panel="true"');
    expect(detail).toContain('data-dispatch-organogram="true"');
    expect(detail).toContain('data-dispatch-organogram-grid="true"');
    expect(detail).toContain("sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4");
    expect(detail).toContain('data-organogram-destination="true"');
    expect(detail).toContain('data-premium-dark-action="true"');
  });
});


describe("process detail visibility lock v13", () => {
  it("makes the post-index polarity file the final authority only inside the open process", () => {
    const polarity = readFileSync(resolve(process.cwd(), "src/styles/surface-polarity.css"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const analysis = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"), "utf8");
    const permit = readFileSync(resolve(process.cwd(), "src/components/platform/ConstructionPermitPanel.tsx"), "utf8");
    const start = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V13");
    const end = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V13 END", start);
    const v13 = polarity.slice(start, end);

    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(v13).toContain(".sig-process-detail-premium");
    expect(v13).toContain('[data-analysis-dark-header="true"]');
    expect(v13).toContain('[data-permit-dark-header="true"]');
    expect(v13).toContain('[data-analysis-signature-action="technical"]');
    expect(v13).toContain('[data-dispatch-organogram="true"] [data-organogram-code="true"]');
    expect(v13).toContain('button[data-checklist-status="NA"][data-selected="true"]');
    expect(v13).not.toContain(".sig-premium-topbar");
    expect(v13).not.toContain(".sig-topbar-shell");

    expect(detail).toContain('data-dark-header-action="true"');
    expect(analysis).toContain('data-analysis-dark-header="true"');
    expect(permit).toContain('data-permit-dark-header="true"');
  });
});


describe("process contrast v9", () => {
  it("keeps every fixed dark process header light-on-dark without touching the topbar", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const analysis = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"), "utf8");
    const permit = readFileSync(resolve(process.cwd(), "src/components/platform/ConstructionPermitPanel.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(detail).toContain("sig-process-dark-surface-v9");
    expect(analysis).toContain("sig-process-dark-surface-v9");
    expect(permit).toContain("sig-process-dark-surface-v9");
    const start = css.indexOf("PROCESS DETAIL CONTRAST FINAL V9");
    const end = css.indexOf("END PROCESS DETAIL CONTRAST FINAL V9", start);
    const v9 = css.slice(start, end > start ? end : css.length);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(v9).toContain(".sig-process-detail-premium .sig-process-dark-surface-v9");
    expect(v9).not.toContain(".sig-topbar");
  });

  it("makes selected technical checklist statuses unmistakable", () => {
    const analysis = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(analysis).toContain('data-selected={selected ? "true" : "false"}');
    expect(analysis).toContain("bg-emerald-600 !text-white");
    expect(analysis).toContain("bg-sky-600 !text-white");
    expect(analysis).toContain("bg-amber-600 !text-white");
    expect(css).toContain('button[data-checklist-status="A"][data-selected="true"]');
  });
});


describe("dispatch organogram polarity v14", () => {
  it("keeps the dispatch hierarchy readable in both visual families", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const polarity = readFileSync(resolve(process.cwd(), "src/styles/surface-polarity.css"), "utf8");

    expect(detail).toContain('data-dispatch-organogram-header="true"');
    expect(detail).toContain('data-dispatch-organogram-grid="true"');
    expect(polarity).toContain('[data-layout-mode="inverse-main"]');
    expect(polarity).toContain('[data-dispatch-organogram-header="true"]');
    expect(polarity).toContain('[data-organogram-destination="true"][data-selected="false"]');
  });
});


describe("blue process headers keep organogram context and readable contrast", () => {
  it("shows official organogram acronyms inside every blue process header", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const analysis = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"), "utf8");
    const permit = readFileSync(resolve(process.cwd(), "src/components/platform/ConstructionPermitPanel.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(detail).toContain("currentOrganizationTrail");
    expect(detail).toContain('data-dark-organogram-trail="true"');
    expect(analysis).toContain("organogramTrail");
    expect(analysis).toContain('data-dark-organogram-code="true"');
    expect(permit).toContain("organogramTrail");
    expect(permit).toContain('data-dark-organogram-code="true"');
    expect(css).toContain("PROCESS DARK HEADERS + ORGANOGRAM ACRONYMS V10");
    expect(css).toContain("[data-premium-process-dark-header]");
  });
});
