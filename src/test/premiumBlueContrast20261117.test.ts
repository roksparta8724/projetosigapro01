import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(file, "utf8");

function luminance(color: string) {
  const numbers = color.replace("#", "").match(/.{2}/g);
  if (!numbers || numbers.length !== 3) throw new Error("RGB inválido");
  const rgb = numbers.map(component => {
    const value = parseInt(component, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function contrast(foreground: string, background: string) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

describe("SIGAPRO — contrato de contraste das superfícies azuis", () => {
  const css = source("src/styles/sigapro-unified-process-workspace.css");
  const analyst = source("src/pages/saas/AnalystDeskPage.tsx");
  const municipality = source("src/pages/saas/TenantAdminPage.tsx");

  it("marca o cabeçalho, a distribuição e o card de equipe da Análise como azul-escuro", () => {
    expect(analyst).toContain('data-analysis-command-bar="true" data-premium-blue-surface="true"');
    expect(analyst).toContain('data-analysis-distribution-manager="true" data-premium-blue-surface="true"');
    expect(analyst).toContain('data-analysis-availability-card="true" data-premium-blue-surface="true"');
    expect(analyst).toContain('bg-[linear-gradient(115deg,#0b314c,#155b74)]');
  });

  it("padroniza a visão executiva e o cabeçalho de processos na Prefeitura", () => {
    expect(municipality).toContain('data-sigapro-summary-board="dark" data-premium-blue-surface="true"');
    expect(municipality).toContain('<header data-premium-blue-surface="true"');
    expect(css).toContain('[data-sigapro-summary-board="dark"] :is([data-summary-title="true"],[data-summary-value="true"])');
    expect(css).toContain('[data-sigapro-overview-processes="premium-v5"] > header :is(p,h2)');
  });

  it("texto do azul institucional passa AA, inclusive no tom mais claro do gradiente", () => {
    for (const background of ["#0b314c", "#155b74", "#0a263d", "#104e6b"]) {
      expect(contrast("#ffffff", background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#dfedf6", background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast("#bfe8fa", "#155b74")).toBeGreaterThanOrEqual(4.5);
  });

  it("botões brancos preservam escrita escura, sem regra universal de texto branco", () => {
    expect(contrast("#153b58", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain('.sig-premium-light-control');
    expect(css).toContain('-webkit-text-fill-color: #153b58 !important');
    expect(analyst).toContain('className="sig-premium-light-control h-10');
    expect(municipality).toContain('className="sig-premium-light-control h-9');
    expect(css).not.toMatch(/\[data-premium-blue-surface="true"\] \*\s*\{/);
  });

  it("azul do organograma mantém texto branco e não altera os cards claros", () => {
    const organogram = source("src/components/platform/MunicipalOrganizationChart.tsx");
    expect(organogram).toContain('data-organogram-code-surface="blue"');
    expect(organogram).toContain('data-contrast-surface="dark"');
    expect(css).toContain('[data-organogram-code-surface="blue"][data-contrast-surface="dark"]');
    expect(css).toContain('-webkit-text-fill-color: #ffffff !important');
  });
});
