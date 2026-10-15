import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("process contrast contract", () => {
  it("keeps dark process headers explicit and isolated from the global topbar", () => {
    const css = read("src/index.css");
    const process = read("src/pages/saas/ProcessDetailPage.tsx");
    const analysis = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const permit = read("src/components/platform/ConstructionPermitPanel.tsx");

    expect(process).toContain('data-premium-inverse-surface="true"');
    expect(analysis).toContain('data-premium-inverse-surface="true"');
    expect(permit).toContain('data-premium-inverse-surface="true"');
    expect(css).toContain("PROCESS DETAIL VISIBILITY CONTRACT V5");
    expect(css).toContain(".sig-process-detail-premium [data-premium-inverse-surface=");
    expect(css).not.toContain("PROCESS DETAIL VISIBILITY CONTRACT V5 — TOPBAR");
  });

  it("makes selected checklist states visually filled and unmistakable", () => {
    const css = read("src/index.css");
    const analysis = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");

    expect(analysis).toContain("data-checklist-status={status}");
    expect(css).toContain('[data-checklist-status="A"][aria-pressed="true"]');
    expect(css).toContain('[data-checklist-status="AP"][aria-pressed="true"]');
    expect(css).toContain('[data-checklist-status="C"][aria-pressed="true"]');
    expect(css).toContain('[data-checklist-status="NA"][aria-pressed="true"]');
  });

  it("keeps organogram destination chips readable in light and inverse themes", () => {
    const css = read("src/index.css");
    const process = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(process).toContain('data-organogram-destination="true"');
    expect(process).toContain('data-organogram-code="true"');
    expect(css).toContain('[data-organogram-destination="true"]');
    expect(css).toContain('[data-organogram-code="true"]');
  });

  it("keeps filled action buttons and header icons white on dark surfaces", () => {
    const css = read("src/index.css");
    const analysis = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const permit = read("src/components/platform/ConstructionPermitPanel.tsx");

    expect(analysis).toContain('data-premium-dark-action="true"');
    expect(permit).toContain('data-premium-header-icon="true"');
    expect(css).toContain('[data-premium-dark-action="true"]');
    expect(css).toContain('[data-premium-header-icon="true"] svg');
  });
});


describe("V14 process-only authority", () => {
  it("locks dark process headers to light typography without touching app chrome", () => {
    const css = read("src/styles/surface-polarity.css");
    const process = read("src/pages/saas/ProcessDetailPage.tsx");
    const analysis = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const permit = read("src/components/platform/ConstructionPermitPanel.tsx");

    expect(css).toContain("PROCESS PREMIUM POLARITY AUTHORITY V14");
    expect(css).toContain('[data-process-dark-header="true"]');
    expect(css).toContain("color:#ffffff !important");
    expect(process).toContain('data-process-dark-header="true"');
    expect(analysis).toContain('data-process-dark-header="true"');
    expect(permit).toContain('data-process-dark-header="true"');

    const block = css.slice(css.lastIndexOf("PROCESS PREMIUM POLARITY AUTHORITY V14"));
    expect(block).not.toContain(".sig-topbar");
    expect(block).not.toContain(".sig-sidebar");
    expect(block).not.toContain(".sig-footer");
  });

  it("makes checklist selections visually unmistakable", () => {
    const css = read("src/styles/surface-polarity.css");

    expect(css).toContain('button[data-checklist-status][data-selected="true"]');
    expect(css).toContain("scale(1.08)");
    expect(css).toContain('button[data-checklist-status="A"][data-selected="true"]');
    expect(css).toContain('button[data-checklist-status="AP"][data-selected="true"]');
    expect(css).toContain('button[data-checklist-status="C"][data-selected="true"]');
    expect(css).toContain('button[data-checklist-status="NA"][data-selected="true"]');
  });

  it("keeps light process cards dark-on-light and inverse cards light-on-dark", () => {
    const css = read("src/styles/surface-polarity.css");

    expect(css).toContain('[data-layout-mode="default"]');
    expect(css).toContain('[data-process-summary-card="true"]');
    expect(css).toContain("color:#0b1726 !important");
    expect(css).toContain('[data-layout-mode="inverse-main"]');
    expect(css).toContain("color:#f8fbff !important");
  });
});
