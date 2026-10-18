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

  it("keeps dispatch organogram acronym badges white without changing typography", () => {
    expect(processDetail).toContain('data-organogram-code="true"');
    expect(processDetail).toContain('data-organogram-code-surface="blue"');
    expect(processDetail).toContain('data-organogram-code-text="true"');
    expect(processDetail).toContain('className="block whitespace-nowrap text-[10px] font-extrabold');
  });

  it("uses the premium institutional blue only on the selected destination surface", () => {
    expect(css).toContain(
      "linear-gradient(135deg,#0a2238 0%,#0b3f5f 54%,#0b6385 100%)",
    );
    expect(css).toContain("border-color:rgba(79,183,218,.72) !important");
  });


  it("forces every dispatch acronym white and selected-card copy/icons light", () => {
    expect(css).toContain("DISPATCH ORGANOGRAM CONTRAST AUTHORITY V12");
    expect(css).toContain('[data-organogram-code-text="true"]');
    expect(css).toContain("text-shadow:none !important");
    expect(css).toContain('[data-selected-organogram-card="true"]');
    expect(css).toContain("color:#f8fbff !important");
    expect(css).toContain("stroke:#f2fbff !important");
    expect(css).toContain("color:#ffffff !important");
  });

  it("keeps compact organogram paths on the same crisp white acronym treatment", () => {
    expect(bar).toContain('data-organogram-code="true"');
    expect(bar).toContain('data-organogram-code-text="true"');
    expect(bar).toContain('text-[10px] font-extrabold');
  });
});
