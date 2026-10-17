import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("premium process card contrast contract", () => {
  it("forces dark process surfaces to use light foreground without touching global chrome", () => {
    const css = read("src/index.css");

    expect(css).toContain("PROCESS CARD CONTRAST CONTRACT V4");
    expect(css).toContain('[data-force-card-contrast="dark"]');
    expect(css).toContain('[data-force-card-contrast="adaptive"]');
    expect(css).toContain("#sig-process-document-command-center");
    expect(css).toContain("color: #ffffff !important");
    expect(css).toContain("background-color: #ffffff !important");
    expect(css).toContain('background-color: #0d1d2e !important');

    const contract = css.slice(css.lastIndexOf("PROCESS CARD CONTRAST CONTRACT V4"));
    expect(contract).toContain(".sig-main-shell");
    expect(contract).not.toContain(".sig-topbar");
    expect(contract).not.toContain(".sig-sidebar-shell");
    expect(contract).not.toContain(".sig-footer");
  });

  it("marks the document center and newest municipal dark headers explicitly", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const analysis = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const permit = read("src/components/platform/ConstructionPermitPanel.tsx");

    expect(detail).toContain('data-force-card-contrast="dark"');
    expect(detail).toContain('data-force-card-contrast="adaptive"');
    expect(analysis).toContain('data-force-card-contrast="dark"');
    expect(analysis).toContain('data-analysis-dark-header="true"');
    expect(analysis).toContain('data-analysis-section="true"');
    expect(analysis).toContain('data-force-card-contrast="adaptive"');
    expect(permit).toContain('data-force-card-contrast="dark"');
    expect(permit).toContain('data-permit-dark-header="true"');
    expect(permit).toContain('<DialogHeader data-force-card-contrast="dark"');
  });
});
