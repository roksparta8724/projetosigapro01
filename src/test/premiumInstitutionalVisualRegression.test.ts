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
const signatureQr = read("src/components/platform/SignatureVerificationQr.tsx");
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
    expect(signatureQr).toContain('data-premium-qr="true"');
    expect(css).toContain('[data-premium-action="strong"]');
    expect(css).toContain('[data-premium-signature-evidence="true"]');
    expect(css).toContain('[data-premium-qr="true"]');
  });

  it("uses an immutable SEI-style raster QR with a four-module white quiet zone", () => {
    expect(permit).toContain("SignatureVerificationQr");
    expect(permit).toContain("secretaryVerificationUrl");
    expect(analysis).toContain("SignatureVerificationQr");
    expect(analysis).toContain('data-analysis-signature-qr="true"');
    expect(signatureQr).toContain("createQrCodeDataUrl(verificationUrl, 128)");
    expect(signatureQr).toContain('data-signature-qr-raster="true"');
    expect(signatureQr).toContain("sig-sei-verification-qr-image");
    expect(qr).toContain('level: "M"');
    expect(qr).toContain("marginSize: 4");
    expect(qr).toContain("boostLevel: false");
    expect(qr).toContain('fgColor: "#000000"');
    expect(qr).toContain('bgColor: "#ffffff"');
    expect(permitPdf).toContain("secretaryVerificationQrDataUrl");
    expect(css).toContain("SIGNATURE QR RASTER QUALITY LOCK V3");
    expect(css).toContain("image-rendering:pixelated");
    expect(css).toContain("mix-blend-mode:normal !important");
  });
});
