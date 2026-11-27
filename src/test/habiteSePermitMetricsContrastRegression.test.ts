import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "src/components/platform/HabiteSePermitPanel.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/styles/surface-polarity.css"), "utf8");

describe("Habite-se final permit premium metric contrast", () => {
  it("marks exactly four summary metrics without touching the permit workflow", () => {
    expect(panel).toContain('data-habite-se-permit-panel="true"');
    for (const tag of [
      'data-habite-se-permit-metric="true"',
      'data-habite-se-permit-metric-label="true"',
      'data-habite-se-permit-metric-value="true"',
    ]) expect(panel.split(tag).length - 1).toBe(4);
    for (const label of ["Número", "Área certificada", "Analista responsável", "Diretoria"]) expect(panel).toContain(label);
    expect(panel).toContain("Assinatura obrigatória da Diretoria validada");
    expect(panel).toContain('data-habite-se-secretary-signature="optional"');
  });
  it("forces navy cards and bright text in inverse-main instead of white-on-white", () => {
    expect(css).toContain("HABITE-SE ALVARA SUMMARY CONTRAST V22");
    expect(css).toContain('[data-layout-mode="inverse-main"] .sig-main-shell');
    expect(css).toContain('background:linear-gradient(145deg,#102c43 0%,#0b2136 100%) !important;');
    expect(css).toContain('color:#b9d6ea !important;');
    expect(css).toContain('color:#ffffff !important;');
  });
  it("uses white cards with dark readable text in the default layout only within Habite-se", () => {
    expect(css).toContain('[data-layout-mode="default"] .sig-main-shell');
    expect(css).toContain('background:linear-gradient(145deg,#ffffff 0%,#f3f8fc 100%) !important;');
    expect(css).toContain('color:#405970 !important;');
    expect(css).toContain('color:#10243b !important;');
    expect(css).toContain('[data-habite-se-permit-panel="true"]');
    expect(css).toContain('overflow-wrap:anywhere;');
  });
});
