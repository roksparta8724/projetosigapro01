import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chart = readFileSync(
  resolve(process.cwd(), "src/components/platform/MunicipalOrganizationChart.tsx"),
  "utf8",
);
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

describe("organogram institutional blue code contrast", () => {
  it("renders acronym badges as institutional blue with explicit white copy", () => {
    expect(chart).toContain('data-organogram-level-badge="true"');
    expect(chart).toContain("sig-organogram-blue-code");
    expect(chart).toContain("!text-white");
    expect(chart).toContain("#075985");
  });

  it("prevents later theme rules from turning blue badge text dark", () => {
    expect(css).toContain("ORGANOGRAM BLUE CODE CONTRAST GUARD V1");
    expect(css).toContain('[data-organogram-code="true"]');
    expect(css).toContain('[data-organogram-level-badge="true"]');
    expect(css).toContain("color:#ffffff !important");
    expect(css).toContain("-webkit-text-fill-color:#ffffff !important");
  });
});
