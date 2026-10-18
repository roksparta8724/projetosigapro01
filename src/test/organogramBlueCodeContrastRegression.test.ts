import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chart = readFileSync(
  resolve(process.cwd(), "src/components/platform/MunicipalOrganizationChart.tsx"),
  "utf8",
);
const bar = readFileSync(
  resolve(process.cwd(), "src/components/platform/MunicipalOrganogramBar.tsx"),
  "utf8",
);
const glyph = readFileSync(
  resolve(process.cwd(), "src/components/platform/OrganogramAcronymGlyph.tsx"),
  "utf8",
);
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const processDetail = readFileSync(
  resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"),
  "utf8",
);

describe("organogram institutional blue code contrast", () => {
  it("renders acronym badges through a dedicated white SVG glyph", () => {
    expect(chart).toContain('data-organogram-level-badge="true"');
    expect(chart).toContain('data-organogram-code-surface="blue"');
    expect(chart).toContain("OrganogramAcronymGlyph");
    expect(glyph).toContain('data-organogram-code-glyph="true"');
    expect(glyph).toContain('fill="#ffffff"');
    expect(glyph).toContain('fill: "#ffffff"');
  });

  it("prevents any theme/card rule from repainting the acronym glyph dark", () => {
    expect(css).toContain("ORGANOGRAM SVG GLYPH WHITE LOCK V4");
    expect(css).toContain('[data-organogram-code-glyph="true"] text');
    expect(css).toContain("fill: #ffffff !important");
    expect(css).toContain("-webkit-text-fill-color: #ffffff !important");
  });

  it("keeps dispatch organogram acronym badges white inside blue destination cards", () => {
    expect(processDetail).toContain('data-organogram-code="true"');
    expect(processDetail).toContain('data-organogram-code-surface="blue"');
    expect(processDetail).toContain("OrganogramAcronymGlyph");
    expect(processDetail).toContain(
      "bg-[linear-gradient(135deg,#075985_0%,#0f78b8_100%)]",
    );
  });

  it("keeps compact organogram paths on the same white acronym implementation", () => {
    expect(bar).toContain("OrganogramAcronymGlyph");
    expect(bar).toContain('data-organogram-code="true"');
  });
});
