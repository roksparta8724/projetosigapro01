import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("analysis desk dark premium contrast", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
  it("does not render a white distribution manager in the dark technical desk", () => {
    expect(source).toContain('data-analysis-distribution-manager="true"');
    expect(source).toContain("border border-white/15 bg-[linear-gradient(180deg,#102637_0%,#0b1c2e_100%)]");
    expect(source).not.toContain('border border-slate-200 bg-white shadow-[0_12px_32px');
  });
  it("renders the technical queue navigation as a dark surface with legible text", () => {
    expect(source).toContain("border border-sky-400/25 bg-[linear-gradient(135deg,#0c2131_0%,#0b2538_100%)]");
    expect(source).toContain("text-sky-100");
    expect(source).toContain("text-sky-200/90");
  });
  it("keeps indicator labels readable on dark backgrounds", () => {
    expect(source).toContain("mt-2 text-2xl font-black text-white");
    expect(source).toContain("mt-1 text-xs text-slate-300");
    expect(source).toContain("bg-amber-400/10");
    expect(source).toContain("bg-emerald-400/10");
  });
});
