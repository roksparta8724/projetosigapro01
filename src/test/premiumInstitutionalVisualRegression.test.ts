import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const css = read("src/index.css");
const pageLayout = read("src/components/platform/PageLayout.tsx");
const metricCard = read("src/components/platform/MetricCard.tsx");
const statCard = read("src/components/platform/StatCard.tsx");
const tableCard = read("src/components/platform/TableCard.tsx");
const alertCard = read("src/components/platform/AlertCard.tsx");
const sidebar = read("src/components/platform/AppSidebar.tsx");
const permit = read("src/components/platform/ConstructionPermitPanel.tsx");
const analysis = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
const qr = read("src/lib/qrCode.ts");
const permitPdf = read("src/lib/constructionPermitPdf.ts");
const dashboard = read("src/pages/saas/DashboardHomePage.tsx");
const landing = read("src/pages/saas/LandingPage.tsx");

describe("premium institutional visual contract", () => {
  it("keeps core cards adaptive with readable polarity in both workspace themes", () => {
    expect(pageLayout).toContain('data-premium-surface="header"');
    expect(pageLayout).toContain('data-premium-surface="section"');
    expect(metricCard).toContain('data-premium-surface="metric"');
    expect(statCard).toContain('data-premium-surface="metric"');
    expect(tableCard).toContain('data-premium-surface="section"');
    expect(alertCard).toContain('data-premium-surface="section"');
    expect(dashboard).toContain('data-premium-surface="metric"');
    expect(css).toContain("SIGAPRO INSTITUTIONAL PREMIUM VISUAL CONTRACT V1");
    expect(css).toContain('[data-layout-mode="default"]');
    expect(css).toContain('[data-layout-mode="inverse-main"]');
    expect(css).toContain("color: #f8fbff !important");
    expect(css).toContain("color: #0b1726 !important");
  });

  it("never renders gray labels over the active institutional blue navigation", () => {
    expect(pageLayout).toContain('data-premium-nav-active={active ? "true" : "false"}');
    expect(css).toContain('[data-premium-nav-active="true"]');
    expect(css).toContain("color: #ffffff !important");
    expect(css).toContain("color: #08263d !important");
  });

  it("keeps sidebar navigation readable on the institutional dark surface", () => {
    expect(sidebar).toContain('data-sidebar-surface={darkSurface ? "dark" : "light"}');
    expect(css).toContain('.sig-sidebar-shell[data-sidebar-surface="dark"]');
    expect(css).toContain("color: #e2edf8 !important");
  });

  it("keeps the public product mock navigation bright on the blue institutional sidebar", () => {
    expect(landing).toContain('data-landing-module={module.label}');
    expect(landing).toContain('!text-[#f7fbff]');
    expect(landing).toContain('!text-[#d8ecf9]');
    expect(landing).toContain('bg-white/[0.025]');
    expect(landing).not.toContain('? "font-medium text-slate-200"');
    expect(sidebar).toContain('!text-[#f7fbff]');
    expect(sidebar).toContain('!text-[#e7f3fb]');
  });

  it("gives Alvará actions and electronic signatures an explicit premium contrast contract", () => {
    expect(permit).toContain('data-premium-action="strong"');
    expect(permit).toContain("sig-premium-primary-action");
    expect(permit).toContain('data-premium-signature-evidence="true"');
    expect(permit).toContain('data-premium-qr="true"');
    expect(css).toContain('[data-premium-action="strong"]');
    expect(css).toContain('[data-premium-signature-evidence="true"]');
    expect(css).toContain('[data-premium-qr="true"]');
  });

  it("uses a high-contrast SEI-like QR on a pure-white scan field", () => {
    expect(permit).toContain('fgColor="#111111"');
    expect(permit).toContain('size={112}');
    expect(permit).toContain("secretaryVerificationUrl");
    expect(analysis).toContain('fgColor="#111111"');
    expect(analysis).toContain('size={112}');
    expect(analysis).toContain('data-premium-qr="true"');
    expect(qr).toContain('level: "M"');
    expect(qr).toContain('fgColor: "#111111"');
    expect(qr).toContain('bgColor: "#ffffff"');
    expect(permitPdf).toContain("secretaryVerificationQrDataUrl");
    expect(permitPdf).toContain("pdf.roundedRect(qrX - 1.15");
    expect(css).toContain("SIGNATURE QR + TOPBAR INITIALS FINAL V2");
    expect(css).toContain("color:#000000 !important");
  });
});
