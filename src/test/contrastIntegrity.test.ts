import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const badge = readFileSync(resolve(process.cwd(), "src/components/ui/badge.tsx"), "utf8");
const input = readFileSync(resolve(process.cwd(), "src/components/ui/input.tsx"), "utf8");
const select = readFileSync(resolve(process.cwd(), "src/components/ui/select.tsx"), "utf8");
const button = readFileSync(resolve(process.cwd(), "src/components/ui/button.tsx"), "utf8");
const financeProtocols = readFileSync(resolve(process.cwd(), "src/pages/saas/FinanceProtocolsPage.tsx"), "utf8");

describe("global contrast integrity", () => {
  it("marks core controls so inverse and default layouts can enforce readable text", () => {
    expect(badge).toContain('data-ui="badge"');
    expect(input).toContain('data-ui="input"');
    expect(select).toContain('data-ui="select-trigger"');
    expect(button).toContain('data-ui="button"');
  });

  it("keeps inverse controls readable on remapped dark surfaces", () => {
    expect(css).toContain("Global contrast contract");
    expect(css).toContain('[data-layout-mode="inverse-main"] .sig-main-shell [data-ui="badge"]');
    expect(css).toContain('[data-layout-mode="inverse-main"] .sig-main-shell [data-ui="input"]');
    expect(css).toContain('[data-layout-mode="inverse-main"] .sig-main-shell [data-ui="select-trigger"]');
    expect(css).toContain("color: #e8eef9 !important");
    expect(css).toContain("color: #eef4ff !important");
  });

  it("keeps default light controls readable and fixes direct low-contrast combinations", () => {
    expect(css).toContain('[data-layout-mode="default"] .sig-main-shell [data-ui="input"]');
    expect(css).toContain('[data-layout-mode="default"] .sig-main-shell [data-ui="select-trigger"]');
    expect(css).toContain('[class*="bg-white"][class*="text-white"]');
    expect(css).toContain("Direct low-contrast class combinations are corrected");
    expect(css).toContain('[class*="bg-[#f"]');
    expect(css).toContain('[class*="text-[#1"]');
  });

  it("keeps finance guide and PIX surfaces readable in both layout modes", () => {
    expect(financeProtocols).toContain("sig-finance-guide-card");
    expect(financeProtocols).toContain("sig-finance-pix-surface");
    expect(financeProtocols).toContain("sig-finance-pix-code");
    expect(css).toContain('[data-layout-mode="inverse-main"] .sig-main-shell .sig-finance-pix-surface');
    expect(css).toContain('[data-layout-mode="default"] .sig-main-shell .sig-finance-pix-surface');
  });
});
