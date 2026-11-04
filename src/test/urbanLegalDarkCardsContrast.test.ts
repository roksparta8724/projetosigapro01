import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

function wcagRatio(foreground: string, background: string) {
  const brightness = (hex: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const linear = channels.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const a = brightness(foreground), b = brightness(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("SIGAPRO — premium contrast for legal QA cards", () => {
  it("maintains readable text with AA contrast on inverse surfaces", () => {
    expect(wcagRatio("#f2f7ff", "#10253a")).toBeGreaterThan(7);
    expect(wcagRatio("#d8e5f4", "#152b43")).toBeGreaterThan(7);
    expect(wcagRatio("#ecf4ff", "#0e2136")).toBeGreaterThan(7);
    expect(wcagRatio("#f1f7ff", "#0b3150")).toBeGreaterThan(7);
  });
  it("uses narrowly scoped inverse-main rules without recoloring original PDFs", () => {
    const css = read("src/index.css");
    const styles = css.slice(css.lastIndexOf("SIGAPRO LEGAL / DARK-CARD CONTRAST"));
    expect(styles).toContain('[data-legal-management-workspace="true"]');
    expect(styles).toContain('[data-urban-qii-metric="true"]');
    expect(styles).toContain('[data-urban-qii-page-card="true"]');
    expect(styles).toContain("-webkit-text-fill-color");
    expect(styles).not.toContain("filter: invert");
    expect(styles).not.toContain("iframe {");
    expect(styles).not.toContain("canvas {");
  });
  it("enforces theme contrast in Quadro I and Quadro II, not only tab headlines", () => {
    const qi = read("src/components/platform/UrbanLegalMatrixReviewPanel.tsx");
    const qii = read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const rules = read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    expect(qii.match(/data-urban-qii-metric="true"/g)).toHaveLength(4);
    expect(qii).toContain('data-urban-qii-page-title="true"');
    expect(qii).toContain('data-urban-qii-page-detail="true"');
    expect(qii).toContain("dark:text-white");
    expect(qi).toContain("dark:text-slate-200");
    expect(rules).toContain('data-urban-quadros-workspace="true"');
  });
});
