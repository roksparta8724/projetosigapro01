import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/saas/ExternalProcessControlPage.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/styles/surface-polarity.css"), "utf8");

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("marcadores escuros da carteira externa", () => {
  it("mantém a etiqueta existente e sua cor semântica, sem converter em bandeira", () => {
    expect(page).toContain('data-external-process-marker="true"');
    expect(page).toContain('data-external-marker-label="true"');
    expect(page).toContain('style={{ color: marker.color, fill: marker.color }}');
    expect(page).toContain('bg-[#102b44]');
    expect(page).toContain("parseMarker(tag)");
  });

  it("garante cor de texto legível em chip escuro, independente do tema", () => {
    const section = css.slice(css.indexOf("PROCESSOS EXTERNOS > MARCADORES — CONTRASTE V23"));
    expect(section).toContain('[data-process-premium-card="true"] [data-external-process-marker="true"]');
    expect(section).toContain('[data-external-marker-label="true"]');
    expect(section).toContain("color:#f8fafc !important");
    expect(section).toContain("-webkit-text-fill-color:#f8fafc !important");
    const contrast = (luminance("#f8fafc") + 0.05) / (luminance("#102b44") + 0.05);
    expect(contrast).toBeGreaterThan(7);
  });

  it("não recolore ícones, menus, pagamentos, badges ou outras superfícies", () => {
    const section = css.slice(css.indexOf("PROCESSOS EXTERNOS > MARCADORES — CONTRASTE V23"));
    expect(section).not.toMatch(/\bsvg\b/);
    expect(section).not.toContain(".sig-premium-topbar");
    expect(section).not.toContain(".sig-sidebar-shell");
    expect(section).not.toContain("[data-external-payment-guide=");
    expect(section).not.toContain("[data-ui=");
  });
});
