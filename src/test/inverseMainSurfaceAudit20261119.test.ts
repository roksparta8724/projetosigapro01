import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const dark = read("src/styles/sigapro-inverse-workspace-premium.css");
const main = read("src/main.tsx");
const protocol = read("src/pages/saas/ProtocolDeskPage.tsx");
const portal = read("src/components/platform/PortalFrame.tsx");
const workspace = read("src/components/platform/ProcessWorkspaceHeader.tsx");
const finance = read("src/styles/sigapro-finance-premium.css");
const tabStyles = read("src/styles/sigapro-protocol-section-nav.css");

function luminance(color: string) {
  const rgb = [1, 3, 5]
    .map((n) => parseInt(color.slice(n, n + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(foreground: string, background: string) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("SIGAPRO — pente-fino de contraste no tema inverse-main", () => {
  it("carrega o contrato de tema após as antigas máscaras de branco", () => {
    expect(main.indexOf('import "./styles/sigapro-role-blue-contrast.css"'))
      .toBeLessThan(main.indexOf('import "./styles/sigapro-inverse-workspace-premium.css"'));
    expect(main.indexOf('import "./styles/sigapro-finance-premium.css"'))
      .toBeLessThan(main.indexOf('import "./styles/sigapro-inverse-workspace-premium.css"'));
    expect(dark).toContain('[data-layout-mode="inverse-main"]');
    expect(portal).toContain('data-layout-mode={inverseMainTheme ? "inverse-main" : "default"}');
  });

  it("não permite card branco ou legenda branca invisível no Painel Operacional", () => {
    expect(protocol).toContain('data-sigapro-protocol-quick-actions="true"');
    expect(protocol).toContain('data-sigapro-protocol-live-summary="true"');
    expect(protocol).toContain('sig-protocol-desk sig-module-summary-active');
    expect(dark).toContain('[data-sigapro-protocol-quick-actions="true"]');
    expect(dark).toContain('background-color: #142d43 !important');
    expect(dark).toContain('[data-sigapro-protocol-live-summary="true"] > button');
    expect(dark).toContain('color: #edf6ff !important');
    expect(dark).toContain('color: #a9dafa !important');
  });

  it("mantém abas de Protocolo, Financeiro e demais departamentos legíveis e navegáveis", () => {
    expect(tabStyles).toContain("overflow-x: auto !important");
    expect(tabStyles).toContain("flex: 0 0 185px !important");
    expect(dark).toContain('.sig-section-nav[data-premium-surface="navigation"]');
    expect(dark).toContain('.sig-nav-item[data-nav-active="true"]');
    expect(dark).toContain('.sig-nav-item[data-nav-active="false"]:hover');
    expect(dark).toContain(".sig-nav-item .sig-nav-item-label");
    expect(dark).toContain(".sig-nav-item .sig-nav-item-helper");
    expect(dark).toContain('sig-protocol-section-nav > div::-webkit-scrollbar-thumb');
    expect(dark).toContain('sig-finance-section-nav > div::-webkit-scrollbar-thumb');
  });

  it("diferencia ações habilitadas e bloqueadas no SEI sem liberar permissões", () => {
    expect(workspace).toContain('data-sigapro-process-bulk-actions="true"');
    expect(workspace).toContain('data-has-selection={selectedCount > 0 ? "true" : "false"}');
    expect(workspace).toContain('disabled={selectedCount === 0 || bulkBusy || !showSensitiveDetails}');
    expect(dark).toContain('.sig-workspace-actions[data-sigapro-process-bulk-actions="true"]');
    expect(dark).toContain('.sig-workspace-action:not(:disabled)');
    expect(dark).toContain('.sig-workspace-action:disabled');
    expect(dark).toContain(".sig-workspace-action-primary:not(:disabled)");
    expect(dark).toContain(".sig-workspace-action-green:not(:disabled)");
    expect(dark).toContain(".sig-workspace-chip.is-active:not(:disabled)");
    expect(dark).toContain(".sig-workspace-chip:disabled");
    expect(dark).not.toContain("pointer-events: none !important");
  });

  it("corrige também livro financeiro, abertura de protocolo, lista e cards compartilhados", () => {
    expect(finance).toContain('.sig-finance-ledger__row');
    expect(dark).toContain(".sig-finance-ledger__row:nth-child(even)");
    expect(dark).toContain('.sig-finance-ledger__status[data-finance-evidence="reported"]');
    expect(dark).toContain('.sig-finance-ledger__status[data-finance-evidence="simulation"]');
    expect(dark).toContain('[data-sigapro-protocol-intro="premium-v2"]');
    expect(dark).toContain('[data-sigapro-protocol-queue-list="true"]');
    expect(dark).toContain('.sig-page-header[data-sigapro-operational-header="premium-v3"]');
    expect(dark).toContain('.sig-metric-card)[data-premium-surface="metric"]');
  });

  it("acompanha o topbar: pesquisar escuro nos dois temas sem tocar na busca ou no destino", () => {
    expect(portal).toContain('data-search-surface={inverseMainTheme ? "light" : "dark"}');
    expect(portal).not.toContain('data-search-surface="dark"');
    expect(portal).toContain('aria-label="Busca global"');
    expect(portal).toContain("onClick={() => setCommandOpen(true)}");
  });

  it("todas as superfícies revisadas alcançam ao menos 4,5:1 de contraste", () => {
    const palette = [
      ["#edf6ff", "#142d43"], // Protocol heading
      ["#a9dafa", "#142d43"], // Protocol eyebrow
      ["#d1e1f0", "#213e56"], // KPI subtext
      ["#f7fbff", "#203e56"], // Inactive tab
      ["#d2e1ef", "#203e56"], // Tab helper
      ["#ffffff", "#115982"], // Active tab
      ["#c0d0df", "#20384e"], // Disabled action, still readable
      ["#e7f4ff", "#172e45"], // Toolbar label
      ["#a9c5d9", "#1c354b"], // Disabled filter
      ["#f3f8ff", "#132c44"], // Process row text
      ["#c9dcec", "#18354d"], // Process row secondary
      ["#ffffff", "#1a354d"], // Dark KPI value
      ["#d3e5f4", "#1a354d"], // Dark KPI helper
      ["#e2fff1", "#175341"], // Bank verified
      ["#fff1d5", "#533d1f"], // Bank pending
      ["#c6e1f2", "#1c3e58"], // Protocol title helper
    ] as const;
    for (const [ink, surface] of palette) {
      expect(contrast(ink, surface), ink + " / " + surface).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("não altera semântica, topbar estrutural ou fluxo de dados", () => {
    expect(dark).not.toContain("display: none !important");
    expect(dark).not.toContain("visibility: hidden !important");
    expect(dark).not.toContain("window.location");
    expect(dark).not.toContain("sig-premium-topbar");
    expect(protocol).toContain('onClick={() => setSection("fila")}');
    expect(protocol).toContain('onClick={() => setSection("pagamentos")}');
  });
});
