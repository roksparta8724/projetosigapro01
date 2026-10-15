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
