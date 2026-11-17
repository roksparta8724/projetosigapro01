// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ProcessDetailHero } from "@/components/platform/ProcessDetailHero";

const read = (file: string) => readFileSync(file, "utf8");
const luminance = (hex: string) => {
  const values = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
};
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) /
  (Math.min(luminance(a), luminance(b)) + .05);

describe("SIGAPRO — um só cabeçalho institucional, sem cards azuis aninhados", () => {
  const roleCss = read("src/styles/sigapro-role-blue-contrast.css");
  const detailCss = read("src/components/platform/ProcessDetailHero.css");
  const frame = read("src/components/platform/PortalFrame.tsx");
  const protocol = read("src/pages/saas/ProtocolDeskPage.tsx");

  it("mantém exatamente um banner institucional com identidade e brasão na mesma faixa", () => {
    expect(frame).toContain('data-sigapro-institutional-header="single"');
    expect(frame).toContain('lg:flex-row lg:items-center lg:justify-between');
    expect(frame).not.toContain('border-b border-white/10 bg-[linear-gradient(90deg');
    expect(frame).toContain('InstitutionalLogo');
  });

  it("substitui o segundo grande card azul do Protocolo por uma barra clara de ação", () => {
    expect(protocol).toContain('data-sigapro-protocol-quick-actions="true"');
    expect(protocol).toContain('Recepção, conferência documental e despacho inicial');
    expect(protocol).toContain('Protocolar no balcão');
    expect(protocol).not.toContain('<PageHeader');
    expect(roleCss).toContain('[data-sigapro-protocol-quick-actions="true"]');
  });

  it("usa superfície CLARA, com texto escuro, nas métricas e cabeçalhos secundários", () => {
    expect(roleCss).toContain('.sig-page-header[data-premium-surface="header"][data-premium-role-blue="header"]');
    expect(roleCss).toContain('background: linear-gradient(180deg,#ffffff 0%,#f3f8fc 100%) !important');
    expect(roleCss).toContain('[data-premium-role-blue="metric"]');
    expect(roleCss).toContain('background: linear-gradient(180deg,#ffffff 0%,#f5f9fc 100%) !important');
    expect(contrast("#12324b", "#f3f8fc")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#315c79", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("preserva dados do processo como duas colunas editoriais, SEM minicards coloridos", () => {
    const { container } = render(<ProcessDetailHero
      protocol="PM-2026-00001" subject="Licenciamento de imóvel"
      municipality="Prefeitura de Campo Limpo Paulista"
      processType="Aprovação" currentStage="Análise Urbanística"
      responsibleUnit="Urbanismo" ownerName="Proprietário"
      assignedTo="Técnico" deadline="Prazo a confirmar" visiblePendingCount={1}
    />);
    expect(screen.getByRole("heading", { name: "Licenciamento de imóvel" })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-process-detail-hero-mini-card]')).toHaveLength(2);
    expect(detailCss).toContain('background: transparent !important');
    expect(detailCss).toContain('box-shadow: none !important');
    expect(detailCss).toContain('.sig-detail-hero-fact + .sig-detail-hero-fact');
    expect(detailCss).toContain('border-top: 1px solid #d2e1ec');
    expect(detailCss).toContain('background: linear-gradient(180deg,#ffffff 0%,#f3f8fc 100%) !important');
    expect(contrast("#183951", "#f3f8fc")).toBeGreaterThanOrEqual(4.5);
  });
});
