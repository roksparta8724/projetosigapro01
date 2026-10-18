import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chart = readFileSync(
  resolve(process.cwd(), "src/components/platform/MunicipalOrganizationChart.tsx"),
  "utf8",
);
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const processDetail = readFileSync(
  resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"),
  "utf8",
);

describe("organogram institutional blue code contrast", () => {
  it("renders acronym badges as institutional blue with a dedicated white glyph node", () => {
    expect(chart).toContain('data-organogram-level-badge="true"');
    expect(chart).toContain('data-organogram-code-surface="blue"');
    expect(chart).toContain('data-organogram-code-text="true"');
    expect(chart).toContain('WebkitTextFillColor: "#ffffff"');
    expect(chart).toContain("#075985");
  });

  it("prevents any theme/card rule from repainting the acronym glyph dark", () => {
    expect(css).toContain("ORGANOGRAM BLUE ACRONYM ROOT FIX V3");
    expect(css).toContain('[data-organogram-code-surface="blue"]');
    expect(css).toContain('[data-organogram-code-text="true"]');
    expect(css).toContain("color: #ffffff !important");
    expect(css).toContain("-webkit-text-fill-color: #ffffff !important");
  });

  it("keeps dispatch organogram acronym badges white inside the blue destination cards", () => {
    expect(processDetail).toContain('data-organogram-code="true"');
    expect(processDetail).toContain('data-organogram-code-surface="blue"');
    expect(processDetail).toContain('data-organogram-code-text="true"');
    expect(processDetail).toContain('WebkitTextFillColor: "#ffffff"');
    expect(processDetail).toContain(
      "bg-[linear-gradient(135deg,#075985_0%,#0f78b8_100%)]",
    );
  });
});
