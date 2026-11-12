import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SecureRoutePending } from "@/components/platform/SecureRoutePending";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const css = source("src/styles/institutional-premium-v3.css");
const app = source("src/App.tsx");
const frame = source("src/components/platform/PortalFrame.tsx");
const main = source("src/main.tsx");

function luminance(hex: string) {
  const rgb = [1, 3, 5].map((position) => {
    const n = parseInt(hex.slice(position, position + 2), 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const l = luminance(a);
  const r = luminance(b);
  return (Math.max(l, r) + 0.05) / (Math.min(l, r) + 0.05);
}

describe("premium institutional v3, all internal pages", () => {
  it("loads AFTER all historical overrides and scopes to real PortalFrame only", () => {
    expect(frame).toContain('data-premium-design="institutional-v3"');
    const original = main.indexOf('import "./index.css"');
    const polarity = main.indexOf('import "./styles/surface-polarity.css"');
    const navigation = main.indexOf('import "./styles/premium-navigation-contrast.css"');
    const restored = main.indexOf('import "./styles/institutional-premium-v3.css"');
    expect(restored).toBeGreaterThan(navigation);
    expect(navigation).toBeGreaterThan(polarity);
    expect(polarity).toBeGreaterThan(original);
  });

  it("restores dark-blue metrics and matching white text instead of forcing all cards white", () => {
    expect(css).toContain('.sig-stat-card,.sig-metric-card');
    expect(css).toContain('linear-gradient(143deg, #0c334e 0%, #0b2941 68%, #124962 100%)');
    expect(css).toContain('color: #ffffff !important');
    expect(css).toContain('background: linear-gradient(180deg, #f8fbfe 0%, #edf4fa 100%)');
    expect(contrast("#ffffff", "#124962")).toBeGreaterThan(7);
    expect(contrast("#d8e7f3", "#124962")).toBeGreaterThan(7);
    expect(contrast("#123550", "#edf4fa")).toBeGreaterThan(7);
  });

  it("isolates the design from document PDF canvases, action buttons and official logos", () => {
    expect(css).not.toContain("canvas {");
    expect(css).not.toContain('data-surface="fixed-dark"');
    expect(css).not.toContain("button.sig-primary-document-action");
    expect(css).not.toContain(".sig-institution-logo-surface");
    expect(css).not.toContain('input[type="text"]');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it("keeps the authorized route visible while lazy modules load, and switches logout immediately", () => {
    expect(app).toContain("useDeferredValue(location)");
    expect(app).toContain("isPublicEntryPath ? location : deferredLocation");
    expect(app).toContain("<Routes location={displayedLocation}>");
    expect(app).toContain('<Suspense fallback={<SecureRoutePending surface="route"');
    expect(app).not.toContain('title="Carregando a página solicitada"');
  });

  it("does not add extra viewport height or lose desktop menu after scrolling", () => {
    expect(frame).not.toContain('minHeight: "117.6470588235vh"');
    expect(css).toContain('grid-auto-rows: max-content !important');
    expect(css).toContain('position: sticky !important');
    expect(css).toContain('top: var(--sig-topbar-height, 68px) !important');
    expect(css).toContain('overflow-y: auto !important');
    expect(css).toContain('height: auto !important');
  });

  it("does not flash the preboot recovery screen during successful reload", () => {
    const html = source("index.html");
    expect(html).toContain('data-sigapro-boot-slow');
    expect(html).toContain('}, 15000);');
    expect(html).toContain('display: none;');
    expect(html).toContain('data-sigapro-initial-render="true"][data-sigapro-boot-slow="true"]');
    expect(html).not.toContain('blocking="render"');
  });

  it("renders error recovery with the actual V2 theme and no leaked technical details", () => {
    const error = source("src/components/platform/AppErrorBoundary.tsx");
    expect(error).toContain('window.localStorage.getItem("sigapro-layout-theme.v2")');
    expect(error).toContain('bg-[#102a40]');
    expect(error).not.toContain("sig-ui-card w-full max-w-xl");
    expect(error).toContain("import.meta.env.DEV ? (");
    expect(error).toContain("Não foi possível abrir esta página");
  });

  it("does not create a giant white verification card during cold route load", () => {
    const { container } = render(<SecureRoutePending surface="route" />);
    const mainElement = screen.getByRole("status");
    expect(mainElement).toHaveAttribute("data-sigapro-route-pending", "route");
    expect(container.querySelector(".bg-white")).toBeNull();
    expect(mainElement).toHaveClass("sr-only");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector("main")).toBeNull();
  });
});
