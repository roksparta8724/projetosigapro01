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

  it("PRESERVA o cabeçalho institucional superior original, sem redesenhá-lo", () => {
    expect(frame).toContain('data-sigapro-compact-header={compactHeader ? "true" : "false"}');
    expect(frame).toContain('border-b border-white/10 bg-[linear-gradient(90deg');
    expect(frame).toContain('InstitutionalLogo');
    expect(frame).not.toContain('data-sigapro-institutional-header="single"');
  });

  it("preenche o CARD INFERIOR do Protocolo com dados reais e ações de navegação", () => {
    expect(protocol).toContain('data-sigapro-protocol-quick-actions="true"');
    expect(protocol).toContain('data-sigapro-protocol-live-summary="true"');
    expect(protocol).toContain('Protocolo e triagem');
    expect(protocol).toContain('remoteSyncedForCurrentUser ? processes.length : "—"');
    expect(protocol).toContain('remoteSyncedForCurrentUser ? queueItems.length : "—"');
    expect(protocol).toContain('remoteSyncedForCurrentUser ? incompleteProtocols.length : "—"');
    expect(protocol).toContain('preprotocolPaymentsLoading || Boolean(preprotocolPaymentsError)');
    expect(protocol).toContain('pendingProtocolPayments.length + pendingPreprotocolPayments.length');
    for (const tab of ["todos","fila","documentos","pagamentos"]) {
      expect(protocol).toContain(`onClick={() => setSection("${tab}")}`);
    }
    expect(protocol).toContain('Protocolar no balcão');
    expect(protocol).not.toContain('<PageHeader\n          eyebrow="Operação de protocolo"');
    expect(protocol).toContain('<PageHeader\n            eyebrow="Administração municipal"');
    expect(roleCss).toContain('[data-sigapro-protocol-quick-actions="true"]');
  });

  it("não cria cards de origem falsos, resumo duplicado ou guia fictícia", () => {
    expect(protocol).not.toContain('title="Leitura da recepção"');
    expect(protocol).not.toContain("sig-dark-panel");
    expect(protocol).toContain('data-sigapro-protocol-empty-channel="balcao"');
    expect(protocol).toContain('data-sigapro-protocol-empty-channel="online"');
    expect(protocol).toContain('data-sigapro-protocol-empty-history="true"');
    expect(protocol).toContain('data-sigapro-protocol-guide-empty="true"');
    expect(protocol).toContain('Guia ainda não emitida');
    expect(protocol).toContain('Sem guia emitida');
    expect(protocol).toContain('Aguardando emissão');
    expect(protocol).not.toContain('formatCurrency(getProcessPaymentGuides(matchedProcess, tenantSettings)[0]?.amount || 0)');
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
