import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("process forms and worksheet contrast", () => {
  it("scopes permit contrast fixes to the permit component only", () => {
    const permit = read("src/components/platform/ConstructionPermitPanel.tsx");
    const css = read("src/index.css");

    expect(permit).toContain('data-construction-permit-panel="true"');
    expect(permit).toContain('data-workspace-surface="adaptive"');
    expect(permit).toContain('data-permit-prep="true"');
    expect(css).toContain("PROCESS FORMS / SHEETS CONTRAST CONTRACT V1");
    expect(css).toContain('[data-construction-permit-panel="true"]');
  });

  it("keeps the urban analysis worksheet explicitly theme-aware", () => {
    const sheet = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const css = read("src/index.css");

    expect(sheet).toContain('data-urban-analysis-sheet="true"');
    expect(sheet).toContain('data-analysis-identity="true"');
    expect(sheet).toContain('data-analysis-mini-card="true"');
    expect(sheet).toContain('data-analysis-legend="true"');
    expect(css).toContain('[data-urban-analysis-sheet="true"]');
    expect(css).toContain('[data-layout-mode="inverse-main"]');
    expect(css).toContain('[data-layout-mode="default"]');
  });

  it("does not target the topbar in the worksheet contrast contract", () => {
    const css = read("src/index.css");
    const start = css.indexOf("PROCESS FORMS / SHEETS CONTRAST CONTRACT V1");
    const end = css.indexOf("END PROCESS FORMS / SHEETS CONTRAST CONTRACT V1");
    const block = css.slice(start, end);

    expect(block).not.toContain(".sig-topbar");
    expect(block).not.toContain(".sig-app-topbar");
    expect(block).not.toContain(".sig-sidebar");
  });

  it("keeps technical checklist cards inside the same contrast contract", () => {
    const checklist = read("src/components/platform/TechnicalChecklistPanel.tsx");

    expect(checklist).toContain('data-technical-checklist="true"');
    expect(checklist).toContain('data-force-card-contrast="adaptive"');
    expect(checklist).toContain('data-workspace-surface="adaptive"');
  });
});


describe("analysis and Alvara premium V11 contract", () => {
  it("locks the final V11 visual contract without touching app chrome", () => {
    const css = read("src/styles/surface-polarity.css");
    const start = css.lastIndexOf("PROCESS ANALYSIS + ALVARA POLARITY LOCK V11");
    const block = css.slice(start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).toContain('[data-urban-analysis-sheet="true"]');
    expect(block).toContain('[data-construction-permit-panel="true"]');
    expect(block).toContain('[data-permit-summary-card="true"]');
    expect(block).toContain('[data-analysis-section="true"]');
    expect(block).not.toContain(".sig-premium-topbar");
    expect(block).not.toContain(".sig-topbar-shell");
    expect(block).not.toContain(".sig-sidebar");
    expect(block).not.toContain(".sig-footer");
  });

  it("marks analysis worksheet sections and signatures explicitly", () => {
    const sheet = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");

    expect(sheet).toContain('data-analysis-section="true"');
    expect(sheet).toContain('data-analysis-row="true"');
    expect(sheet).toContain('data-analysis-conclusion="true"');
    expect(sheet).toContain('data-analysis-validation="true"');
    expect(sheet).toContain('data-analysis-signature-card="technical"');
    expect(sheet).toContain('data-analysis-signature-card="fiscal"');
  });

  it("marks Alvara cards explicitly so light/dark contrast cannot drift", () => {
    const permit = read("src/components/platform/ConstructionPermitPanel.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(permit).toContain('data-permit-status-grid="true"');
    expect(permit).toContain('data-permit-status-card="true"');
    expect(permit).toContain('data-permit-prerequisite-card="true"');
    expect(permit).toContain('data-permit-detail-card="true"');
    expect(permit).toContain('data-permit-signature-card="analyst"');
    expect(permit).toContain('data-permit-signature-card="director"');
    expect(permit).toContain('data-permit-dialog-section="true"');
    expect(detail).toContain('data-permit-summary-card="true"');
  });
});
