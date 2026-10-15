import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("premium process card contrast contract", () => {
  it("forces dark process surfaces to use light foreground without touching global chrome", () => {
    const css = read("src/index.css");

    expect(css).toContain("PROCESS CARD CONTRAST CONTRACT V4");
    expect(read("src/styles/surface-polarity.css")).toContain("PROCESS VISIBILITY AUTHORITY V15");
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
    expect(analysis).toContain('<CardHeader data-force-card-contrast="dark"');
    expect(analysis).toContain('data-analysis-section="true"');
    expect(analysis).toContain('data-force-card-contrast="adaptive"');
    expect(permit).toContain('<CardHeader data-force-card-contrast="dark"');
    expect(permit).toContain('<DialogHeader data-force-card-contrast="dark"');
  });
});


describe("final process visibility authority V15", () => {
  it("keeps dark process headers bright without touching the app chrome", () => {
    const css = read("src/styles/surface-polarity.css");
    const start = css.indexOf("PROCESS VISIBILITY AUTHORITY V15");
    const block = css.slice(start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).toContain("#sig-process-document-command-center");
    expect(block).toContain('[data-process-dark-header="true"]');
    expect(block).toContain("color:#ffffff !important");
    expect(block).not.toContain(".sig-topbar");
    expect(block).not.toContain(".sig-sidebar");
    expect(block).not.toContain(".sig-footer");
  });

  it("makes checklist selections unmistakable", () => {
    const css = read("src/styles/surface-polarity.css");
    const block = css.slice(css.indexOf("PROCESS VISIBILITY AUTHORITY V15"));

    expect(block).toContain('button[data-checklist-status][data-selected="true"]');
    expect(block).toContain("transform:translateY(-2px) scale(1.10)");
    expect(block).toContain("outline:3px solid #ffffff");
  });

  it("keeps the Alvara summary readable in both light and inverse modes", () => {
    const css = read("src/styles/surface-polarity.css");
    const block = css.slice(css.indexOf("PROCESS VISIBILITY AUTHORITY V15"));

    expect(block).toContain('[data-permit-summary-card="true"]');
    expect(block).toContain("#08243a");
    expect(block).toContain("#f4fbff");
  });
});
